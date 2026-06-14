"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import {
  AbsorbResult,
  ApiError,
  ExpansionItemDetail,
  ExpansionSource,
  expansionApi,
} from "@/lib/api";
import {
  extensionTypeLabel,
  reviewStatusTone,
  sourceStatusTone,
  sourceTypeLabel,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

const LIBRARY_PAGE_SIZE = 8;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STEPS = [
  { title: "提交资料", desc: "上传或粘贴外部资料" },
  { title: "解析与理解", desc: "AI 切块 + 向量化" },
  { title: "匹配知识节点", desc: "对齐最相关的核心节点" },
  { title: "提取增量内容", desc: "生成扩展条目" },
  { title: "生成审核任务", desc: "进入人工审核闸口" },
];

type Phase = "idle" | "uploading" | "absorbing" | "done" | "error";
type Mode = "upload" | "paste";

const pct = (v: number) => Math.round((v ?? 0) * 100);

export function NoteEvolutionPage() {
  const [mode, setMode] = useState<Mode>("upload");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [absorb, setAbsorb] = useState<AbsorbResult | null>(null);
  const [items, setItems] = useState<ExpansionItemDetail[]>([]);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    title.trim().length > 0 &&
    (mode === "upload" ? !!file : text.trim().length > 0) &&
    phase !== "uploading" &&
    phase !== "absorbing";

  async function handleSubmit() {
    if (!canSubmit) return;
    setPhase("uploading");
    setAbsorb(null);
    setItems([]);
    setStatusMsg("上传中…");
    try {
      const uploadFile =
        mode === "upload" && file
          ? file
          : new File([text], `${title.trim() || "note"}.txt`, { type: "text/plain" });

      const up = await expansionApi.uploadSource(uploadFile, {
        title: title.trim(),
        source_type: "classmate_note",
        submitted_by: author.trim() || undefined,
        visibility: "team",
      });

      setPhase("absorbing");
      setStatusMsg("AI 解析与吸收中（切块、向量化、对齐节点）…");
      const res = await expansionApi.absorb(up.source_id);
      setAbsorb(res);

      // 拉取本次来源生成的扩展条目（列表按 source_id 客户端过滤），再取详情拿对齐节点
      const all = await expansionApi.items({ reviewStatus: "pending" });
      const mine = all.filter((it) => it.source_id === up.source_id);
      const details = await Promise.all(mine.map((it) => expansionApi.item(it.id)));
      setItems(details);

      setPhase("done");
      setStatusMsg(null);
      setRefreshSignal((n) => n + 1); // 通知下方资料列表刷新
    } catch (e) {
      setPhase("error");
      setStatusMsg(e instanceof ApiError ? `处理失败：${e.message}` : "处理失败");
    }
  }

  const activeIndex =
    phase === "idle" || phase === "uploading"
      ? 0
      : phase === "absorbing"
        ? 1
        : phase === "done"
          ? 4
          : 0;

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <NoteHeader />
        <StepBar activeIndex={activeIndex} done={phase === "done"} />
        <SubmitNote
          mode={mode}
          title={title}
          author={author}
          text={text}
          file={file}
          phase={phase}
          statusMsg={statusMsg}
          canSubmit={canSubmit}
          inputRef={inputRef}
          onMode={setMode}
          onTitle={setTitle}
          onAuthor={setAuthor}
          onText={setText}
          onFile={setFile}
          onSubmit={handleSubmit}
        />
        {absorb && <AnalysisResult absorb={absorb} items={items} />}
        <ExpansionLibrary refreshSignal={refreshSignal} />
        <p className="py-5 text-center text-[12px] text-slate-400">
          外部资料仅进入扩展层，必须经人工审核后方可演进核心节点版本
        </p>
      </section>
      <NoteAside />
    </main>
  );
}

function NoteHeader() {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">知识扩展</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          上传外部资料（笔记 / 案例 / 文档），智能匹配核心知识节点，沉淀为可复用的知识扩展
        </p>
      </div>
    </header>
  );
}

