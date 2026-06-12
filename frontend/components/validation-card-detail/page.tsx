"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Icon } from "@/components/icon";
import { ApiError, validationCardApi, type ValidationAction, type ValidationCard } from "@/lib/api";
import { cn } from "@/lib/utils";

type SaveState = {
  key: string;
  message: string | null;
};

type ReviewDecision = "continue" | "adjust" | "pause" | "";

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

export function ValidationCardDetailPage({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<ValidationCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveState | null>(null);

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

  async function addEvidence(actionIndex: number, text: string) {
    if (!card || !text.trim()) return;
    setSaving({ key: `evidence-${actionIndex}`, message: null });
    try {
      const updated = await validationCardApi.updateAction(card.id, actionIndex, { evidence_note: text.trim() });
      setCard(updated);
      setSaving({ key: `evidence-${actionIndex}`, message: "证据已入账" });
    } catch (e) {
      setSaving({ key: `evidence-${actionIndex}`, message: e instanceof ApiError ? e.message : "证据入账失败" });
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
          <div className="flex shrink-0 items-center gap-2">
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
              onAddEvidence={addEvidence}
              onMarkDone={markDone}
            />
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
  onAddEvidence,
  onMarkDone,
}: {
  card: ValidationCard;
  saving: SaveState | null;
  onAddEvidence: (index: number, text: string) => Promise<void>;
  onMarkDone: (index: number) => Promise<void>;
}) {
  const actions = card.actions ?? [];
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-black text-ink">完整决策树节点</h2>
          <p className="mt-1 text-[12px] font-semibold text-slate-500">节点数量不固定，按假设分支深度展开；每个节点都要补齐自己的证据。</p>
        </div>
        <span className="rounded-xl bg-[#f7f8ff] px-3 py-2 text-[12px] font-black text-brand">{actions.length} 个节点</span>
      </div>
      {actions.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-[13px] font-bold text-slate-400">暂无验证节点</div>
      ) : (
        <div className="space-y-3">
          {actions.map((action, index) => (
            <TreeNode
              key={`${action.node_id || index}-${action.title}`}
              index={index}
              action={action}
              depth={treeDepth(action, actions)}
              saving={saving}
              onAddEvidence={onAddEvidence}
              onMarkDone={onMarkDone}
            />
          ))}
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
}: {
  action: ValidationAction;
  index: number;
  depth: number;
  saving: SaveState | null;
  onAddEvidence: (index: number, text: string) => Promise<void>;
  onMarkDone: (index: number) => Promise<void>;
}) {
  const [evidenceText, setEvidenceText] = useState("");
  const target = Math.max(1, action.evidence_target || 3);
  const count = Math.max(action.evidence_count ?? 0, action.evidence_items?.length ?? 0);
  const evidenceRate = Math.min(100, Math.round((count / target) * 100));
  const missing = Math.max(0, target - count);
  const isAdding = saving?.key === `evidence-${index}`;
  const isDone = saving?.key === `done-${index}`;

  async function submitEvidence() {
    if (!evidenceText.trim()) return;
    await onAddEvidence(index, evidenceText);
    setEvidenceText("");
  }

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white px-4 py-4 shadow-[0_10px_28px_rgba(39,55,105,0.04)]",
        action.status === "done" ? "border-emerald-100" : missing ? "border-orange-100" : "border-line"
      )}
      style={{ marginLeft: `${Math.min(depth, 4) * 18}px` }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[#f0edff] px-2 py-1 text-[11px] font-black text-brand">{nodeTypeLabel(action.node_type)}</span>
            <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", actionStatusTone(action.status))}>
              {actionStatusLabel(action.status)}
            </span>
            {action.day_range && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">{action.day_range}</span>}
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

          {action.steps?.length > 0 && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3">
              <div className="mb-2 text-[11px] font-black text-slate-400">执行步骤</div>
              <ol className="space-y-1.5">
                {action.steps.map((step, stepIndex) => (
                  <li key={`${step}-${stepIndex}`} className="flex gap-2 text-[12px] font-semibold leading-5 text-[#172452]">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-brand">{stepIndex + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#f8f9ff] px-3 py-3">
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

      <div className="mt-4 rounded-2xl border border-line bg-white px-3 py-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <textarea
            value={evidenceText}
            onChange={(event) => setEvidenceText(event.target.value)}
            className="min-h-[56px] flex-1 resize-none rounded-xl border border-line bg-slate-50 px-3 py-2 text-[12px] font-semibold leading-5 text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
            placeholder="录入这条节点的证据，例如：访谈 5 位目标客户，其中 3 位愿意试用，1 位愿意支付订金..."
          />
          <button
            type="button"
            onClick={submitEvidence}
            disabled={isAdding || !evidenceText.trim()}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-[12px] font-black text-white shadow-[0_12px_26px_rgba(101,84,255,0.24)] disabled:opacity-50 md:self-end"
          >
            <Icon name={isAdding ? "refresh" : "plus"} className={cn("h-3.5 w-3.5", isAdding && "animate-spin")} />
            入账证据
          </button>
        </div>
        {saving?.key === `evidence-${index}` && saving.message && (
          <div className="mt-2 text-[11px] font-bold text-slate-400">{saving.message}</div>
        )}
      </div>
    </article>
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
            <div key={`${action.node_id || actionIndex}-${index}`} className="grid gap-3 py-3 md:grid-cols-[200px_1fr_120px]">
              <div>
                <div className="text-[11px] font-black text-brand">节点 {actionIndex + 1}</div>
                <div className="mt-1 line-clamp-2 text-[12px] font-black leading-5 text-[#172452]">{action.title}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold leading-6 text-[#172452]">{item.text}</div>
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
