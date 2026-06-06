"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import { Card } from "@/components/card";
import { useAuth } from "@/components/auth-context";
import {
  ApiError,
  ExpansionSource,
  MethodologySource,
  expansionApi,
  methodologyApi,
  pollTask,
} from "@/lib/api";
import { sourceStatusTone } from "@/lib/presentation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const processSteps = [
  { icon: "upload-cloud", title: "上传资料", desc: "选择文件上传" },
  { icon: "file-text", title: "文本解析", desc: "提取文字内容" },
  { icon: "layout-grid", title: "语义分块", desc: "智能切分文本" },
  { icon: "boxes", title: "向量入库", desc: "存入向量数据库" },
  { icon: "target", title: "节点抽取", desc: "提取知识节点" },
  { icon: "users", title: "人工审核", desc: "审核后正式入库" },
];

type Layer = "core" | "expansion";

interface MaterialRow {
  id: string;
  title: string;
  sourceType: string;
  uploader: string;
  createdAt: string;
  status: string;
  layer: Layer;
  size: number | null;
}

type LayerTab = "all" | Layer;

const LAYER_TABS: { key: LayerTab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "core", label: "核心方法论" },
  { key: "expansion", label: "外部资料" },
];

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

function toRow(s: MethodologySource | ExpansionSource, layer: Layer): MaterialRow {
  const size = typeof s.meta?.size === "number" ? (s.meta.size as number) : null;
  return {
    id: s.id,
    title: s.title,
    sourceType: s.source_type,
    uploader: layer === "expansion" ? (s as ExpansionSource).submitted_by || "—" : "—",
    createdAt: s.created_at,
    status: s.status,
    layer,
    size,
  };
}