function StepBar({ activeIndex, done }: { activeIndex: number; done: boolean }) {
  return (
    <Card className="mt-7 px-7 py-6">
      <div className="grid grid-cols-5 gap-4">
        {STEPS.map((step, index) => {
          const active = index === activeIndex;
          const isDone = done ? true : index < activeIndex;
          return (
            <div key={step.title} className="relative flex items-center">
              {index > 0 && <span className="absolute right-[58%] top-[20px] h-px w-full bg-line" />}
              <div className="relative z-10 flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black",
                    active ? "brand-gradient text-white" : isDone ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                  )}
                >
                  {isDone && !active ? "✓" : index + 1}
                </span>
                <div>
                  <div className={cn("text-[15px] font-black", active ? "text-brand" : "text-[#172452]")}>
                    {step.title}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-400">{step.desc}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SubmitNote({
  mode,
  title,
  author,
  text,
  file,
  phase,
  statusMsg,
  canSubmit,
  inputRef,
  onMode,
  onTitle,
  onAuthor,
  onText,
  onFile,
  onSubmit,
}: {
  mode: Mode;
  title: string;
  author: string;
  text: string;
  file: File | null;
  phase: Phase;
  statusMsg: string | null;
  canSubmit: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onMode: (m: Mode) => void;
  onTitle: (v: string) => void;
  onAuthor: (v: string) => void;
  onText: (v: string) => void;
  onFile: (f: File | null) => void;
  onSubmit: () => void;
}) {
  const busy = phase === "uploading" || phase === "absorbing";
  return (
    <Card className="mt-5 px-6 py-5">
      <h2 className="text-[18px] font-black text-ink">提交笔记</h2>
      <div className="mt-4 grid gap-6 xl:grid-cols-[0.9fr_1.25fr]">
        <div>
          <div className="flex gap-3">
            <button
              onClick={() => onMode("upload")}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg border px-4 text-[13px] font-bold",
                mode === "upload" ? "border-brand text-brand" : "border-line bg-white text-slate-500"
              )}
            >
              <Icon name="file-text" className="h-4 w-4" />
              上传文件
            </button>
            <button
              onClick={() => onMode("paste")}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg border px-4 text-[13px] font-bold",
                mode === "paste" ? "border-brand text-brand" : "border-line bg-white text-slate-500"
              )}
            >
              <Icon name="clipboard-check" className="h-4 w-4" />
              粘贴文本
            </button>
          </div>

          {mode === "upload" ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,.md,.pptx,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-4 flex h-[190px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#cdd6ff] bg-[#f8faff]"
              >
                <Icon name="upload-cloud" className="h-10 w-10 text-brand" />
                <div className="mt-4 text-[14px] font-black text-[#172452]">
                  {file ? file.name : "点击选择文件"}
                </div>
                <div className="mt-3 text-[12px] font-semibold text-slate-400">
                  支持 PDF、DOCX、XLSX、PPTX、TXT、MD 和图片
                </div>
              </button>
            </>
          ) : (
            <textarea
              value={text}
              onChange={(e) => onText(e.target.value)}
              placeholder="粘贴笔记 / 案例 / 文档原文…"
              className="mt-4 h-[190px] w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-medium leading-6 text-[#172452] outline-none placeholder:text-slate-400"
            />
          )}
        </div>

        <div className="grid content-start gap-5">
          <Field label="笔记标题" required>
            <input
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              placeholder="如：从0到1验证价值主张的3个关键动作"
              className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none placeholder:text-slate-400"
            />
          </Field>
          <Field label="笔记作者">
            <input
              value={author}
              onChange={(e) => onAuthor(e.target.value)}
              placeholder="如：李同学"
              className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none placeholder:text-slate-400"
            />
          </Field>
          <div className="flex items-center gap-4">
            {statusMsg && (
              <span className={cn("text-[12.5px] font-bold", phase === "error" ? "text-rose-500" : "text-brand")}>
                {statusMsg}
              </span>
            )}
            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className="brand-gradient ml-auto flex h-11 w-[200px] items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white shadow-soft disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Icon name="refresh" className="h-4 w-4 animate-spin" />
                  {phase === "uploading" ? "上传中…" : "分析中…"}
                </>
              ) : (
                <>
                  <Icon name="sparkles" className="h-4 w-4" />
                  开始分析
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1 text-[13px] font-bold text-[#172452]">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function AnalysisResult({ absorb, items }: { absorb: AbsorbResult; items: ExpansionItemDetail[] }) {
  // 去重后的对齐节点
  const matchedNodes = Array.from(
    new Map(
      items
        .filter((it) => it.aligned_node)
        .map((it) => [it.aligned_node!.id, { node: it.aligned_node!, score: it.alignment_score }])
    ).values()
  ).sort((a, b) => b.score - a.score);

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex items-center border-b border-line px-6 py-5">
        <h2 className="text-[18px] font-black text-ink">分析结果</h2>
        <span className="ml-3 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-600">
          分析完成
        </span>
        <a href="/review" className="ml-auto flex items-center gap-1.5 text-[13px] font-bold text-brand">
          去人工审核台
          <Icon name="chevron-right" className="h-4 w-4" />
        </a>
      </div>

      <div className="px-6 py-6">
        {/* 吸收统计 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "切块", value: absorb.chunk_count },
            { label: "已向量化", value: absorb.embedded_count },
            { label: "扩展条目", value: absorb.item_count },
            { label: "审核任务", value: absorb.review_task_count },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-[#f8faff] px-4 py-3 text-center">
              <div className="text-[24px] font-black tracking-[-0.02em] text-ink">{s.value}</div>
              <div className="mt-1 text-[12px] font-medium text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">向量后端：{absorb.vector_backend}</p>

        {/* 匹配的知识节点 */}
        <h3 className="mt-7 text-[15px] font-black text-ink">匹配的知识节点（{matchedNodes.length}）</h3>
        {matchedNodes.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-400">本次未对齐到核心节点，将作为新增扩展进入审核。</p>
        ) : (
          <div className="mt-4 space-y-4">
            {matchedNodes.map(({ node, score }) => (
              <div
                key={node.id}
                className="grid items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-[0_8px_26px_rgba(30,58,138,0.035)] md:grid-cols-[1fr_200px_90px]"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-brand">
                    <Icon name="git-merge" className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-[15px] font-black text-[#172452]">{node.node_name}</div>
                    <div className="mt-1 text-[12px] font-semibold text-slate-400">
                      {node.node_category || "未分类"} · {node.version}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[12px] font-bold text-[#172452]">匹配度 {pct(score)}%</div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct(score)}%` }} />
                  </div>
                </div>
                <span className="justify-self-start rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-600">
                  {score >= 0.7 ? "强相关" : "相关"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 提取的增量条目 */}
        <h3 className="mt-7 text-[15px] font-black text-ink">提取的增量内容（{items.length}）</h3>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {items.map((it) => {
            const st = reviewStatusTone[it.review_status] ?? {
              label: it.review_status,
              tone: "bg-slate-100 text-slate-500",
            };
            return (
              <div key={it.id} className="rounded-2xl bg-[#f8faff] px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#f0edff] px-2 py-0.5 text-[11px] font-bold text-brand">
                    {extensionTypeLabel(it.extension_type)}
                  </span>
                  <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", st.tone)}>{st.label}</span>
                </div>
                <h4 className="mt-2 text-[14px] font-black text-[#172452]">{it.title}</h4>
                {it.summary && (
                  <p className="mt-1.5 text-[12.5px] font-medium leading-6 text-[#405070]">{it.summary}</p>
                )}
                {it.key_points.length > 0 && (
                  <ul className="mt-2 space-y-1.5 text-[12px] font-medium leading-5 text-[#405070]">
                    {it.key_points.map((kp, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                        {kp}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl bg-[#fbfcff] px-5 py-5">
          <h3 className="text-[15px] font-black text-ink">下一步</h3>
          <p className="mt-2 text-[13px] font-medium leading-6 text-[#405070]">
            以上增量内容已生成 {absorb.review_task_count} 个审核任务，等待人工审核。审核通过后可触发对齐节点的版本演进。
          </p>
          <div className="mt-4 flex justify-end">
            <a
              href="/review"
              className="brand-gradient flex h-10 w-[190px] items-center justify-center gap-2 rounded-lg text-[13px] font-bold text-white shadow-soft"
            >
              <Icon name="send" className="h-4 w-4" />
              前往人工审核
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

function NoteAside() {
  const [sources, setSources] = useState<ExpansionSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    expansionApi
      .sources()
      .then((d) => !cancelled && setSources(d.slice(0, 8)))
      .catch(() => !cancelled && setSources([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="flex h-screen w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">知识扩展助手</div>
            <div className="text-[11px] text-slate-400">基于核心方法论的知识扩展助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
        </div>
        <p className="mt-4 text-[13px] font-semibold leading-6 text-[#172452]">提交笔记后，系统将：</p>
        <ul className="mt-3 space-y-2 text-[12px] font-semibold leading-6 text-slate-600">
          {["切块并向量化笔记内容", "对齐最相关的核心知识节点", "提取观点/案例/场景等增量条目", "自动生成人工审核任务"].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {t}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-ink">最近处理记录</h2>
        </div>
        <div className="mt-5 space-y-4">
          {loading && <p className="text-[12px] text-slate-400">加载中…</p>}
          {!loading && sources.length === 0 && (
            <p className="text-[12px] text-slate-400">暂无记录</p>
          )}
          {sources.map((s) => (
            <div key={s.id} className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-black text-[#172452]">{s.title}</div>
                <div className="mt-1 text-[12px] text-slate-500">{s.submitted_by || "—"}</div>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                {s.status}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}

// 外部资料列表：知识扩展页内直接管理已上传的外部资料（吸收 / 去审核 / 状态跟踪）。
function ExpansionLibrary({ refreshSignal }: { refreshSignal: number }) {
  const [sources, setSources] = useState<ExpansionSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await expansionApi.sources();
      setSources(
        [...data].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载资料失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [refreshSignal]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.title.toLowerCase().includes(q));
  }, [sources, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIBRARY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * LIBRARY_PAGE_SIZE,
    safePage * LIBRARY_PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [query]);

  async function runAction(s: ExpansionSource) {
    if (busyId) return;
    if (s.status === "absorbed" || s.status === "pending_review") {
      window.location.href = "/review";
      return;
    }
    if (s.status === "reviewed") return;
    setBusyId(s.id);
    setToast(null);
    try {
      const res = await expansionApi.absorb(s.id);
      setToast(
        res.review_task_count > 0
          ? `已进入人工审核：${res.chunk_count} 切块 → ${res.item_count} 条目 / ${res.review_task_count} 个审核任务`
          : `未抽取到可审核条目：${res.chunk_count} 切块 / ${res.item_count} 条目，请确认资料是否为扫描件或内容是否可解析`
      );
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? `操作失败：${e.message}` : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="text-[16px] font-black text-ink">外部资料</h2>
        <span className="text-[13px] text-slate-500">共 {filtered.length} 条</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex h-9 w-[240px] items-center gap-2 rounded-lg border border-line bg-white px-3">
            <Icon name="search" className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
              placeholder="搜索资料名称..."
            />
          </div>
          <button
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-bold text-[#172452] hover:text-brand"
          >
            <Icon name="refresh" className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>

      {toast && (
        <div className="mx-5 mt-4 rounded-xl border border-brand/30 bg-[#f5f3ff] px-4 py-2.5 text-[12.5px] font-semibold text-brand">
          {toast}
        </div>
      )}

      <div className="px-5 pb-5 pt-4">
        <div className="grid grid-cols-[1.8fr_0.9fr_0.7fr_1fr_0.8fr_0.9fr] rounded-t-xl bg-[#f7f9fd] px-3 py-3 text-[12px] font-bold text-slate-500">
          <span>资料名称</span>
          <span>类型</span>
          <span>上传人</span>
          <span>上传时间</span>
          <span>状态</span>
          <span>操作</span>
        </div>

        {loading && <p className="py-10 text-center text-[13px] text-slate-400">加载中…</p>}
        {error && !loading && <p className="py-10 text-center text-[13px] text-rose-500">{error}</p>}
        {!loading && !error && pageItems.length === 0 && (
          <p className="py-10 text-center text-[13px] text-slate-400">暂无外部资料，请在上方提交</p>
        )}

        <div className="divide-y divide-line">
          {!loading &&
            !error &&
            pageItems.map((s) => (
              <ExpansionRow
                key={s.id}
                source={s}
                busy={busyId === s.id}
                disabled={busyId !== null && busyId !== s.id}
                onAction={() => runAction(s)}
              />
            ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <LibPageBtn disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <Icon name="chevron-left" className="h-4 w-4" />
            </LibPageBtn>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  "h-9 w-9 rounded-lg border text-[13px] font-semibold",
                  p === safePage ? "border-brand text-brand" : "border-line bg-white text-slate-600"
                )}
              >
                {p}
              </button>
            ))}
            <LibPageBtn disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              <Icon name="chevron-right" className="h-4 w-4" />
            </LibPageBtn>
          </div>
        )}
      </div>
    </Card>
  );
}

function ExpansionRow({
  source,
  busy,
  disabled,
  onAction,
}: {
  source: ExpansionSource;
  busy: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  const st = sourceStatusTone[source.status] ?? {
    label: source.status,
    tone: "bg-slate-100 text-slate-500",
  };
  const size = typeof source.meta?.size === "number" ? (source.meta.size as number) : null;

  // 外部资料行动作：uploaded→吸收；extraction_empty→重新吸收；absorbed/pending_review→去审核；reviewed→已完成。
  let actionLabel = "吸收";
  let actionDisabled = false;
  if (source.status === "absorbed" || source.status === "pending_review") {
    actionLabel = "去审核";
  } else if (source.status === "reviewed") {
    actionLabel = "已完成";
    actionDisabled = true;
  } else if (source.status === "rejected") {
    actionLabel = "已驳回";
    actionDisabled = true;
  } else if (source.status === "extraction_empty") {
    actionLabel = "重新吸收";
  }

  return (
    <div className="grid grid-cols-[1.8fr_0.9fr_0.7fr_1fr_0.8fr_0.9fr] items-center px-3 py-3.5 text-[13px]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-400 text-white">
          <Icon name="file-text" className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{source.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{fmtSize(size)}</div>
        </div>
      </div>
      <span className="w-fit rounded-full bg-orange-50 px-2.5 py-1 text-[12px] font-semibold text-orange-500">
        {sourceTypeLabel(source.source_type)}
      </span>
      <span className="text-slate-600">{source.submitted_by || "—"}</span>
      <span className="text-slate-600">{fmtTime(source.created_at)}</span>
      <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", st.tone)}>
        {st.label}
      </span>
      <div>
        <button
          onClick={onAction}
          disabled={disabled || actionDisabled || busy}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-bold transition-colors",
            actionDisabled
              ? "cursor-default text-slate-400"
              : "border border-brand/40 text-brand hover:bg-[#f5f3ff] disabled:opacity-40"
          )}
        >
          {busy ? (
            <>
              <Icon name="refresh" className="h-3.5 w-3.5 animate-spin" />
              处理中
            </>
          ) : (
            actionLabel
          )}
        </button>
      </div>
    </div>
  );
}

function LibPageBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-slate-500 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
