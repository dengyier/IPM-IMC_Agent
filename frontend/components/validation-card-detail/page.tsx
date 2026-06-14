"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/icon";
import { ApiError, validationCardApi, type ValidationAction, type ValidationCard, type ValidationEvidenceItem } from "@/lib/api";
import { cn } from "@/lib/utils";

type SaveState = {
  key: string;
  message: string | null;
};

type ReviewDecision = "continue" | "adjust" | "pause" | "";

type ActionFilter = "all" | "todo" | "running" | "done" | "blocked";

type DayGrouping = "flat" | "by-day";

const dayLabels = [
  "提交任务",
  "生成验证卡",
  "客户访谈",
  "渠道测试",
  "付费意向",
  "单位经济",
  "证据汇总",
  "复盘决策",
];

const gradeLabels: Record<string, string> = { A: "A 级 — 强证据", B: "B 级 — 中证据", C: "C 级 — 弱证据", D: "D 级 — 参考" };
const gradeShortLabels: Record<string, string> = { A: "A", B: "B", C: "C", D: "D" };
const gradeTones: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-600 border-emerald-200",
  B: "bg-blue-50 text-blue-600 border-blue-200",
  C: "bg-orange-50 text-orange-600 border-orange-200",
  D: "bg-slate-50 text-slate-500 border-slate-200",
};

const sourceTypeLabels: Record<string, string> = {
  user_interview: "用户访谈",
  customer_feedback: "客户反馈",
  paid_intent: "付费意向",
  channel_quote: "渠道报价",
  cost_estimate: "成本估算",
  market_data: "市场数据",
  expert_opinion: "专家意见",
  document: "文档资料",
  other: "其他",
};