export function DataCenterPage() {
  const { user } = useAuth();
  const canManageCore = !!user?.is_super_admin;
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<LayerTab>(canManageCore ? "all" : "expansion");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
      setError(null);
    try {
      const [core, exp] = await Promise.all([
        canManageCore ? methodologyApi.sources() : Promise.resolve([]),
        expansionApi.sources(),
      ]);
      const merged = [
        ...core.map((s) => toRow(s, "core")),
        ...exp.map((s) => toRow(s, "expansion")),
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setRows(merged);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载资料失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [canManageCore]);

  useEffect(() => {
    if (!canManageCore && tab !== "expansion") {
      setTab("expansion");
    }
  }, [canManageCore, tab]);

  const stats = useMemo(() => {
    const s = { total: rows.length, done: 0, processing: 0, pendingReview: 0, uploaded: 0, failed: 0 };
    for (const r of rows) {
      if (r.status === "processed" || r.status === "kernel_built" || r.status === "reviewed") s.done++;
      else if (r.status === "pending_review" || r.status === "absorbed") s.pendingReview++;
      else if (r.status === "processing") s.processing++;
      else if (r.status === "uploaded" || r.status === "extraction_empty") s.uploaded++;
      else if (r.status === "failed") s.failed++;
    }
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.layer !== tab) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  async function runAction(row: MaterialRow) {
    if (busyId) return;
    if (row.layer === "expansion" && ["absorbed", "pending_review"].includes(row.status)) {
      window.location.href = "/review";
      return;
    }
    setBusyId(row.id);
    setToast(null);
    try {
      if (row.layer === "expansion") {
        const res = await expansionApi.absorb(row.id);
        setToast(
          res.review_task_count > 0
            ? `已进入人工审核：${res.chunk_count} 切块 → ${res.item_count} 条目 / ${res.review_task_count} 个审核任务`
            : `未抽取到可审核条目：${res.chunk_count} 切块 / ${res.item_count} 条目，请确认资料是否为扫描件或内容是否可解析`
        );
      } else if (row.status === "uploaded") {
        const { task_id } = await methodologyApi.process(row.id);
        setToast("解析中…");
        await pollTask(task_id, { onProgress: (t) => setToast(`解析中… ${t.progress}%`) });
        setToast("解析完成。");
      } else {
        const { task_id } = await methodologyApi.buildKernel(row.id);
        setToast("建底座中…（LLM 抽取节点，可能较久）");
        await pollTask(task_id, {
          timeoutMs: 90 * 60 * 1000,
          onProgress: (t) => setToast(`建底座中… ${t.progress}%`),
        });
        setToast("底座构建完成。");
      }
      await load();
    } catch (e) {
      setToast(e instanceof ApiError ? `操作失败：${e.message}` : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <DataHeader
          query={query}
          onQueryChange={setQuery}
          onRefresh={load}
          canManageCore={canManageCore}
        />
        <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <UploadCard canManageCore={canManageCore} onUploaded={load} onToast={setToast} />
          <ProcessFlow />
        </div>
        {toast && (
          <div className="mt-4 rounded-xl border border-brand/30 bg-[#f5f3ff] px-4 py-2.5 text-[12.5px] font-semibold text-brand">
            {toast}
          </div>
        )}
        <MaterialOverview stats={stats} />
        <MaterialLibrary
          rows={pageItems}
          total={filtered.length}
          loading={loading}
          error={error}
          tab={tab}
          canManageCore={canManageCore}
          onTab={setTab}
          busyId={busyId}
          onAction={runAction}
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </section>
    </main>
  );
}

function DataHeader({
  query,
  onQueryChange,
  onRefresh,
  canManageCore,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onRefresh: () => void;
  canManageCore: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[26px] font-black tracking-[-0.03em] text-ink">资料中心</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          {canManageCore
            ? "上传课程资料与外部资料，系统自动解析并转化为结构化知识资产"
            : "上传企业案例、同学笔记与外部资料，系统吸收后进入审核与知识扩展流程"}
        </p>
      </div>
      <div className="dashboard-card flex h-11 w-[360px] items-center gap-3 rounded-xl px-4">
        <Icon name="search" className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          placeholder="搜索资料名称..."
        />
      </div>
      <button
        onClick={onRefresh}
        className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-[#172452] hover:text-brand"
      >
        <Icon name="refresh" className="h-4 w-4" />
        刷新
      </button>
    </header>
  );
}

function UploadCard({
  canManageCore,
  onUploaded,
  onToast,
}: {
  canManageCore: boolean;
  onUploaded: () => void;
  onToast: (m: string) => void;
}) {
  const [layer, setLayer] = useState<Layer>(canManageCore ? "core" : "expansion");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    onToast(`上传中：${file.name}`);
    try {
      if (canManageCore && layer === "core") {
        const r = await methodologyApi.uploadSource(file);
        onToast(`已上传核心资料「${r.title}」，点击列表「解析」开始处理。`);
      } else {
        const r = await expansionApi.uploadSource(file);
        onToast(`已上传外部资料「${r.title}」，点击列表「吸收」生成审核任务。`);
      }
      onUploaded();
    } catch (e) {
      onToast(e instanceof ApiError ? `上传失败：${e.message}` : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!canManageCore && layer !== "expansion") {
      setLayer("expansion");
    }
  }, [canManageCore, layer]);

  return (
    <Card className="min-h-[226px] p-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.pptx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#beb7ff] bg-gradient-to-br from-white to-[#fbfaff] p-5">
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-white p-1 text-[12px] font-bold shadow-sm">
          {(canManageCore ? (["core", "expansion"] as Layer[]) : (["expansion"] as Layer[])).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                layer === l ? "bg-brand text-white" : "text-slate-500 hover:text-brand"
              )}
            >
              {l === "core" ? "核心方法论" : "外部资料"}
            </button>
          ))}
        </div>
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f2efff] text-brand ring-8 ring-[#f8f6ff]">
            <Icon name="upload-cloud" className="h-7 w-7" />
          </div>
          <p className="mx-auto mt-3 max-w-[330px] text-[12px] leading-6 text-slate-400">
            支持 PDF、DOCX、PPTX、TXT、MD，将上传到「{layer === "core" ? "核心方法论" : "外部资料"}」池
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="brand-gradient mt-3 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13px] font-semibold text-white shadow-soft disabled:opacity-50"
          >
            <Icon name="folder" className="h-4 w-4" />
            {uploading ? "上传中…" : "选择文件"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function ProcessFlow() {
  return (
    <Card className="min-h-[226px] px-6 py-5">
      <h2 className="text-[15px] font-bold text-ink">资料处理流程</h2>
      <div className="mt-8 flex items-start justify-between">
        {processSteps.map((step, index) => (
          <div key={step.title} className="flex flex-1 items-start">
            <div className="flex flex-1 flex-col items-center text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f1ff] text-brand">
                <Icon name={step.icon} className="h-5 w-5" />
              </div>
              <div className="mt-3 text-[13px] font-bold text-ink">{step.title}</div>
              <div className="mt-1 text-[11px] text-slate-400">{step.desc}</div>
            </div>
            {index < processSteps.length - 1 && (
              <div className="mt-5 flex w-8 shrink-0 items-center justify-center text-slate-300">
                <Icon name="chevron-right" className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MaterialOverview({
  stats,
}: {
  stats: { total: number; done: number; processing: number; pendingReview: number; uploaded: number; failed: number };
}) {
  const items = [
    { label: "资料总数", value: stats.total, tone: "text-ink" },
    { label: "已入库", value: stats.done, tone: "text-emerald-600" },
    { label: "处理中", value: stats.processing, tone: "text-orange-500" },
    { label: "待审核", value: stats.pendingReview, tone: "text-violet-600" },
    { label: "未处理", value: stats.uploaded, tone: "text-slate-500" },
    { label: "失败", value: stats.failed, tone: "text-rose-500" },
  ];
  return (
    <div className="mt-5">
      <Card className="px-6 py-5">
        <h2 className="text-[15px] font-bold text-ink">资料概览</h2>
        <div className="mt-5 grid grid-cols-6 divide-x divide-line">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <div className={cn("text-[26px] font-black tracking-[-0.03em]", item.tone)}>
                {item.value}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">{item.label}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MaterialLibrary({
  rows,
  total,
  loading,
  error,
  tab,
  canManageCore,
  onTab,
  busyId,
  onAction,
  page,
  totalPages,
  onPageChange,
}: {
  rows: MaterialRow[];
  total: number;
  loading: boolean;
  error: string | null;
  tab: LayerTab;
  canManageCore: boolean;
  onTab: (t: LayerTab) => void;
  busyId: string | null;
  onAction: (r: MaterialRow) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        {LAYER_TABS.filter((t) => canManageCore || t.key === "expansion").map((t) => (
          <button
            key={t.key}
            onClick={() => onTab(t.key)}
            className={cn(
              "h-9 rounded-lg px-4 text-[13px] font-semibold",
              t.key === tab
                ? "brand-gradient text-white shadow-soft"
                : "border border-line bg-white text-slate-600 hover:border-brand hover:text-brand"
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[13px] text-slate-500">共 {total} 条</span>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="grid grid-cols-[1.8fr_0.8fr_0.7fr_1fr_0.8fr_0.9fr] rounded-t-xl bg-[#f7f9fd] px-3 py-3 text-[12px] font-bold text-slate-500">
          <span>资料名称</span>
          <span>类型</span>
          <span>上传人</span>
          <span>上传时间</span>
          <span>状态</span>
          <span>操作</span>
        </div>

        {loading && <p className="py-10 text-center text-[13px] text-slate-400">加载中…</p>}
        {error && !loading && <p className="py-10 text-center text-[13px] text-rose-500">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="py-10 text-center text-[13px] text-slate-400">暂无资料，请先上传</p>
        )}

        <div className="divide-y divide-line">
          {!loading &&
            !error &&
            rows.map((row) => (
              <MaterialTableRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                disabled={busyId !== null && busyId !== row.id}
                onAction={() => onAction(row)}
              />
            ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <PageBtn disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <Icon name="chevron-left" className="h-4 w-4" />
            </PageBtn>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={cn(
                  "h-9 w-9 rounded-lg border text-[13px] font-semibold",
                  p === page ? "border-brand text-brand" : "border-line bg-white text-slate-600"
                )}
              >
                {p}
              </button>
            ))}
            <PageBtn disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
              <Icon name="chevron-right" className="h-4 w-4" />
            </PageBtn>
          </div>
        )}
      </div>
    </Card>
  );
}

function MaterialTableRow({
  row,
  busy,
  disabled,
  onAction,
}: {
  row: MaterialRow;
  busy: boolean;
  disabled: boolean;
  onAction: () => void;
}) {
  const st = sourceStatusTone[row.status] ?? { label: row.status, tone: "bg-slate-100 text-slate-500" };

  // 行动作文案：外部资料 uploaded/extraction_empty→吸收；pending_review→去审核。
  let actionLabel = "";
  let actionDisabled = false;
  if (row.layer === "expansion") {
    if (row.status === "absorbed" || row.status === "pending_review") {
      actionLabel = "去审核";
    } else if (row.status === "reviewed") {
      actionLabel = "已完成";
      actionDisabled = true;
    } else if (row.status === "rejected") {
      actionLabel = "已驳回";
      actionDisabled = true;
    } else if (row.status === "extraction_empty") {
      actionLabel = "重新吸收";
    } else {
      actionLabel = "吸收";
    }
  } else if (row.status === "uploaded") {
    actionLabel = "解析";
  } else if (row.status === "processed") {
    actionLabel = "建底座";
  } else if (row.status === "kernel_built") {
    actionLabel = "已完成";
    actionDisabled = true;
  } else {
    actionLabel = "解析";
  }

  return (
    <div className="grid grid-cols-[1.8fr_0.8fr_0.7fr_1fr_0.8fr_0.9fr] items-center px-3 py-3.5 text-[13px]">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
            row.layer === "core" ? "bg-brand" : "bg-orange-400"
          )}
        >
          <Icon name="file-text" className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink">{row.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{fmtSize(row.size)}</div>
        </div>
      </div>
      <span
        className={cn(
          "w-fit rounded-full px-2.5 py-1 text-[12px] font-semibold",
          row.layer === "core" ? "bg-[#f0edff] text-brand" : "bg-orange-50 text-orange-500"
        )}
      >
        {row.layer === "core" ? "核心方法" : "外部资料"}
      </span>
      <span className="text-slate-600">{row.uploader}</span>
      <span className="text-slate-600">{fmtTime(row.createdAt)}</span>
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

function PageBtn({
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
