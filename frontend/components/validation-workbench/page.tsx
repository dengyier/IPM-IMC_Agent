"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import {
  ApiError,
  assistantApi,
  projectApi,
  validationCardApi,
  workbenchApi,
  type AssistantDepositFileResult,
  type AssistantParseFileResult,
  type WorkbenchAction,
  type WorkbenchSummary,
  type WorkbenchTimelineItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const starterTasks = [
  { icon: "target", title: "新项目是否值得做", desc: "验证机会与需求是否真实" },
  { icon: "route", title: "投放/开店/招人前先验证", desc: "避免盲目投入资源" },
  { icon: "money", title: "客户是否愿意付费", desc: "验证价值与付费意向" },
  { icon: "shield", title: "项目该继续、调整还是暂停", desc: "减少沉没成本与风险" },
];

const projectStatusLabels: Record<string, { label: string; tone: string }> = {
  idea: { label: "构想中", tone: "bg-slate-100 text-slate-500" },
  validating: { label: "验证中", tone: "bg-emerald-50 text-emerald-600" },
  trial: { label: "试运行", tone: "bg-sky-50 text-sky-600" },
  paused: { label: "已暂停", tone: "bg-orange-50 text-orange-600" },
};

type WorkbenchMaterial = {
  localId: string;
  file: File;
  filename: string;
  status: "uploading" | "ready" | "image_ready" | "deposited" | "error";
  fileId?: string;
  sourceId?: string;
  conversationId?: string;
  chars: number;
  chunkCount: number;
  message?: string;
};

