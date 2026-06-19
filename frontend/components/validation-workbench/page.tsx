"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import {
  ApiError,
  assistantApi,
  projectApi,
  validationCardApi,
  workbenchApi,
  type AssistantDepositFileResult,
  type AssistantParseFileResult,
  type ValidationCard,
  type WorkbenchSummary,
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
  imageNote?: string;
};

type PendingValidationTask = {
  title: string;
  plannedInvestment: string;
  decisionDeadline: string;
  targetCustomer: string;
};

export function ValidationWorkbenchPage() {
  const [summary, setSummary] = useState<WorkbenchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingTask, setPendingTask] = useState<PendingValidationTask | null>(null);
  const [validationCards, setValidationCards] = useState<ValidationCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [plannedInvestment, setPlannedInvestment] = useState("");
  const [decisionDeadline, setDecisionDeadline] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [materials, setMaterials] = useState<WorkbenchMaterial[]>([]);
  const [materialConversationId, setMaterialConversationId] = useState<string | null>(null);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [depositingMaterialId, setDepositingMaterialId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, cardsResult] = await Promise.allSettled([
        workbenchApi.summary(),
        validationCardApi.list(),
      ]);
      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        setSummary(null);
        setError(summaryResult.reason instanceof ApiError ? summaryResult.reason.message : "验证工作台加载失败，请检查后端服务");
      }
      if (cardsResult.status === "fulfilled") {
        setValidationCards(cardsResult.value);
      } else if (summaryResult.status === "fulfilled") {
        setError(cardsResult.reason instanceof ApiError ? cardsResult.reason.message : "验证任务列表加载失败");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const project = summary?.current_project ?? null;
  const hasCards = validationCards.length > 0;
  const readyMaterials = materials.filter((item) => ["ready", "image_ready", "deposited"].includes(item.status));
  const hasStructuredFacts =
    plannedInvestment.trim().length > 0 || decisionDeadline.length > 0 || targetCustomer.trim().length > 0;
  const hasDraft = draft.trim().length > 0 || readyMaterials.length > 0 || hasStructuredFacts;

  async function startValidation() {
    const text = buildValidationBrief();
    if (!text || saving || uploadingMaterial) return;
    const taskTitle = (draft.trim() || readyMaterials[0]?.filename || text).slice(0, 48);
    setPendingTask({
      title: taskTitle,
      plannedInvestment: plannedInvestment.trim(),
      decisionDeadline,
      targetCustomer: targetCustomer.trim(),
    });
    setSaving(true);
    setError(null);
    try {
      const createdProject = await projectApi.create({
        name: taskTitle,
        target_customer: targetCustomer.trim(),
        current_problem: text,
        task_pack: "new_project",
        planned_investment: plannedInvestment.trim() || null,
        decision_deadline: decisionDeadline || null,
      });
      const createdCard = await validationCardApi.create({
        project_id: createdProject.id,
        title: taskTitle,
        project_description: text,
      });
      setValidationCards((prev) => [createdCard, ...prev.filter((card) => card.id !== createdCard.id)]);
      setDraft("");
      setPlannedInvestment("");
      setDecisionDeadline("");
      setTargetCustomer("");
      setMaterials([]);
      setMaterialConversationId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "创建7天验证任务失败");
    } finally {
      setSaving(false);
      setPendingTask(null);
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
      const note = item.imageNote?.trim() ? `\n   图片关键信息：${item.imageNote.trim()}` : "";
      return `${index + 1}. ${item.filename}：${kind}${parsed}${deposit}${note}`;
    });
    const facts = [
      plannedInvestment.trim() ? `计划投入：${plannedInvestment.trim()}` : null,
      decisionDeadline ? `决策期限：${decisionDeadline}` : null,
      targetCustomer.trim() ? `目标客户：${targetCustomer.trim()}` : null,
    ].filter(Boolean);
    const factBlock = facts.length ? ["", "结构化决策信息：", ...facts] : [];
    if (!rows.length) {
      return [base || "请基于以下信息，判断未来30天内最需要验证的投入决策。", ...factBlock].join("\n");
    }
    return [
      base || "请基于我上传的材料，判断未来30天内最需要验证的投入决策。",
      ...factBlock,
      "",
      "已上传验证材料：",
      ...rows,
      "",
      "请结合上述材料拆解7天验证决策树，并指出还缺哪些现实证据。",
    ].join("\n");
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
              <div className="grid w-full gap-2 md:grid-cols-3">
                <input
                  value={plannedInvestment}
                  onChange={(event) => setPlannedInvestment(event.target.value)}
                  className="h-10 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
                  placeholder="计划投入，如：30万"
                />
                <input
                  type="date"
                  value={decisionDeadline}
                  onChange={(event) => setDecisionDeadline(event.target.value)}
                  className="h-10 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-[#172452] outline-none focus:border-brand/50"
                  title="决策期限"
                />
                <input
                  value={targetCustomer}
                  onChange={(event) => setTargetCustomer(event.target.value)}
                  className="h-10 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
                  placeholder="目标客户，如：中小企业老板"
                />
              </div>
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
                    onNoteChange={(imageNote) =>
                      setMaterials((prev) =>
                        prev.map((item) => (item.localId === material.localId ? { ...item, imageNote } : item))
                      )
                    }
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
        ) : saving && pendingTask ? (
          <ValidationCardsWorkspace
            cards={validationCards}
            pendingTask={pendingTask}
          />
        ) : !hasCards ? (
          <section className="dashboard-card mt-5 rounded-2xl px-6 py-10 text-center">
            <Icon name="target" className="mx-auto h-10 w-10 text-brand/40" />
            <h2 className="mt-4 text-[18px] font-black text-ink">还没有进行中的验证任务</h2>
            <p className="mx-auto mt-2 max-w-[460px] text-[13px] font-medium leading-6 text-slate-500">
              在上方输入你最需要验证的投入决策（包括计划投入金额和决策期限），AI
              会把它拆成一张7天验证卡：按复杂度展开的决策树节点、可量化的成功标准和冷酷审判。
            </p>
          </section>
        ) : (
          <section className="mt-5 space-y-4">
            <ValidationCardsWorkspace
              cards={validationCards}
            />
          </section>
        )}

        <p className="py-4 text-center text-[11px] font-medium text-slate-400">
          回答由 AI 结合天机AI核心知识节点生成，仅供决策参考。
        </p>
      </section>
    </main>
  );
}