export function ValidationCardDetailPage({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<ValidationCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveState | null>(null);

  // P1-1: node filter state
  const [filterStatus, setFilterStatus] = useState<ActionFilter>("all");
  // P1-2: day grouping toggle
  const [dayGrouping, setDayGrouping] = useState<DayGrouping>("flat");
  // P1-3: detail drawer
  const [drawerAction, setDrawerAction] = useState<ValidationAction | null>(null);
  const [drawerIndex, setDrawerIndex] = useState<number>(-1);

  async function load(options?: { quiet?: boolean }) {
    if (!options?.quiet) setLoading(true);
    setError(null);
    try {
      setCard(await validationCardApi.detail(cardId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "验证任务详情加载失败");
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [cardId]);

  const actions = card?.actions ?? [];
  const evidenceTotals = useMemo(() => actionEvidenceTotals(actions), [actions]);
  const completedCount = useMemo(() => actions.filter((item) => item.status === "done").length, [actions]);
  const currentDay = useMemo(() => inferCurrentDay(card, actions), [card, actions]);
  const completionRate = actions.length ? Math.round((completedCount / actions.length) * 100) : 0;

  // P1-1: filtered actions
  const filteredActions = useMemo(
    () => (filterStatus === "all" ? actions : actions.filter((a) => a.status === filterStatus)),
    [actions, filterStatus]
  );

  // P1-2: grouped actions by day
  const groupedActions = useMemo(() => {
    if (dayGrouping !== "by-day") return null;
    const groups = new Map<number, ValidationAction[]>();
    for (const action of filteredActions) {
      const day = actionDay(action);
      const existing = groups.get(day) || [];
      existing.push(action);
      groups.set(day, existing);
    }
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => a - b);
    return sorted;
  }, [filteredActions, dayGrouping]);

  // P1-6: evidence attachment upload
  const [uploadingFile, setUploadingFile] = useState<number | null>(null);

  async function addEvidence(
    actionIndex: number,
    text: string,
    grade?: string | null,
    sourceType?: string | null,
    attachmentUrl?: string | null,
    attachmentName?: string | null
  ) {
    if (!card || !text.trim()) return;
    setSaving({ key: `evidence-${actionIndex}`, message: null });
    try {
      const evidenceItem: ValidationEvidenceItem = { text: text.trim() };
      if (grade) evidenceItem.grade = grade as ValidationEvidenceItem["grade"];
      if (sourceType) evidenceItem.source_type = sourceType as ValidationEvidenceItem["source_type"];
      if (attachmentUrl) evidenceItem.attachment_url = attachmentUrl;
      if (attachmentName) evidenceItem.attachment_name = attachmentName;
      const updated = await validationCardApi.updateAction(card.id, actionIndex, { evidence_item: evidenceItem });
      setCard(updated);
      setSaving({ key: `evidence-${actionIndex}`, message: "证据已入账" });
    } catch (e) {
      setSaving({ key: `evidence-${actionIndex}`, message: e instanceof ApiError ? e.message : "证据入账失败" });
    }
  }

  async function handleFileUpload(actionIndex: number, file: File): Promise<{ url: string; name: string } | null> {
    if (!card) return null;
    setUploadingFile(actionIndex);
    try {
      const result = await validationCardApi.uploadAttachment(card.id, file);
      if (!result) return null;
      return { url: result.url, name: result.name };
    } catch {
      return null;
    } finally {
      setUploadingFile(null);
    }
  }

  async function markDone(actionIndex: number) {
    if (!card) return;
    setSaving({ key: `done-${actionIndex}`, message: null });
    try {
      const updated = await validationCardApi.updateAction(card.id, actionIndex, { status: "done", progress: 100 });
      setCard(updated);
      setSaving({ key: `done-${actionIndex}`, message: "节点已完成" });
    } catch (e) {
      setSaving({ key: `done-${actionIndex}`, message: e instanceof ApiError ? e.message : "节点更新失败" });
    }
  }

  async function submitReview(payload: {
    final_decision: "continue" | "adjust" | "pause";
    interview_count: number;
    paid_intent_count: number;
    rejection_reasons: string[];
    channel_quotes: string[];
    estimated_cac: string;
    actual_outcome: string;
    learnings: string;
  }) {
    if (!card) return;
    setSaving({ key: "review", message: null });
    try {
      const updated = await validationCardApi.submitReview(card.id, payload);
      setCard(updated);
      setSaving({ key: "review", message: "第 7 天复盘已提交" });
    } catch (e) {
      setSaving({ key: "review", message: e instanceof ApiError ? e.message : "复盘提交失败" });
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <a href="/" className="inline-flex items-center gap-1.5 text-[12px] font-black text-brand hover:text-violet">
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            返回验证工作台
          </a>
          <h1 className="mt-3 truncate text-[28px] font-black tracking-[-0.03em] text-ink">完整验证卡</h1>
          <p className="mt-1.5 text-[13px] font-medium text-slate-500">
            查看 7 天验证路径、决策树分支、证据缺口、BACH 审判和第 7 天复盘。
          </p>
        </div>
        {card && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* P1-7: Export to Markdown */}
            <button
              type="button"
              onClick={() => exportMarkdown(card)}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[12px] font-black text-slate-600 shadow-sm hover:border-brand/30 hover:text-brand"
            >
              <Icon name="download" className="h-3.5 w-3.5" />
              导出 MD
            </button>
            <a
              href={chatHref(card)}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-[12px] font-black text-[#172452] shadow-sm hover:border-brand/30 hover:text-brand"
            >
              <Icon name="message" className="h-3.5 w-3.5" />
              AI经营访谈
            </a>
            <a
              href={`/bach/${card.id}`}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-orange-100 bg-orange-50 px-4 text-[12px] font-black text-orange-600 hover:bg-orange-100"
            >
              <Icon name="swords" className="h-3.5 w-3.5" />
              冷酷审判
            </a>
          </div>
        )}
      </header>

      {loading ? (
        <section className="dashboard-card mt-6 flex min-h-[260px] items-center justify-center rounded-2xl">
          <div className="flex items-center gap-2 text-[13px] font-bold text-slate-400">
            <Icon name="refresh" className="h-4 w-4 animate-spin" />
            正在加载完整验证卡...
          </div>
        </section>
      ) : error ? (
        <section className="dashboard-card mt-6 rounded-2xl px-5 py-5 text-[13px] font-bold text-orange-600">
          {error}
        </section>
      ) : card ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 space-y-5">
            <TaskHero
              card={card}
              currentDay={currentDay}
              completionRate={completionRate}
              completedCount={completedCount}
              evidenceTotals={evidenceTotals}
            />
            <DayTimeline currentDay={currentDay} actions={actions} />
            <DecisionTree
              card={card}
              saving={saving}
              filterStatus={filterStatus}
              onFilterChange={setFilterStatus}
              dayGrouping={dayGrouping}
              onDayGroupingChange={setDayGrouping}
              filteredActions={filteredActions}
              groupedActions={groupedActions}
              onAddEvidence={addEvidence}
              onMarkDone={markDone}
              uploadingFile={uploadingFile}
              onFileUpload={handleFileUpload}
              onOpenDrawer={(action, index) => { setDrawerAction(action); setDrawerIndex(index); }}
            />
            {/* P1-8: Read-only case summary after review */}
            {card.result && (
              <ReadOnlyCaseSummary card={card} />
            )}
            <EvidenceSection actions={actions} />
          </section>

          <aside className="space-y-4">
            <SideCard title="任务进度">
              <Metric label="决策树节点" value={`${actions.length} 个`} />
              <Metric label="已完成节点" value={`${completedCount} 个`} tone="text-emerald-600" />
              <Metric label="有效证据" value={`${evidenceTotals.current} / ${evidenceTotals.target} 条`} />
              <Metric label="缺失证据" value={`${evidenceTotals.missing} 条`} tone={evidenceTotals.missing ? "text-orange-600" : "text-emerald-600"} />
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${completionRate}%` }} />
              </div>
            </SideCard>

            <SideCard title="继续/调整/暂停标准">
              <Criteria label="继续" value={card.decision_criteria?.continue_when} />
              <Criteria label="调整" value={card.decision_criteria?.adjust_when} />
              <Criteria label="暂停" value={card.decision_criteria?.pause_when} />
            </SideCard>

            <ReviewPanel card={card} saving={saving} onSubmit={submitReview} />

            <SideCard title="验证材料">
              <MaterialNote label="项目摘要" value={card.project_summary} />
              <MaterialNote label="核心判断" value={card.core_judgment} />
              <MaterialNote label="最大失败原因" value={card.failure_reason} />
            </SideCard>
          </aside>
        </div>
      ) : null}

      {/* P1-3: Node detail drawer */}
      {drawerAction && (
        <NodeDetailDrawer
          action={drawerAction}
          index={drawerIndex}
          cardId={card?.id ?? ""}
          saving={saving}
          onClose={() => { setDrawerAction(null); setDrawerIndex(-1); }}
          onAddEvidence={addEvidence}
          onMarkDone={markDone}
          uploadingFile={uploadingFile}
          onFileUpload={handleFileUpload}
        />
      )}
    </main>
  );
}

function TaskHero({
  card,
  currentDay,
  completionRate,
  completedCount,
  evidenceTotals,
}: {
  card: ValidationCard;
  currentDay: number;
  completionRate: number;
  completedCount: number;
  evidenceTotals: EvidenceTotals;
}) {
  return (
    <section className="dashboard-card overflow-hidden rounded-2xl">
      <div className="border-b border-line px-5 py-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
          <span className="rounded-lg bg-[#f0edff] px-2.5 py-1 text-brand">{statusLabel(card.status)}</span>
          <span className={cn("rounded-lg px-2.5 py-1", resultTone(card.result))}>{card.result ? resultLabel(card.result) : "未复盘"}</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-500">Day {currentDay} / 7</span>
        </div>
        <h2 className="mt-3 text-[25px] font-black leading-tight tracking-[-0.02em] text-ink">{card.title}</h2>
        <p className="mt-2 max-w-4xl text-[13px] font-semibold leading-6 text-slate-500">
          {card.biggest_uncertainty || "围绕当前投入决策，持续补充关键假设、验证动作和证据。"}
        </p>
      </div>
      <div className="grid gap-px bg-line md:grid-cols-4">
        <HeroMetric icon="target" label="目标客户" value={card.target_customer || "待补充"} />
        <HeroMetric icon="clipboard" label="节点完成" value={`${completedCount} / ${card.actions.length}`} />
        <HeroMetric icon="file-check" label="证据进度" value={`${evidenceTotals.current} / ${evidenceTotals.target}`} />
        <HeroMetric icon="activity" label="动作均值" value={`${completionRate}%`} />
      </div>
    </section>
  );
}

function DayTimeline({ currentDay, actions }: { currentDay: number; actions: ValidationAction[] }) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-[17px] font-black text-ink">7 天验证路径</h2>
        <span className="text-[12px] font-bold text-slate-400">每天推进一个证据关口</span>
      </div>
      <div className="relative grid grid-cols-8 gap-2">
        <div className="absolute left-8 right-8 top-[17px] h-px bg-line" />
        {dayLabels.map((label, day) => {
          const state = day < currentDay ? "done" : day === currentDay ? "active" : "todo";
          const count = actions.filter((item) => actionDay(item) === day).length;
          return (
            <div key={label} className="relative z-10 flex min-w-0 flex-col items-center text-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-black",
                  state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                  state === "active" && "border-brand bg-white text-brand",
                  state === "todo" && "border-slate-200 bg-slate-100 text-slate-400"
                )}
              >
                {state === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : day}
              </div>
              <div className={cn("mt-2 text-[12px] font-black", state === "active" ? "text-brand" : "text-[#172452]")}>Day {day}</div>
              <div className="mt-1 min-h-[28px] text-[11px] font-semibold leading-4 text-slate-500">{label}</div>
              {count > 0 && <div className="mt-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">{count} 节点</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DecisionTree({
  card,
  saving,
  filterStatus,
  onFilterChange,
  dayGrouping,
  onDayGroupingChange,
  filteredActions,
  groupedActions,
  onAddEvidence,
  onMarkDone,
  uploadingFile,
  onFileUpload,
  onOpenDrawer,
}: {
  card: ValidationCard;
  saving: SaveState | null;
  filterStatus: ActionFilter;
  onFilterChange: (f: ActionFilter) => void;
  dayGrouping: DayGrouping;
  onDayGroupingChange: (g: DayGrouping) => void;
  filteredActions: ValidationAction[];
  groupedActions: [number, ValidationAction[]][] | null;
  onAddEvidence: (actionIndex: number, text: string, grade?: string | null, sourceType?: string | null, attachmentUrl?: string | null, attachmentName?: string | null) => Promise<void>;
  onMarkDone: (index: number) => Promise<void>;
  uploadingFile: number | null;
  onFileUpload: (actionIndex: number, file: File) => Promise<{ url: string; name: string } | null>;
  onOpenDrawer: (action: ValidationAction, index: number) => void;
}) {
  const actions = card.actions ?? [];

  // Build a map from node_id to index in the original actions array
  const nodeIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    actions.forEach((a, i) => { if (a.node_id) map.set(a.node_id, i); });
    return map;
  }, [actions]);

  // Count per filter status
  const counts = useMemo(() => ({
    all: actions.length,
    todo: actions.filter((a) => a.status === "todo").length,
    running: actions.filter((a) => a.status === "running").length,
    done: actions.filter((a) => a.status === "done").length,
    blocked: actions.filter((a) => a.status === "blocked").length,
  }), [actions]);

  const filterButtons: { key: ActionFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "todo", label: "待验证" },
    { key: "running", label: "进行中" },
    { key: "done", label: "已完成" },
    { key: "blocked", label: "已阻塞" },
  ];

  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-black text-ink">完整决策树节点</h2>
            <p className="mt-1 text-[12px] font-semibold text-slate-500">节点数量不固定，按假设分支深度展开；每个节点都要补齐自己的证据。</p>
          </div>
          {/* P1-2: Day grouping toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400">展示:</span>
            <button
              type="button"
              onClick={() => onDayGroupingChange("flat")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-black",
                dayGrouping === "flat" ? "bg-brand text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              平铺
            </button>
            <button
              type="button"
              onClick={() => onDayGroupingChange("by-day")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-black",
                dayGrouping === "by-day" ? "bg-brand text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              按天分组
            </button>
          </div>
          <span className="rounded-xl bg-[#f7f8ff] px-3 py-2 text-[12px] font-black text-brand">{actions.length} 个节点</span>
        </div>

        {/* P1-1: filter bar */}
        <div className="flex flex-wrap items-center gap-1.5">
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onFilterChange(key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-black transition-colors",
                filterStatus === key
                  ? "bg-[#f0edff] text-brand"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              )}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {filteredActions.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-[13px] font-bold text-slate-400">该筛选条件下暂无节点</div>
      ) : groupedActions ? (
        /* P1-2: Day grouped view */
        <div className="space-y-6">
          {groupedActions.map(([day, dayActions]) => (
            <div key={`day-${day}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-black text-white">D{day}</span>
                <span className="text-[13px] font-black text-[#172452]">{dayLabels[day] || `Day ${day}`}</span>
                <span className="text-[11px] font-bold text-slate-400">{dayActions.length} 个节点</span>
              </div>
              <div className="space-y-3">
                {dayActions.map((action) => {
                  const realIndex = nodeIndexMap.get(action.node_id) ?? actions.indexOf(action);
                  return (
                    <TreeNode
                      key={`${action.node_id || realIndex}-${action.title}`}
                      index={realIndex < 0 ? actions.indexOf(action) : realIndex}
                      action={action}
                      depth={treeDepth(action, actions)}
                      saving={saving}
                      onAddEvidence={onAddEvidence}
                      onMarkDone={onMarkDone}
                      uploadingFile={uploadingFile}
                      onFileUpload={onFileUpload}
                      onOpenDrawer={() => onOpenDrawer(action, realIndex < 0 ? actions.indexOf(action) : realIndex)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat view */
        <div className="space-y-3">
          {filteredActions.map((action) => {
            const realIndex = nodeIndexMap.get(action.node_id) ?? actions.indexOf(action);
            return (
              <TreeNode
                key={`${action.node_id || realIndex}-${action.title}`}
                index={realIndex < 0 ? actions.indexOf(action) : realIndex}
                action={action}
                depth={treeDepth(action, actions)}
                saving={saving}
                onAddEvidence={onAddEvidence}
                onMarkDone={onMarkDone}
                uploadingFile={uploadingFile}
                onFileUpload={onFileUpload}
                onOpenDrawer={() => onOpenDrawer(action, realIndex < 0 ? actions.indexOf(action) : realIndex)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function TreeNode({
  action,
  index,
  depth,
  saving,
  onAddEvidence,
  onMarkDone,
  uploadingFile,
  onFileUpload,
  onOpenDrawer,
}: {
  action: ValidationAction;
  index: number;
  depth: number;
  saving: SaveState | null;
  onAddEvidence: (actionIndex: number, text: string, grade?: string | null, sourceType?: string | null, attachmentUrl?: string | null, attachmentName?: string | null) => Promise<void>;
  onMarkDone: (index: number) => Promise<void>;
  uploadingFile: number | null;
  onFileUpload: (actionIndex: number, file: File) => Promise<{ url: string; name: string } | null>;
  onOpenDrawer: () => void;
}) {
  const [evidenceText, setEvidenceText] = useState("");
  // P1-4: evidence grade
  const [evidenceGrade, setEvidenceGrade] = useState<string>("");
  // P1-5: evidence source type
  const [evidenceSourceType, setEvidenceSourceType] = useState<string>("");
  // P1-6: evidence attachment
  const [attachmentFile, setAttachmentFile] = useState<{ name: string; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = Math.max(1, action.evidence_target || 3);
  const count = Math.max(action.evidence_count ?? 0, action.evidence_items?.length ?? 0);
  const evidenceRate = Math.min(100, Math.round((count / target) * 100));
  const missing = Math.max(0, target - count);
  const isAdding = saving?.key === `evidence-${index}`;
  const isDone = saving?.key === `done-${index}`;
  const isUploading = uploadingFile === index;

  async function submitEvidence() {
    if (!evidenceText.trim()) return;
    await onAddEvidence(
      index,
      evidenceText,
      evidenceGrade || null,
      evidenceSourceType || null,
      attachmentFile?.url || null,
      attachmentFile?.name || null
    );
    setEvidenceText("");
    setEvidenceGrade("");
    setEvidenceSourceType("");
    setAttachmentFile(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await onFileUpload(index, file);
    if (result) {
      setAttachmentFile({ name: result.name, url: result.url });
    }
  }

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white px-4 py-4 shadow-[0_10px_28px_rgba(39,55,105,0.04)] cursor-pointer transition-shadow hover:shadow-md",
        action.status === "done" ? "border-emerald-100" : missing ? "border-orange-100" : "border-line"
      )}
      style={{ marginLeft: `${Math.min(depth, 4) * 18}px` }}
      onClick={onOpenDrawer}
      title="点击查看完整节点详情"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[#f0edff] px-2 py-1 text-[11px] font-black text-brand">{nodeTypeLabel(action.node_type)}</span>
            <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", actionStatusTone(action.status))}>
              {actionStatusLabel(action.status)}
            </span>
            {action.day_range && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">{action.day_range}</span>}
            {bestEvidenceGrade(action) && gradeShortLabels[bestEvidenceGrade(action)!] && (
              <span className={cn("rounded-lg border px-1.5 py-0.5 text-[10px] font-black", gradeTones[bestEvidenceGrade(action)!] || "bg-slate-50 text-slate-500 border-slate-200")}>
                证据 {gradeShortLabels[bestEvidenceGrade(action)!]}
              </span>
            )}
            <span className="text-[10px] font-bold text-slate-400 hover:text-brand" title="点击打开详情抽屉">
              详情 →
            </span>
          </div>
          {action.branch_condition && <div className="mt-3 text-[11px] font-black text-orange-500">{action.branch_condition}</div>}
          <h3 className="mt-2 text-[16px] font-black leading-6 text-[#172452]">{action.title}</h3>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-slate-500">{action.objective || "待补充验证目标"}</p>
          <p className="mt-2 text-[12px] font-bold leading-5 text-emerald-600">假设：{action.grounded_on || "待补充"}</p>

          <div className="mt-3 grid gap-2 text-[12px] font-semibold leading-5 text-[#172452] md:grid-cols-2">
            <InfoLine label="成功标准" value={action.success_metric} />
            <InfoLine label="验证对象" value={action.target || "待补充"} />
            <InfoLine label="基线" value={action.baseline || "待补充"} />
            <InfoLine label="负责人" value={action.owner || "未设置"} />
          </div>
        </div>

        <div className="rounded-2xl bg-[#f8f9ff] px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between text-[12px] font-black text-[#172452]">
            <span>证据进度</span>
            <span>{count}/{target} 条</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white">
            <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${Math.max(count ? 8 : 0, evidenceRate)}%` }} />
          </div>
          <div className={cn("mt-2 text-[11px] font-bold", missing ? "text-orange-500" : "text-emerald-600")}>
            {missing ? `缺 ${missing} 条有效证据` : "证据已满足最低要求"}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onMarkDone(index)}
              disabled={isDone || action.status === "done"}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-[12px] font-black text-emerald-600 disabled:opacity-50"
            >
              <Icon name={isDone ? "refresh" : "check"} className={cn("h-3.5 w-3.5", isDone && "animate-spin")} />
              完成
            </button>
          </div>
        </div>
      </div>

      {/* Evidence input area */}
      <div className="mt-4 rounded-2xl border border-line bg-white px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-2">
          <textarea
            value={evidenceText}
            onChange={(event) => setEvidenceText(event.target.value)}
            className="min-h-[56px] flex-1 resize-none rounded-xl border border-line bg-slate-50 px-3 py-2 text-[12px] font-semibold leading-5 text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
            placeholder="录入这条节点的证据，例如：访谈 5 位目标客户，其中 3 位愿意试用，1 位愿意支付订金..."
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* P1-4: Evidence grade selector */}
            <select
              value={evidenceGrade}
              onChange={(e) => setEvidenceGrade(e.target.value)}
              className="h-9 rounded-xl border border-line bg-white px-2 text-[11px] font-bold text-[#172452] outline-none focus:border-brand/50"
            >
              <option value="">证据等级</option>
              <option value="A">A 级 — 强证据</option>
              <option value="B">B 级 — 中证据</option>
              <option value="C">C 级 — 弱证据</option>
              <option value="D">D 级 — 参考</option>
            </select>
            {/* P1-5: Evidence source type selector */}
            <select
              value={evidenceSourceType}
              onChange={(e) => setEvidenceSourceType(e.target.value)}
              className="h-9 rounded-xl border border-line bg-white px-2 text-[11px] font-bold text-[#172452] outline-none focus:border-brand/50"
            >
              <option value="">来源类型</option>
              {Object.entries(sourceTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {/* P1-6: Evidence attachment */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex h-9 items-center gap-1 rounded-xl border border-dashed border-line bg-white px-2 text-[11px] font-bold text-slate-500 hover:border-brand/30 hover:text-brand disabled:opacity-50"
            >
              <Icon name={isUploading ? "refresh" : "clipboard"} className={cn("h-3 w-3", isUploading && "animate-spin")} />
              {attachmentFile ? attachmentFile.name : "附件"}
            </button>
            <button
              type="button"
              onClick={submitEvidence}
              disabled={isAdding || !evidenceText.trim()}
              className="ml-auto flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[12px] font-black text-white shadow-[0_12px_26px_rgba(101,84,255,0.24)] disabled:opacity-50"
            >
              <Icon name={isAdding ? "refresh" : "plus"} className={cn("h-3.5 w-3.5", isAdding && "animate-spin")} />
              入账证据
            </button>
          </div>
        </div>
        {saving?.key === `evidence-${index}` && saving.message && (
          <div className="mt-2 text-[11px] font-bold text-slate-400">{saving.message}</div>
        )}
      </div>
    </article>
  );
}

/* P1-3: Node Detail Drawer */
function NodeDetailDrawer({
  action,
  index,
  cardId,
  saving,
  onClose,
  onAddEvidence,
  onMarkDone,
  uploadingFile,
  onFileUpload,
}: {
  action: ValidationAction;
  index: number;
  cardId: string;
  saving: SaveState | null;
  onClose: () => void;
  onAddEvidence: (actionIndex: number, text: string, grade?: string | null, sourceType?: string | null, attachmentUrl?: string | null, attachmentName?: string | null) => Promise<void>;
  onMarkDone: (index: number) => Promise<void>;
  uploadingFile: number | null;
  onFileUpload: (actionIndex: number, file: File) => Promise<{ url: string; name: string } | null>;
}) {
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceGrade, setEvidenceGrade] = useState<string>("");
  const [evidenceSourceType, setEvidenceSourceType] = useState<string>("");
  const [attachmentFile, setAttachmentFile] = useState<{ name: string; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = Math.max(1, action.evidence_target || 3);
  const count = Math.max(action.evidence_count ?? 0, action.evidence_items?.length ?? 0);
  const evidenceRate = Math.min(100, Math.round((count / target) * 100));
  const missing = Math.max(0, target - count);
  const isAdding = saving?.key === `evidence-${index}`;
  const isDone = saving?.key === `done-${index}`;
  const isUploading = uploadingFile === index;

  async function submitEvidence() {
    if (!evidenceText.trim()) return;
    await onAddEvidence(
      index,
      evidenceText,
      evidenceGrade || null,
      evidenceSourceType || null,
      attachmentFile?.url || null,
      attachmentFile?.name || null
    );
    setEvidenceText("");
    setEvidenceGrade("");
    setEvidenceSourceType("");
    setAttachmentFile(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await onFileUpload(index, file);
    if (result) {
      setAttachmentFile({ name: result.name, url: result.url });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      {/* Drawer */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-black text-ink truncate">节点详情</h2>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">节点 #{index + 1}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100">
            <Icon name="x" className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 px-5 py-4">
          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[#f0edff] px-2 py-1 text-[11px] font-black text-brand">{nodeTypeLabel(action.node_type)}</span>
            <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", actionStatusTone(action.status))}>
              {actionStatusLabel(action.status)}
            </span>
            {action.day_range && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">{action.day_range}</span>}
          </div>

          {action.branch_condition && (
            <div className="rounded-xl bg-orange-50 px-3 py-2 text-[12px] font-black text-orange-500">{action.branch_condition}</div>
          )}

          <div>
            <h3 className="text-[20px] font-black leading-7 text-[#172452]">{action.title}</h3>
            <p className="mt-2 text-[13px] font-semibold leading-6 text-slate-500">{action.objective || "待补充"}</p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
            <DetailRow label="假设基础" value={action.grounded_on || "待补充"} icon="flag" />
            <DetailRow label="成功标准" value={action.success_metric} icon="target" />
            <DetailRow label="验证对象" value={action.target || "待补充"} icon="users" />
            <DetailRow label="基线" value={action.baseline || "待补充"} icon="activity" />
            <DetailRow label="负责人" value={action.owner || "未设置"} icon="user" />
            <DetailRow label="预计时间" value={action.day_range} icon="clock" />
          </div>

          {action.steps?.length > 0 && (
            <div className="rounded-2xl bg-[#f7f8ff] px-4 py-4">
              <div className="mb-3 text-[12px] font-black text-brand">执行步骤</div>
              <ol className="space-y-2">
                {action.steps.map((step, stepIndex) => (
                  <li key={`drawer-step-${stepIndex}`} className="flex gap-3 text-[12px] font-semibold leading-6 text-[#172452]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-black text-white">{stepIndex + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Evidence section in drawer */}
          <div className="rounded-2xl bg-white border border-line p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[14px] font-black text-ink">证据记录 ({count}/{target})</h4>
              <div className="flex items-center gap-1.5">
                <span className={cn("text-[11px] font-bold", missing ? "text-orange-500" : "text-emerald-600")}>
                  {missing ? `缺 ${missing} 条` : "已满足"}
                </span>
              </div>
            </div>

            {/* Existing evidence items */}
            {action.evidence_items && action.evidence_items.length > 0 ? (
              <div className="mb-4 space-y-2">
                {action.evidence_items.map((item, eiIndex) => (
                  <div key={`dr-ei-${eiIndex}`} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="text-[12px] font-semibold leading-5 text-[#172452]">{item.text}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {item.grade && (
                        <span className={cn("rounded-md border px-1.5 py-0.5 font-black", gradeTones[item.grade] || "")}>
                          {gradeShortLabels[item.grade]} 级
                        </span>
                      )}
                      {item.source_type && (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 font-bold text-slate-500">
                          {sourceTypeLabels[item.source_type] || item.source_type}
                        </span>
                      )}
                      {item.attachment_name && (
                        <a href={item.attachment_url || "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-blue-50 px-1.5 py-0.5 font-bold text-blue-600 underline">
                          📎 {item.attachment_name}
                        </a>
                      )}
                      {item.created_at && (
                        <span className="text-slate-400">{formatTime(item.created_at)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-4 rounded-xl bg-slate-50 px-3 py-3 text-center text-[11px] font-bold text-slate-400">暂无证据记录</div>
            )}

            {/* Add evidence in drawer */}
            <div className="space-y-2">
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                className="min-h-[56px] w-full resize-none rounded-xl border border-line bg-slate-50 px-3 py-2 text-[12px] font-semibold leading-5 text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
                placeholder="添加证据..."
              />
              <div className="flex flex-wrap items-center gap-2">
                <select value={evidenceGrade} onChange={(e) => setEvidenceGrade(e.target.value)} className="h-9 rounded-xl border border-line bg-white px-2 text-[11px] font-bold text-[#172452] outline-none focus:border-brand/50">
                  <option value="">证据等级</option>
                  <option value="A">A 级 — 强证据</option>
                  <option value="B">B 级 — 中证据</option>
                  <option value="C">C 级 — 弱证据</option>
                  <option value="D">D 级 — 参考</option>
                </select>
                <select value={evidenceSourceType} onChange={(e) => setEvidenceSourceType(e.target.value)} className="h-9 rounded-xl border border-line bg-white px-2 text-[11px] font-bold text-[#172452] outline-none focus:border-brand/50">
                  <option value="">来源类型</option>
                  {Object.entries(sourceTypeLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp" />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                  className="flex h-9 items-center gap-1 rounded-xl border border-dashed border-line bg-white px-2 text-[11px] font-bold text-slate-500 hover:border-brand/30 disabled:opacity-50">
                  <Icon name={isUploading ? "refresh" : "clipboard"} className={cn("h-3 w-3", isUploading && "animate-spin")} />
                  {attachmentFile ? attachmentFile.name : "附件"}
                </button>
                <button type="button" onClick={submitEvidence} disabled={isAdding || !evidenceText.trim()}
                  className="ml-auto flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[12px] font-black text-white disabled:opacity-50">
                  <Icon name={isAdding ? "refresh" : "plus"} className={cn("h-3.5 w-3.5", isAdding && "animate-spin")} />
                  入账
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-line bg-white px-5 py-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="flex h-9 items-center rounded-xl border border-line bg-white px-4 text-[12px] font-black text-slate-500 hover:bg-slate-50">
            关闭
          </button>
          <button
            type="button"
            onClick={() => onMarkDone(index)}
            disabled={isDone || action.status === "done"}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-[12px] font-black text-white disabled:opacity-50"
          >
            <Icon name={isDone ? "refresh" : "check"} className={cn("h-3.5 w-3.5", isDone && "animate-spin")} />
            {action.status === "done" ? "已完成" : "标记完成"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-[11px] font-black text-slate-400">{label}</div>
        <div className="text-[13px] font-bold leading-5 text-[#172452]">{value || "待补充"}</div>
      </div>
    </div>
  );
}

/* P1-8: Read-only case summary — shown after review submitted */
function ReadOnlyCaseSummary({ card }: { card: ValidationCard }) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5 border-2 border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="check-circle" className="h-5 w-5 text-emerald-500" />
        <h2 className="text-[17px] font-black text-emerald-700">复盘结论（只读）</h2>
      </div>
      <div className="space-y-3">
        <CaseSummaryRow label="最终决策" value={resultLabel(card.result || "")} tone={resultTone(card.result)} />
        <CaseSummaryRow label="实际结果" value={card.actual_outcome || "未填写"} />
        <CaseSummaryRow label="复盘学习" value={card.learnings || "未填写"} />
        <CaseSummaryRow label="复盘时间" value={card.validated_at ? formatTime(card.validated_at) : "未记录"} />
      </div>
      <p className="mt-4 text-[11px] font-semibold text-slate-400">
        此验证卡已提交复盘，以上结论为只读记录。如需修改请在工作台操作。
      </p>
    </section>
  );
}

function CaseSummaryRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-emerald-100 last:border-0">
      <span className="text-[12px] font-bold text-slate-500">{label}</span>
      <span className={cn("text-[12px] font-black", tone || "text-[#172452]")}>{value}</span>
    </div>
  );
}

function EvidenceSection({ actions }: { actions: ValidationAction[] }) {
  const rows = actions.flatMap((action, actionIndex) =>
    (action.evidence_items ?? []).map((item, index) => ({ action, actionIndex, item, index }))
  );
  return (
    <section id="evidence" className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-black text-ink">证据中心</h2>
        <span className="text-[12px] font-bold text-slate-400">{rows.length} 条证据</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-[13px] font-bold text-slate-400">
          暂无证据记录。先在上方任一节点录入访谈、付费、渠道或成本证据。
        </div>
      ) : (
        <div className="divide-y divide-line">
          {rows.map(({ action, item, actionIndex, index }) => (
            <div key={`${action.node_id || actionIndex}-${index}`} className="grid gap-3 py-3 md:grid-cols-[200px_1fr_100px]">
              <div>
                <div className="text-[11px] font-black text-brand">节点 {actionIndex + 1}</div>
                <div className="mt-1 line-clamp-2 text-[12px] font-black leading-5 text-[#172452]">{action.title}</div>
              </div>
              <div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold leading-6 text-[#172452]">{item.text}</div>
                {item.grade && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={cn("inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-black", gradeTones[item.grade] || "")}>
                      {gradeShortLabels[item.grade]} 级证据
                    </span>
                    {item.source_type && (
                      <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                        {sourceTypeLabels[item.source_type] || item.source_type}
                      </span>
                    )}
                    {item.attachment_name && (
                      <a href={item.attachment_url || "#"} target="_blank" rel="noopener noreferrer"
                        className="inline-block rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 underline">
                        📎 {item.attachment_name}
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right text-[11px] font-semibold text-slate-400">{item.created_at ? formatTime(item.created_at) : ""}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewPanel({
  card,
  saving,
  onSubmit,
}: {
  card: ValidationCard;
  saving: SaveState | null;
  onSubmit: (payload: {
    final_decision: "continue" | "adjust" | "pause";
    interview_count: number;
    paid_intent_count: number;
    rejection_reasons: string[];
    channel_quotes: string[];
    estimated_cac: string;
    actual_outcome: string;
    learnings: string;
  }) => Promise<void>;
}) {
  const [decision, setDecision] = useState<ReviewDecision>(resultToDecision(card.result));
  const [interviewCount, setInterviewCount] = useState("");
  const [paidIntentCount, setPaidIntentCount] = useState("");
  const [estimatedCac, setEstimatedCac] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState("");
  const [channelQuotes, setChannelQuotes] = useState("");
  const [actualOutcome, setActualOutcome] = useState(card.actual_outcome || "");
  const [learnings, setLearnings] = useState(card.learnings || "");
  const isSaving = saving?.key === "review";

  async function submit() {
    if (!decision) return;
    await onSubmit({
      final_decision: decision,
      interview_count: toNumber(interviewCount),
      paid_intent_count: toNumber(paidIntentCount),
      rejection_reasons: splitList(rejectionReasons),
      channel_quotes: splitList(channelQuotes),
      estimated_cac: estimatedCac.trim(),
      actual_outcome: actualOutcome.trim(),
      learnings: learnings.trim(),
    });
  }

  return (
    <SideCard title="Day 7 复盘">
      {card.result && (
        <div className={cn("mb-3 rounded-xl px-3 py-2 text-[12px] font-black", resultTone(card.result))}>
          当前结论：{resultLabel(card.result)}
        </div>
      )}
      <div className="space-y-2">
        <select
          value={decision}
          onChange={(event) => setDecision(event.target.value as ReviewDecision)}
          className="h-10 w-full rounded-xl border border-line bg-white px-3 text-[12px] font-bold text-[#172452] outline-none focus:border-brand/50"
        >
          <option value="">选择最终决策</option>
          <option value="continue">继续投入</option>
          <option value="adjust">调整后再投入</option>
          <option value="pause">暂停投入</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <CompactInput value={interviewCount} onChange={setInterviewCount} placeholder="访谈人数" />
          <CompactInput value={paidIntentCount} onChange={setPaidIntentCount} placeholder="付费意向数" />
        </div>
        <CompactInput value={estimatedCac} onChange={setEstimatedCac} placeholder="预估 CAC / 成本" />
        <CompactTextarea value={rejectionReasons} onChange={setRejectionReasons} placeholder="拒绝原因，用换行或逗号分隔" />
        <CompactTextarea value={channelQuotes} onChange={setChannelQuotes} placeholder="渠道报价、合作条件、客户原话" />
        <CompactTextarea value={actualOutcome} onChange={setActualOutcome} placeholder="实际验证结果" />
        <CompactTextarea value={learnings} onChange={setLearnings} placeholder="复盘学习与下次修正" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400">{isSaving && saving?.message}</span>
        <button
          type="button"
          onClick={submit}
          disabled={isSaving || !decision}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-[12px] font-black text-white disabled:opacity-50"
        >
          <Icon name={isSaving ? "refresh" : "check"} className={cn("h-3.5 w-3.5", isSaving && "animate-spin")} />
          提交复盘
        </button>
      </div>
      {saving?.key === "review" && saving.message && !isSaving && (
        <div className="mt-2 text-[11px] font-bold text-slate-400">{saving.message}</div>
      )}
    </SideCard>
  );
}

function HeroMetric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <Icon name={icon} className="h-4 w-4 text-brand" />
      <div className="mt-3 text-[12px] font-bold text-slate-400">{label}</div>
      <div className="mt-1 line-clamp-2 text-[15px] font-black leading-5 text-[#172452]">{value}</div>
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dashboard-card rounded-2xl px-4 py-4">
      <h3 className="mb-3 text-[15px] font-black text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, tone = "text-[#172452]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12px] font-bold">
      <span className="text-slate-500">{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

function Criteria({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-black text-brand">{label}</div>
      <div className="mt-1 text-[12px] font-bold leading-5 text-[#172452]">{value || "待补充"}</div>
    </div>
  );
}

function MaterialNote({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-black text-slate-400">{label}</div>
      <div className="mt-1 line-clamp-3 text-[12px] font-bold leading-5 text-[#172452]">{value || "待补充"}</div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-xl bg-white/70">
      <span className="text-slate-400">{label}：</span>
      <span>{value || "待补充"}</span>
    </div>
  );
}

function CompactInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
      placeholder={placeholder}
    />
  );
}

function CompactTextarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-[58px] w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] font-semibold leading-5 text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
      placeholder={placeholder}
    />
  );
}

type EvidenceTotals = {
  current: number;
  target: number;
  missing: number;
};

function actionEvidenceTotals(actions: ValidationAction[]): EvidenceTotals {
  return actions.reduce(
    (acc, action) => {
      const count = Math.max(action.evidence_count ?? 0, action.evidence_items?.length ?? 0);
      const target = Math.max(1, action.evidence_target || 3);
      acc.current += count;
      acc.target += target;
      acc.missing += Math.max(0, target - count);
      return acc;
    },
    { current: 0, target: 0, missing: 0 }
  );
}

function inferCurrentDay(card: ValidationCard | null, actions: ValidationAction[]): number {
  const metaDay = card?.meta?.current_day;
  if (typeof metaDay === "number" && Number.isFinite(metaDay)) return Math.min(7, Math.max(0, metaDay));
  if (typeof metaDay === "string" && Number.isFinite(Number(metaDay))) return Math.min(7, Math.max(0, Number(metaDay)));
  if (card?.validated_at || card?.result) return 7;
  const firstTodo = actions.find((action) => action.status !== "done");
  if (firstTodo) return Math.min(7, Math.max(1, actionDay(firstTodo)));
  return actions.length ? 7 : 0;
}

function actionDay(action: ValidationAction): number {
  if (typeof action.day === "number" && Number.isFinite(action.day)) return Math.min(7, Math.max(0, action.day));
  const match = action.day_range?.match(/\d+/);
  if (!match) return 1;
  return Math.min(7, Math.max(1, Number(match[0])));
}

function treeDepth(action: ValidationAction, actions: ValidationAction[]): number {
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

function chatHref(card: ValidationCard): string {
  const qs = new URLSearchParams();
  if (card.project_id) qs.set("projectId", card.project_id);
  qs.set("validationCardId", card.id);
  qs.set("focus", "1");
  return `/chat?${qs.toString()}`;
}

/* P1-7: Export validation card to Markdown */
function exportMarkdown(card: ValidationCard) {
  const lines: string[] = [];
  lines.push(`# ${card.title}`);
  lines.push("");
  lines.push(`> 状态: ${statusLabel(card.status)} | 复盘: ${card.result ? resultLabel(card.result) : "未复盘"}`);
  if (card.target_customer) lines.push(`> 目标客户: ${card.target_customer}`);
  if (card.biggest_uncertainty) lines.push(`> 最大不确定性: ${card.biggest_uncertainty}`);
  lines.push("");

  lines.push("## 决策树节点");
  lines.push("");
  for (let i = 0; i < card.actions.length; i++) {
    const a = card.actions[i];
    lines.push(`### ${i + 1}. ${a.title}  \`${actionStatusLabel(a.status)}\``);
    if (a.objective) lines.push(`- **目标**: ${a.objective}`);
    if (a.grounded_on) lines.push(`- **假设**: ${a.grounded_on}`);
    if (a.success_metric) lines.push(`- **成功标准**: ${a.success_metric}`);
    if (a.target) lines.push(`- **验证对象**: ${a.target}`);
    if (a.day_range) lines.push(`- **时间**: ${a.day_range}`);
    if (a.evidence_items && a.evidence_items.length > 0) {
      lines.push(`- **证据** (${a.evidence_items.length} 条):`);
      for (const e of a.evidence_items) {
        const meta: string[] = [];
        if (e.grade) meta.push(`${gradeShortLabels[e.grade] || e.grade}级`);
        if (e.source_type) meta.push(sourceTypeLabels[e.source_type] || e.source_type);
        const metaStr = meta.length ? ` *(${meta.join(", ")})*` : "";
        lines.push(`  - ${e.text}${metaStr}`);
      }
    }
    lines.push("");
  }

  if (card.decision_criteria) {
    lines.push("## 继续/调整/暂停标准");
    lines.push("");
    if (card.decision_criteria.continue_when) lines.push(`- **继续**: ${card.decision_criteria.continue_when}`);
    if (card.decision_criteria.adjust_when) lines.push(`- **调整**: ${card.decision_criteria.adjust_when}`);
    if (card.decision_criteria.pause_when) lines.push(`- **暂停**: ${card.decision_criteria.pause_when}`);
    lines.push("");
  }

  if (card.result) {
    lines.push("## 复盘结论");
    lines.push("");
    lines.push(`- **决策**: ${resultLabel(card.result)}`);
    if (card.actual_outcome) lines.push(`- **实际结果**: ${card.actual_outcome}`);
    if (card.learnings) lines.push(`- **复盘学习**: ${card.learnings}`);
  }

  const md = lines.join("\n");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${card.title.replace(/[<>:"/\\\\|?*]/g, "_").slice(0, 50)}_验证卡.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/** Return the highest evidence grade across all items for an action. */
function bestEvidenceGrade(action: ValidationAction): string | null {
  const items = action.evidence_items ?? [];
  if (!items.length) return null;
  const ranks: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
  let best = '';
  let bestRank = 0;
  for (const item of items) {
    const g = item.grade || '';
    const r = ranks[g] || 0;
    if (r > bestRank) { bestRank = r; best = g; }
  }
  return best || null;
}

function nodeTypeLabel(value: string): string {
  return { root: "根节点", evidence: "证据节点", branch: "分支节点", synthesis: "综合节点", action: "动作节点" }[value] || value;
}

function actionStatusLabel(value: string): string {
  return { todo: "待验证", running: "进行中", done: "已完成", blocked: "已阻塞" }[value] || value;
}

function actionStatusTone(value: string): string {
  if (value === "done") return "bg-emerald-50 text-emerald-600";
  if (value === "running") return "bg-blue-50 text-blue-600";
  if (value === "blocked") return "bg-orange-50 text-orange-600";
  return "bg-slate-100 text-slate-500";
}

function statusLabel(value: string): string {
  return { draft: "草稿", running: "验证中", completed: "已完成", archived: "已归档" }[value] || value;
}

function resultLabel(value: string): string {
  return { achieved: "建议继续", partially_achieved: "建议调整", not_achieved: "建议暂停" }[value] || value;
}

function resultTone(value?: string | null): string {
  if (value === "achieved") return "bg-emerald-50 text-emerald-600";
  if (value === "not_achieved") return "bg-rose-50 text-rose-500";
  if (value === "partially_achieved") return "bg-orange-50 text-orange-600";
  return "bg-slate-100 text-slate-500";
}

function resultToDecision(value?: ValidationCard["result"]): ReviewDecision {
  if (value === "achieved") return "continue";
  if (value === "not_achieved") return "pause";
  if (value === "partially_achieved") return "adjust";
  return "";
}

function splitList(value: string) {
  return value
    .split(/[\n,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