export function ValidationWorkbenchPage() {
  const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [evidenceFor, setEvidenceFor] = useState<number | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [materials, setMaterials] = useState<WorkbenchMaterial[]>([]);
  const [materialConversationId, setMaterialConversationId] = useState<string | null>(null);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [depositingMaterialId, setDepositingMaterialId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSummary(await workbenchApi.summary());
    } catch (e) {
      setSummary(null);
      setError(e instanceof ApiError ? e.message : "验证工作台加载失败，请检查后端服务");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const project = summary?.current_project ?? null;
  const hasTask = Boolean(summary?.has_data && summary.current_card_id);
  const readyMaterials = materials.filter((item) => ["ready", "image_ready", "deposited"].includes(item.status));
  const hasDraft = draft.trim().length > 0 || readyMaterials.length > 0;
  const actionProgress = useMemo(() => {
    const actions = summary?.actions ?? [];
    if (!actions.length) return 0;
    return Math.round(actions.reduce((sum, item) => sum + Math.max(0, Math.min(item.progress, 100)), 0) / actions.length);
  }, [summary?.actions]);

  async function startValidation() {
    const text = buildValidationBrief();
    if (!text || saving || uploadingMaterial) return;
    setSaving(true);
    setError(null);
    try {
      const createdProject = await projectApi.create({
        name: (draft.trim() || readyMaterials[0]?.filename || text).slice(0, 48),
        current_problem: text,
        task_pack: "new_project",
      });
      await validationCardApi.create({
        project_id: createdProject.id,
        title: (draft.trim() || readyMaterials[0]?.filename || text).slice(0, 48),
        project_description: text,
      });
      setDraft("");
      setMaterials([]);
      setMaterialConversationId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "创建7天验证任务失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadMaterials(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length || uploadingMaterial) return;
    setUploadingMaterial(true);
    setError(null);
    try {
      let conversationId = materialConversationId;
      for (const file of selected) {
        const localId = `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`;
        setMaterials((prev) => [
          ...prev,
          {
            localId,
            file,
            filename: file.name,
            status: "uploading",
            chars: 0,
            chunkCount: 0,
            message: "正在解析材料...",
          },
        ]);
        try {
          const result: AssistantParseFileResult = await assistantApi.parseFile(file, conversationId);
          conversationId = result.conversation_id || conversationId;
          setMaterialConversationId(conversationId);
          setMaterials((prev) =>
            prev.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    status: result.status === "image_ready" ? "image_ready" : "ready",
                    fileId: result.file_id,
                    conversationId: result.conversation_id,
                    chars: result.chars,
                    chunkCount: result.chunk_count,
                    message: result.text || (result.chunk_count > 0 ? `已解析 ${result.chunk_count} 个片段` : "已上传"),
                  }
                : item
            )
          );
        } catch (e) {
          setMaterials((prev) =>
            prev.map((item) =>
              item.localId === localId
                ? {
                    ...item,
                    status: "error",
                    message: e instanceof ApiError ? e.message : "材料上传失败",
                  }
                : item
            )
          );
        }
      }
    } finally {
      setUploadingMaterial(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function depositMaterial(material: WorkbenchMaterial) {
    if (!material.fileId || depositingMaterialId) return;
    setDepositingMaterialId(material.localId);
    setError(null);
    try {
      const result: AssistantDepositFileResult = await assistantApi.depositFile(material.fileId, {
        title: material.filename,
        source_type: "project_evidence",
        visibility: "team",
      });
      setMaterials((prev) =>
        prev.map((item) =>
          item.localId === material.localId
            ? {
                ...item,
                status: "deposited",
                sourceId: result.source_id,
                message: result.message || "已沉淀到资料中心",
              }
            : item
        )
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "沉淀资料失败");
    } finally {
      setDepositingMaterialId(null);
    }
  }

  function removeMaterial(localId: string) {
    setMaterials((prev) => prev.filter((item) => item.localId !== localId));
  }

  function buildValidationBrief(): string {
    const base = draft.trim();
    const rows = readyMaterials.map((item, index) => {
      const kind = item.status === "image_ready" ? "图片材料（待OCR/人工描述）" : "文档材料";
      const deposit = item.sourceId ? `，已沉淀资料中心 source_id=${item.sourceId}` : "";
      const parsed = item.chunkCount > 0 ? `，已解析 ${item.chunkCount} 个片段/${item.chars} 字` : "";
      return `${index + 1}. ${item.filename}：${kind}${parsed}${deposit}`;
    });
    if (!rows.length) return base;
    return [
      base || "请基于我上传的材料，判断未来30天内最需要验证的投入决策。",
      "",
      "已上传验证材料：",
      ...rows,
      "",
      "请结合上述材料拆解7天验证决策树，并指出还缺哪些现实证据。",
    ].join("\n");
  }

  async function submitEvidence(index: number) {
    const text = evidenceText.trim();
    if (!summary?.current_card_id || !text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await validationCardApi.updateAction(summary.current_card_id, index, { evidence_note: text });
      setEvidenceFor(null);
      setEvidenceText("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "记录证据失败");
    } finally {
      setSaving(false);
    }
  }

  async function completeAction(index: number) {
    if (!summary?.current_card_id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await validationCardApi.updateAction(summary.current_card_id, index, { status: "done", progress: 100 });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "更新验证动作失败");
    } finally {
      setSaving(false);
    }
  }

  function applyStarter(title: string) {
    setDraft(title === "客户是否愿意付费" ? "我有一个产品/服务，但不知道目标客户是否愿意付费。" : title);
  }

  const statusBadge = projectStatusLabels[project?.status ?? ""] ?? projectStatusLabels.validating;
  const aiInterviewHref = (() => {
    if (!summary?.current_card_id) return "/chat";
    const params = new URLSearchParams();
    if (project?.id) params.set("projectId", project.id);
    params.set("validationCardId", summary.current_card_id);
    return `/chat?${params.toString()}`;
  })();
  const focusInterviewHref = (() => {
    const href = new URL(aiInterviewHref, "http://local");
    href.searchParams.set("focus", "1");
    return `${href.pathname}${href.search}`;
  })();

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[28px] font-black tracking-[-0.03em] text-ink">验证工作台</h1>
            <p className="mt-1.5 text-[13px] font-medium text-slate-500">
              把一个模糊商业决策，拆成7天可执行、可复盘的验证任务。
            </p>
          </div>
          <div className="flex items-center gap-3 text-[#172452]">
            <a href="/data-center" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white">
              <Icon name="folder" className="h-5 w-5" />
            </a>
            <a href={focusInterviewHref} className="flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-bold hover:bg-white">
              <Icon name="panel" className="h-5 w-5" />
              专注
            </a>
            <a href={aiInterviewHref} className="flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-bold text-brand hover:bg-white">
              <Icon name="history" className="h-5 w-5" />
              会话
            </a>
          </div>
        </header>

        {error && (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-700">
            {error}
          </div>
        )}

        <section className="dashboard-card mt-6 rounded-2xl px-6 py-6">
          <div className="mx-auto max-w-[920px]">
            <h2 className="text-center text-[27px] font-black tracking-[-0.03em] text-ink">
              未来<span className="mx-1 text-brand">30天</span>内，你最需要验证哪一个投入决策？
            </h2>
            <div className="mt-5 flex gap-3">
              <div className="flex min-h-[52px] flex-1 items-center rounded-2xl border border-[#cbd6f1] bg-white px-4 shadow-[0_10px_24px_rgba(30,58,138,0.035)]">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") startValidation();
                  }}
                  className="w-full bg-transparent text-[14px] font-semibold text-[#172452] outline-none placeholder:text-slate-400"
                  placeholder="例如：是否投入30万启动GEO服务产品化？"
                />
              </div>
              <button
                type="button"
                onClick={startValidation}
                disabled={!hasDraft || saving}
                className="brand-gradient flex h-[52px] min-w-[142px] items-center justify-center gap-2 rounded-2xl px-5 text-[14px] font-black text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving && <Icon name="refresh" className="h-4 w-4 animate-spin" />}
                {saving ? "AI 生成中" : "开始7天验证"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-500">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                  onChange={(event) => handleUploadMaterials(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMaterial || saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[12px] font-black text-[#172452] hover:border-brand/30 hover:text-brand disabled:opacity-45"
                >
                  <Icon name={uploadingMaterial ? "refresh" : "upload-cloud"} className={cn("h-4 w-4", uploadingMaterial && "animate-spin")} />
                  {uploadingMaterial ? "上传中" : "上传材料"}
                </button>
                <span>支持 Word、PDF、Excel、PPT、文本和图片；文档会先解析，图片先作为待识别证据。</span>
              </div>
              {materials.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMaterials([])}
                  disabled={saving || uploadingMaterial}
                  className="text-[12px] font-black text-slate-400 hover:text-rose-500 disabled:opacity-45"
                >
                  清空材料
                </button>
              )}
            </div>

            {materials.length > 0 && (
              <div className="mt-3 grid gap-2">
                {materials.map((material) => (
                  <MaterialRow
                    key={material.localId}
                    material={material}
                    depositing={depositingMaterialId === material.localId}
                    disabled={saving || uploadingMaterial}
                    onDeposit={() => depositMaterial(material)}
                    onRemove={() => removeMaterial(material.localId)}
                  />
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-4 gap-3">
              {starterTasks.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => applyStarter(item.title)}
                  className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-line bg-white/72 px-3 text-left transition hover:border-brand/30 hover:bg-white"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f0edff] text-brand group-hover:shadow-soft">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-black text-[#172452]">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{item.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {loading && !summary ? (
          <section className="dashboard-card mt-5 flex min-h-[220px] items-center justify-center rounded-2xl">
            <div className="flex items-center gap-2 text-[13px] font-bold text-slate-400">
              <Icon name="refresh" className="h-4 w-4 animate-spin" />
              正在加载验证任务...
            </div>
          </section>
        ) : !hasTask || !summary ? (
          <section className="dashboard-card mt-5 rounded-2xl px-6 py-10 text-center">
            <Icon name="target" className="mx-auto h-10 w-10 text-brand/40" />
            <h2 className="mt-4 text-[18px] font-black text-ink">还没有进行中的验证任务</h2>
            <p className="mx-auto mt-2 max-w-[460px] text-[13px] font-medium leading-6 text-slate-500">
              在上方输入你最需要验证的投入决策（包括计划投入金额和决策期限），AI
              会把它拆成一张7天验证卡：按复杂度展开的决策树节点、可量化的成功标准和冷酷审判。
            </p>
          </section>
        ) : (
          <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_260px]">
            <div className="dashboard-card rounded-2xl px-5 py-5">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="text-[12px] font-black text-[#172452]">当前验证任务</div>
                  <div className="mt-2 flex items-center gap-2">
                    <h2 className="truncate text-[20px] font-black tracking-[-0.02em] text-ink">{project?.name}</h2>
                    {project?.id && (
                      <a href={`/chat?projectId=${project.id}`} className="text-brand hover:text-violet">
                        <Icon name="pencil" className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] font-bold text-slate-500">
                    <MetaItem icon="calendar" label={`决策期限：${project?.decision_deadline || "未设置"}`} />
                    <MetaItem icon="money" label={`计划投入：${project?.planned_investment || "未设置"}`} />
                    <MetaItem icon="shield" label={`证据等级：${summary.evidence_status.grade}`} tone="text-orange-500" />
                  </div>
                </div>
                <div className="border-l border-line pl-5">
                  <div className="text-[12px] font-bold text-slate-400">{loading ? "正在同步" : "当前进度"}</div>
                  <div className="mt-2 text-[22px] font-black text-brand">
                    Day {summary.current_day} <span className="text-[16px] text-[#172452]">/ {summary.total_days}</span>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-400">动作均值 {actionProgress}%</div>
                  <div className="mt-2 h-1.5 w-24 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-brand"
                      style={{ width: `${Math.min(100, (summary.current_day / summary.total_days) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <Timeline rows={summary.timeline} />

              <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_220px]">
                <div className="min-w-0">
                  <div className="grid grid-cols-[1.1fr_1fr_150px_168px] border-b border-line pb-2 text-[12px] font-black text-slate-500">
                    <span>决策树节点（{summary.actions.length}）</span>
                    <span>成功标准</span>
                    <span>进度 / 证据</span>
                    <span className="text-right">状态</span>
                  </div>
                  <div className="divide-y divide-line/80">
                    {summary.actions.map((action, index) => (
                      <div key={`${index}-${action.title}`}>
                        <ActionRow
                          action={action}
                          depth={treeDepth(action, summary.actions)}
                          disabled={saving}
                          onAddEvidence={() => {
                            setEvidenceFor(evidenceFor === index ? null : index);
                            setEvidenceText("");
                          }}
                          onDone={() => completeAction(index)}
                        />
                        {evidenceFor === index && (
                          <div className="flex items-center gap-2 pb-3">
                            <input
                              autoFocus
                              value={evidenceText}
                              onChange={(event) => setEvidenceText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") submitEvidence(index);
                                if (event.key === "Escape") setEvidenceFor(null);
                              }}
                              className="h-9 min-w-0 flex-1 rounded-xl border border-brand/30 bg-white px-3 text-[12px] font-semibold text-[#172452] outline-none placeholder:text-slate-400"
                              placeholder="记录一条真实证据，如：访谈了客户A，他愿意预付500元订金"
                            />
                            <button
                              type="button"
                              onClick={() => submitEvidence(index)}
                              disabled={!evidenceText.trim() || saving}
                              className="flex h-9 items-center rounded-xl bg-brand px-3 text-[12px] font-black text-white disabled:opacity-45"
                            >
                              保存
                            </button>
                          </div>
                        )}
                        {action.evidence_items.length > 0 && (
                          <ul className="space-y-1 pb-3 pl-12">
                            {action.evidence_items.slice(-3).map((item, itemIndex) => (
                              <li key={itemIndex} className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-500">
                                <Icon name="check-circle" className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                                <span className="min-w-0 truncate">{item.text}</span>
                                {item.created_at && (
                                  <span className="shrink-0 text-slate-300">{formatTime(item.created_at)}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                  <a href={summary.current_card_id ? `/validation-cards/${summary.current_card_id}` : "/portfolio"} className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-black text-brand hover:text-violet">
                    查看完整验证卡
                    <Icon name="chevron-right" className="h-3.5 w-3.5" />
                  </a>
                </div>

                <div className="rounded-2xl border border-orange-100 bg-gradient-to-b from-orange-50/80 to-white px-4 py-4">
                  <div className="flex items-center gap-2 text-[12px] font-black text-[#7c2d12]">
                    <Icon name="alert" className="h-4 w-4 text-orange-500" />
                    冷酷审判
                  </div>
                  <div className="mt-3 text-[19px] font-black text-orange-600">{summary.cold_review.verdict}</div>
                  <div className="mt-2 text-[12px] font-semibold text-slate-500">置信度：{summary.cold_review.confidence}%</div>
                  <ol className="mt-4 space-y-2">
                    {summary.cold_review.reasons.slice(0, 3).map((reason, index) => (
                      <li key={reason} className="flex items-center gap-2 text-[12px] font-semibold text-[#7c2d12]">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[11px] text-orange-600">{index + 1}</span>
                        {reason}
                      </li>
                    ))}
                  </ol>
                  <a href={summary.current_card_id ? `/bach/${summary.current_card_id}` : "/canvas-diagnosis"} className="mt-5 flex h-10 items-center justify-center gap-1.5 rounded-xl border border-brand/25 bg-white text-[12px] font-black text-brand hover:bg-[#f7f5ff]">
                    查看审判意见
                    <Icon name="chevron-right" className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <SidePanel title="当前项目">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-black text-ink">{project?.name}</div>
                    <div className="mt-2 text-[12px] font-semibold leading-5 text-slate-500">
                      计划投入：{project?.planned_investment || "未设置"}
                    </div>
                  </div>
                  <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", statusBadge.tone)}>{statusBadge.label}</span>
                </div>
                <a href={summary.current_card_id ? `/validation-cards/${summary.current_card_id}` : "/portfolio"} className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-black text-brand">
                  进入任务详情
                  <Icon name="chevron-right" className="h-3.5 w-3.5" />
                </a>
              </SidePanel>

              <SidePanel title="下一步推荐">
                <p className="text-[13px] font-bold leading-6 text-[#172452]">{summary.next_action}</p>
                <a href={aiInterviewHref} className="mt-4 flex h-10 items-center justify-center rounded-xl border border-brand/25 bg-white text-[12px] font-black text-brand hover:bg-[#f7f5ff]">
                  去 AI 经营访谈
                </a>
              </SidePanel>

              <SidePanel
                title="证据状态"
                action={summary.evidence_updated_at ? `更新于 ${formatTime(summary.evidence_updated_at)}` : undefined}
              >
                <EvidenceRow dot="bg-emerald-500" label="已有证据" value={`${summary.evidence_status.existing} 条`} />
                <EvidenceRow dot="bg-orange-500" label="缺失证据" value={`${summary.evidence_status.missing} 条`} />
                <EvidenceRow dot="bg-slate-300" label="待完成动作" value={`${summary.evidence_status.pending} 个`} />
                <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-[11px] font-semibold leading-5 text-orange-600">
                  缺失证据按每个决策树节点的最低证据目标汇总；中间「进度 / 证据」列可查看每个节点还缺几条。
                </p>
                <a href={summary.current_card_id ? `/validation-cards/${summary.current_card_id}#evidence` : "/portfolio"} className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-black text-brand">
                  查看证据中心
                  <Icon name="chevron-right" className="h-3.5 w-3.5" />
                </a>
              </SidePanel>

              {summary.bach && <BachPanel snapshot={summary.bach} />}

              <SidePanel title="沉淀为病例">
                <p className="text-[12px] font-semibold leading-5 text-slate-500">
                  Day7 复盘完成后，将自动进入经营档案与决策病例库。
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {summary.case_assets.map((asset) => (
                    <div key={asset.label} className="rounded-2xl bg-slate-50 px-2 py-3 text-center">
                      <Icon name={asset.status === "ready" ? "check-circle" : "archive"} className="mx-auto h-5 w-5 text-brand" />
                      <div className="mt-2 text-[11px] font-black text-[#172452]">{asset.label}</div>
                    </div>
                  ))}
                </div>
              </SidePanel>
            </aside>
          </section>
        )}

        <p className="py-4 text-center text-[11px] font-medium text-slate-400">
          回答由 AI 结合天机AI核心知识节点生成，仅供决策参考。
        </p>
      </section>
    </main>
  );
}

function formatTime(value: string): string {
  // 后端 utc_now 实际存的是东八区本地时间（naive），按本地时间解析，不做 UTC 转换
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hhmm : `${date.getMonth() + 1}-${date.getDate()} ${hhmm}`;
}

function MaterialRow({
  material,
  depositing,
  disabled,
  onDeposit,
  onRemove,
}: {
  material: WorkbenchMaterial;
  depositing: boolean;
  disabled: boolean;
  onDeposit: () => void;
  onRemove: () => void;
}) {
  const isImage = material.status === "image_ready";
  const ready = material.status === "ready" || material.status === "image_ready" || material.status === "deposited";
  const statusText =
    material.status === "uploading"
      ? "解析中"
      : material.status === "deposited"
        ? "已入资料中心"
        : material.status === "error"
          ? "上传失败"
          : isImage
            ? "图片待识别"
            : "已解析";
  const tone =
    material.status === "error"
      ? "bg-rose-50 text-rose-500"
      : material.status === "deposited"
        ? "bg-emerald-50 text-emerald-600"
        : isImage
          ? "bg-orange-50 text-orange-600"
          : "bg-[#f0edff] text-brand";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-brand">
        <Icon name={isImage ? "file" : "file-text"} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-black text-[#172452]">{material.filename}</span>
          <span className={cn("shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black", tone)}>{statusText}</span>
        </div>
        <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
          {material.message || `${formatFileSize(material.file.size)} · ${material.chunkCount} 个片段`}
        </div>
      </div>
      {ready && material.status !== "deposited" && material.fileId && (
        <button
          type="button"
          onClick={onDeposit}
          disabled={disabled || depositing}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-brand/20 bg-white px-2.5 text-[11px] font-black text-brand hover:bg-[#f7f5ff] disabled:opacity-45"
        >
          <Icon name={depositing ? "refresh" : "archive"} className={cn("h-3.5 w-3.5", depositing && "animate-spin")} />
          {depositing ? "沉淀中" : "同步资料中心"}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled || depositing || material.status === "uploading"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
        title="移除材料"
      >
        <Icon name="x" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function formatFileSize(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function MetaItem({ icon, label, tone = "text-slate-500" }: { icon: string; label: string; tone?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", tone)}>
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function Timeline({ rows }: { rows: WorkbenchTimelineItem[] }) {
  return (
    <div className="mt-6 grid grid-cols-8 gap-0">
      {rows.map((item, index) => (
        <div key={`${item.day}-${item.label}`} className="relative min-w-0">
          {index > 0 && <span className="absolute left-0 right-1/2 top-[11px] h-px bg-line" />}
          {index < rows.length - 1 && <span className="absolute left-1/2 right-0 top-[11px] h-px bg-line" />}
          <div className="relative z-10 flex flex-col items-center text-center">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-black",
                item.status === "done" && "border-emerald-500 bg-emerald-500 text-white",
                item.status === "current" && "border-brand bg-white text-brand shadow-soft",
                item.status === "pending" && "border-slate-200 bg-slate-100 text-slate-400"
              )}
            >
              {item.status === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : item.day}
            </span>
            <div className={cn("mt-2 text-[12px] font-black", item.status === "current" ? "text-brand" : "text-[#172452]")}>
              Day {item.day}
            </div>
            <div className="mt-1 truncate text-[11px] font-semibold text-slate-500">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionRow({
  action,
  depth,
  disabled,
  onAddEvidence,
  onDone,
}: {
  action: WorkbenchAction;
  depth: number;
  disabled: boolean;
  onAddEvidence: () => void;
  onDone: () => void;
}) {
  const statusTone =
    action.status === "done"
      ? "bg-emerald-50 text-emerald-600"
      : action.status === "running"
        ? "bg-emerald-50 text-emerald-600"
        : action.status === "blocked"
          ? "bg-rose-50 text-rose-500"
          : "bg-slate-100 text-slate-500";
  const statusLabel =
    action.status === "done" ? "已完成" : action.status === "running" ? "进行中" : action.status === "blocked" ? "受阻" : "待开始";
  const done = action.status === "done";
  const evidenceTarget = Math.max(1, action.evidence_target || 3);
  const missingEvidence = Math.max(0, action.missing_evidence_count ?? evidenceTarget - action.evidence_count);
  const evidenceRatio = Math.min(100, Math.round((Math.max(action.evidence_count, 0) / evidenceTarget) * 100));
  return (
    <div className="grid grid-cols-[1.1fr_1fr_150px_168px] items-center gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3" style={{ paddingLeft: `${Math.min(depth, 3) * 18}px` }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon name={action.node_type === "root" ? "target" : action.node_type === "synthesis" ? "shield" : action.title.includes("渠道") ? "route" : action.title.includes("付费") ? "money" : "users"} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          {action.branch_condition && (
            <div className="mb-0.5 truncate text-[10px] font-black text-orange-500">{action.branch_condition}</div>
          )}
          <div className="truncate text-[13px] font-black text-[#172452]">{action.title}</div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{action.objective}</div>
          {(action.grounded_on || action.target) && (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-emerald-600">
              <Icon name="target" className="h-3 w-3 shrink-0" />
              <span className="truncate">{action.grounded_on || action.target}</span>
            </div>
          )}
        </div>
      </div>
      <div className="truncate text-[12px] font-bold text-[#172452]">{action.success_metric}</div>
      <div>
        <div className="flex items-center gap-2 text-[12px] font-bold text-slate-500">
          <span>{action.evidence_count}/{evidenceTarget} 条</span>
          <span className="h-1.5 flex-1 rounded-full bg-slate-100">
            <span
              className={cn(
                "block h-1.5 rounded-full",
                missingEvidence > 0 ? "bg-orange-400" : "bg-emerald-500"
              )}
              style={{ width: `${Math.max(4, evidenceRatio)}%` }}
            />
          </span>
        </div>
        <div className={cn("mt-1 text-[10.5px] font-black", missingEvidence > 0 ? "text-orange-500" : "text-emerald-600")}>
          {missingEvidence > 0 ? `缺 ${missingEvidence} 条有效证据` : "证据已达最低要求"}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", statusTone)}>{statusLabel}</span>
        <button
          type="button"
          onClick={onAddEvidence}
          disabled={disabled || done}
          className="flex h-8 items-center gap-1 rounded-lg border border-line bg-white px-2 text-[11px] font-black text-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          证据
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={disabled || done}
          className="flex h-8 items-center gap-1 rounded-lg bg-[#f0edff] px-2 text-[11px] font-black text-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="check" className="h-3.5 w-3.5" />
          完成
        </button>
      </div>
    </div>
  );
}

function treeDepth(action: WorkbenchAction, actions: WorkbenchAction[]): number {
  const byId = new Map(actions.map((item) => [item.node_id, item]));
  let depth = 0;
  let parentId = action.parent_id;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parent_id;
  }
  return depth;
}

function BachPanel({ snapshot }: { snapshot: NonNullable<WorkbenchSummary["bach"]> }) {
  const verdictLabel: Record<string, string> = {
    continue: "可继续",
    adjust: "需调整",
    pause: "先暂停",
  };
  return (
    <SidePanel title="BACH 假设树" action={snapshot.replay_consistent ? "账本一致" : "需重放"}>
      <div className="flex items-center justify-between rounded-xl bg-[#f8fafc] px-3 py-2">
        <span className="text-[12px] font-black text-[#172452]">{verdictLabel[snapshot.verdict] || snapshot.verdict}</span>
        <span className="text-[18px] font-black text-brand">{snapshot.probability}%</span>
      </div>
      <div className="mt-3 space-y-2">
        {snapshot.hypotheses.slice(0, 4).map((item) => (
          <div key={item.id} className="rounded-xl border border-line bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-black text-slate-400">{dimensionLabel(item.dimension)}</span>
              <span
                className={cn(
                  "shrink-0 text-[11px] font-black",
                  item.status === "refuted" ? "text-rose-500" : item.status === "supported" ? "text-emerald-600" : "text-slate-400"
                )}
              >
                {item.probability}%
              </span>
            </div>
            <div className="mt-1 line-clamp-2 text-[12px] font-bold leading-5 text-[#172452]">{item.statement}</div>
          </div>
        ))}
      </div>
      {snapshot.kill_criteria.length > 0 && (
        <div className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-[11px] font-bold leading-5 text-orange-700">
          停止信号：{String(snapshot.kill_criteria[0]?.signal || "关键假设被强证据证伪")}
        </div>
      )}
    </SidePanel>
  );
}

function dimensionLabel(value: string): string {
  return {
    customer_demand: "需求",
    willingness_to_pay: "付费",
    channel: "渠道",
    unit_economics: "单位经济",
    delivery: "交付",
    competition: "竞争",
    compliance: "合规",
  }[value] || value;
}

function SidePanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-card rounded-2xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-black text-ink">{title}</h3>
        {action && <span className="text-[11px] font-semibold text-slate-400">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function EvidenceRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12px] font-bold">
      <span className="inline-flex items-center gap-2 text-slate-500">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {label}
      </span>
      <span className="text-[#172452]">{value}</span>
    </div>
  );
}