function ValidationCardsWorkspace({
  cards,
  pendingTask,
}: {
  cards: ValidationCard[];
  pendingTask?: PendingValidationTask | null;
}) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-black text-ink">验证任务卡片</h2>
          <p className="mt-1 text-[12px] font-semibold text-slate-400">可以创建多张验证卡；点击卡片后再查看该卡详情。</p>
        </div>
        <span className="rounded-xl bg-slate-50 px-3 py-1.5 text-[12px] font-black text-slate-500">
          {cards.length + (pendingTask ? 1 : 0)} 张
        </span>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {pendingTask && <PendingValidationTaskTile task={pendingTask} />}
        {cards.map((card) => (
          <ValidationTaskTile
            key={card.id}
            card={card}
          />
        ))}
      </div>
    </section>
  );
}

function PendingValidationTaskTile({ task }: { task: PendingValidationTask }) {
  const facts = [
    task.plannedInvestment ? `计划投入：${task.plannedInvestment}` : "计划投入待确认",
    task.decisionDeadline ? `决策期限：${task.decisionDeadline}` : "期限待确认",
    task.targetCustomer ? `目标客户：${task.targetCustomer}` : "目标客户待确认",
  ];

  return (
    <div className="rounded-2xl border border-brand/20 bg-[#f8f7ff] px-4 py-4 shadow-[0_14px_34px_rgba(104,84,255,0.10)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-brand">
          <Icon name="refresh" className="h-3.5 w-3.5 animate-spin" />
          生成中
        </span>
        <Icon name="sparkles" className="h-5 w-5 animate-pulse text-brand" />
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-black leading-6 text-ink">{task.title}</h3>
      <div className="mt-3 space-y-1.5">
        {facts.map((fact) => (
          <div key={fact} className="truncate text-[11.5px] font-bold text-slate-500">
            {fact}
          </div>
        ))}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-brand" />
      </div>
    </div>
  );
}

function ValidationTaskTile({ card }: { card: ValidationCard }) {
  const evidenceTotal = card.actions.reduce((sum, action) => sum + (action.evidence_count || 0), 0);
  const evidenceTarget = card.actions.reduce((sum, action) => sum + (action.evidence_target || 0), 0);
  const doneCount = card.actions.filter((action) => action.status === "done").length;

  return (
    <a
      href={`/validation-cards/${card.id}`}
      className="rounded-2xl border border-line bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_16px_36px_rgba(30,58,138,0.10)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", validationStatusTone(card.status))}>
          {validationStatusLabel(card.status)}
        </span>
        <span className="text-[11px] font-bold text-slate-400">{formatTime(card.updated_at)}</span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-black leading-6 text-ink">{card.title}</h3>
      <p className="mt-2 line-clamp-2 text-[11.5px] font-semibold leading-5 text-slate-400">{card.project_summary}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["节点", `${doneCount}/${card.actions.length}`],
          ["证据", `${evidenceTotal}/${evidenceTarget}`],
          ["等级", String(card.meta?.evidence_grade || card.actions[0]?.evidence_grade || "C")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-2 py-2">
            <div className="text-[13px] font-black text-[#172452]">{value}</div>
            <div className="mt-0.5 text-[10px] font-bold text-slate-400">{label}</div>
          </div>
        ))}
      </div>
    </a>
  );
}

function validationStatusLabel(status: string): string {
  return {
    draft: "草稿",
    running: "验证中",
    completed: "已完成",
    archived: "已归档",
  }[status] || status;
}

function validationStatusTone(status: string): string {
  if (status === "running") return "bg-emerald-50 text-emerald-600";
  if (status === "completed") return "bg-brand/10 text-brand";
  if (status === "archived") return "bg-slate-100 text-slate-500";
  return "bg-[#f0edff] text-brand";
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
  onNoteChange,
  onRemove,
}: {
  material: WorkbenchMaterial;
  depositing: boolean;
  disabled: boolean;
  onDeposit: () => void;
  onNoteChange: (value: string) => void;
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
    <div className="rounded-2xl border border-line bg-white px-3 py-2 text-left">
      <div className="flex items-center gap-3">
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
      {isImage && ready && (
        <input
          value={material.imageNote || ""}
          onChange={(event) => onNoteChange(event.target.value)}
          disabled={disabled || depositing}
          className="mt-2 h-9 w-full rounded-xl border border-orange-100 bg-orange-50/40 px-3 text-[12px] font-semibold text-[#172452] outline-none placeholder:text-orange-400 focus:border-orange-300 disabled:opacity-55"
          placeholder="补充图片关键信息，如截图里的客户原话、报价、表格结论"
        />
      )}
    </div>
  );
}

function formatFileSize(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function SituationPanel({ summary }: { summary: WorkbenchSummary }) {
  const model = summary.world_model;
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-black text-brand">
            <Icon name="route" className="h-4 w-4" />
            当前局面
          </div>
          <h2 className="mt-2 truncate text-[19px] font-black tracking-[-0.02em] text-ink">{model.main_quest}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#f0edff] px-2.5 py-1 text-brand">
              <Icon name="users" className="h-3.5 w-3.5" />
              {model.player_role}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1 text-slate-600">
              <Icon name="shield" className="h-3.5 w-3.5" />
              {summary.cold_review.verdict}
            </span>
          </div>
        </div>
        <div className="grid min-w-[220px] grid-cols-3 gap-2 text-center">
          <SituationMetric label="证据" value={`${summary.evidence_status.existing}`} tone="text-emerald-600" />
          <SituationMetric label="缺口" value={`${summary.evidence_status.missing}`} tone="text-orange-500" />
          <SituationMetric label="Day" value={`${summary.current_day}/${summary.total_days}`} tone="text-brand" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-4">
        <SituationList icon="target" title="下一任务" items={model.next_quests} tone="text-brand" />
        <SituationList icon="alert" title="资源缺口" items={model.resource_gaps} tone="text-orange-500" />
        <SituationList icon="shield" title="当前规则" items={model.active_rules} tone="text-[#172452]" />
        <SituationList icon="check-circle" title="风险信号" items={model.risk_signals} tone="text-rose-500" />
      </div>
    </section>
  );
}

function SituationMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className={cn("text-[18px] font-black", tone)}>{value}</div>
      <div className="mt-0.5 text-[11px] font-bold text-slate-400">{label}</div>
    </div>
  );
}

function SituationList({ icon, title, items, tone }: { icon: string; title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-3 py-3">
      <div className={cn("flex items-center gap-1.5 text-[12px] font-black", tone)}>
        <Icon name={icon} className="h-3.5 w-3.5" />
        {title}
      </div>
      <ul className="mt-2 space-y-1.5">
        {(items.length ? items : ["暂无"]).slice(0, 3).map((item, index) => (
          <li key={`${title}-${index}`} className="line-clamp-2 text-[11.5px] font-semibold leading-5 text-slate-500">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
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
    partner_fit: "合作资源",
    community_supply: "社区供给",
    trust_transfer: "信任迁移",
    governance: "治理",
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
