"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import {
  ApiError,
  decisionCaseApi,
  projectApi,
  reportsApi,
  validationCardApi,
  type DecisionCase,
  type DiagnosisReport,
  type Project,
  type ProjectStatus,
  type ProjectTaskPack,
  type ValidationCard,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const statusMeta: Record<ProjectStatus, { label: string; tone: string; next?: ProjectStatus }> = {
  idea: { label: "想法池", tone: "bg-slate-100 text-slate-600", next: "validating" },
  validating: { label: "验证中", tone: "bg-indigo-50 text-brand", next: "trial" },
  trial: { label: "试点中", tone: "bg-blue-50 text-blue-600", next: "growth" },
  growth: { label: "增长中", tone: "bg-emerald-50 text-emerald-600" },
  paused: { label: "已暂停", tone: "bg-rose-50 text-rose-500", next: "validating" },
};

const taskPackMeta: Record<ProjectTaskPack, string> = {
  new_project: "新项目验证",
  sales_growth: "销售增长",
  ai_acquisition: "AI 获客",
  review: "经营复盘",
};

const validationResultMeta = {
  achieved: "达成",
  partially_achieved: "部分达成",
  not_achieved: "未达成",
} as const;

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "暂无";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "暂无";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dayDiff(iso: string | null | undefined) {
  if (!iso) return "尚未更新";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "尚未更新";
  const days = Math.max(0, Math.round((Date.now() - t) / 86400000));
  if (days === 0) return "今天更新";
  if (days === 1) return "昨天更新";
  return `${days} 天前更新`;
}

type DraftProject = {
  name: string;
  industry: string;
  target_customer: string;
  current_problem: string;
  task_pack: ProjectTaskPack;
};

const emptyDraft: DraftProject = {
  name: "",
  industry: "",
  target_customer: "",
  current_problem: "",
  task_pack: "new_project",
};

export function PortfolioPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<DiagnosisReport[]>([]);
  const [cards, setCards] = useState<ValidationCard[]>([]);
  const [cases, setCases] = useState<DecisionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<DraftProject>(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, reportRows, cardRows, caseRows] = await Promise.all([
        projectApi.list(),
        reportsApi.list(),
        validationCardApi.list(),
        decisionCaseApi.list(12),
      ]);
      setProjects(projectRows);
      setReports(reportRows);
      setCards(cardRows);
      setCases(caseRows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "经营档案加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) =>
      [project.name, project.industry, project.target_customer, project.current_problem]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(q))
    );
  }, [projects, query]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status === "validating" || p.status === "trial").length;
    return [
      { label: "经营档案", value: projects.length, unit: "个", icon: "archive", tone: "bg-indigo-50 text-brand" },
      { label: "验证中项目", value: active, unit: "个", icon: "target", tone: "bg-blue-50 text-blue-600" },
      { label: "诊断报告", value: reports.length, unit: "份", icon: "file-bar-chart", tone: "bg-emerald-50 text-emerald-600" },
      { label: "决策病例", value: cases.length, unit: "个", icon: "file-check", tone: "bg-orange-50 text-orange-500" },
    ];
  }, [cases.length, projects, reports.length]);

  const timeline = useMemo(() => {
    const reportItems = reports.slice(0, 6).map((report) => ({
      id: `report-${report.id}`,
      title: report.title,
      meta: `诊断报告 · ${fmtTime(report.created_at)}`,
      icon: "file-bar-chart",
      href: `/reports?reportId=${report.id}`,
    }));
    const cardItems = cards.slice(0, 6).map((card) => ({
      id: `card-${card.id}`,
      title: card.title,
      meta: `验证卡 · ${fmtTime(card.updated_at)}`,
      icon: "clipboard-check",
      href: `/validation-cards/${card.id}`,
    }));
    return [...reportItems, ...cardItems]
      .sort((a, b) => b.meta.localeCompare(a.meta))
      .slice(0, 6);
  }, [cards, reports]);

  async function createProject() {
    if (!draft.name.trim()) {
      setError("请先填写项目名称");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await projectApi.create({
        name: draft.name.trim(),
        industry: draft.industry.trim() || null,
        target_customer: draft.target_customer.trim(),
        current_problem: draft.current_problem.trim(),
        task_pack: draft.task_pack,
      });
      setDraft(emptyDraft);
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "新建项目失败");
    } finally {
      setSaving(false);
    }
  }

  async function moveNext(project: Project) {
    const next = statusMeta[project.status].next;
    if (!next) return;
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: next } : p)));
    try {
      await projectApi.update(project.id, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "项目状态更新失败");
      await load();
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-col gap-4 px-4 pt-5 md:px-8 md:pt-7 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[25px] font-black tracking-[-0.03em] text-ink md:text-[30px]">经营档案</h1>
            <span className="rounded-full bg-[#f0edff] px-3 py-1 text-[12px] font-bold text-brand">
              方法论复利
            </span>
          </div>
          <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-slate-500">
            把企业问题、资料、访谈、诊断报告、验证卡和复盘结论沉淀到同一个项目下，形成可追踪的商业决策资产。
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-line bg-white px-4 shadow-[0_12px_30px_rgba(30,58,138,0.05)] xl:w-[320px]">
            <Icon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
              placeholder="搜索项目、行业、客户或问题..."
            />
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="brand-gradient flex h-11 shrink-0 items-center gap-2 rounded-2xl px-4 text-[13px] font-bold text-white shadow-soft"
          >
            <Icon name="plus" className="h-4 w-4" />
            新建项目
          </button>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-5 md:px-8">
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => (
                <Card key={item.label} className="p-4">
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl", item.tone)}>
                    <Icon name={item.icon} className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-[12px] font-semibold text-slate-400">{item.label}</div>
                  <div className="mt-1 text-ink">
                    <span className="text-[26px] font-black">{item.value}</span>
                    <span className="ml-1 text-[12px] text-slate-400">{item.unit}</span>
                  </div>
                </Card>
              ))}
            </div>

            {showCreate && (
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-[16px] font-black text-ink">新建经营档案</h2>
                    <p className="mt-1 text-[12px] text-slate-400">先沉淀项目，再让访谈、资料和诊断围绕项目累积。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-brand"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label="项目名称" value={draft.name} onChange={(name) => setDraft((v) => ({ ...v, name }))} placeholder="例如：成都市场 GEO 服务验证" />
                  <Field label="行业/场景" value={draft.industry} onChange={(industry) => setDraft((v) => ({ ...v, industry }))} placeholder="例如：本地生活 / SaaS / AI 硬件" />
                  <Field label="目标客户" value={draft.target_customer} onChange={(target_customer) => setDraft((v) => ({ ...v, target_customer }))} placeholder="谁会为它付费？" />
                  <label className="space-y-1.5 text-[12px] font-bold text-[#172452]">
                    任务包
                    <select
                      value={draft.task_pack}
                      onChange={(event) => setDraft((v) => ({ ...v, task_pack: event.target.value as ProjectTaskPack }))}
                      className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] outline-none focus:border-brand/50"
                    >
                      {Object.entries(taskPackMeta).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-[12px] font-bold text-[#172452] lg:col-span-2">
                    当前核心问题
                    <textarea
                      value={draft.current_problem}
                      onChange={(event) => setDraft((v) => ({ ...v, current_problem: event.target.value }))}
                      className="min-h-[86px] w-full resize-none rounded-xl border border-line bg-white px-3 py-3 text-[13px] leading-6 outline-none focus:border-brand/50"
                      placeholder="现在最不确定、最需要验证的问题是什么？"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={createProject}
                    disabled={saving}
                    className="brand-gradient flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white shadow-soft disabled:opacity-50"
                  >
                    <Icon name={saving ? "refresh" : "check"} className={cn("h-4 w-4", saving && "animate-spin")} />
                    保存档案
                  </button>
                </div>
              </Card>
            )}

            {error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-500">
                {error}
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {loading && (
                <Card className="col-span-full p-8 text-center text-[13px] text-slate-400">
                  正在加载经营档案...
                </Card>
              )}
              {!loading && filtered.length === 0 && (
                <Card className="col-span-full flex min-h-[260px] flex-col items-center justify-center p-8 text-center">
                  <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft">
                    <Icon name="archive" className="h-7 w-7 text-white" />
                  </div>
                  <h2 className="mt-5 text-[18px] font-black text-ink">还没有经营档案</h2>
                  <p className="mt-2 max-w-[420px] text-[13px] leading-6 text-slate-500">
                    从一个真实企业问题开始建档，后续访谈、资料、诊断和验证计划都会沉淀到这里。
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="mt-5 rounded-xl bg-[#f0edff] px-4 py-2.5 text-[13px] font-bold text-brand"
                  >
                    创建第一个项目
                  </button>
                </Card>
              )}
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} onMoveNext={() => moveNext(project)} />
              ))}
            </div>
          </div>

          <aside className="space-y-5">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-black text-ink">档案时间线</h2>
                <button
                  type="button"
                  onClick={load}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-slate-500 hover:text-brand"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  刷新
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {timeline.length === 0 && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-400">
                    暂无诊断或验证记录
                  </div>
                )}
                {timeline.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    className="flex gap-3 rounded-2xl border border-line bg-white p-3 transition-colors hover:border-brand/30"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0edff] text-brand">
                      <Icon name={item.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold text-[#172452]">{item.title}</span>
                      <span className="mt-1 block text-[11px] text-slate-400">{item.meta}</span>
                    </span>
                  </a>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[16px] font-black text-ink">决策病例库</h2>
                <p className="mt-1 text-[12px] text-slate-400">第7天复盘后沉淀的结果标签与方法资产。</p>
              </div>
              <div className="space-y-3 p-5">
                {cases.slice(0, 4).map((item) => (
                  <DecisionCaseCard key={item.id} item={item} />
                ))}
                {cases.length === 0 && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-400">
                    暂无已复盘病例
                  </div>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[16px] font-black text-ink">本周验证动作</h2>
                <p className="mt-1 text-[12px] text-slate-400">从 AI 回答和诊断报告沉淀出的下一步验证。</p>
              </div>
              <div className="space-y-3 p-5">
                {cards.slice(0, 4).map((card) => (
                  <ValidationFeedbackCard key={card.id} card={card} onSaved={load} />
                ))}
                {cards.length === 0 && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-400">
                    暂无验证卡
                  </div>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ValidationFeedbackCard({ card, onSaved }: { card: ValidationCard; onSaved: () => Promise<void> }) {
  const [result, setResult] = useState<ValidationCard["result"]>(card.result ?? null);
  const [actualOutcome, setActualOutcome] = useState(card.actual_outcome || "");
  const [learnings, setLearnings] = useState(card.learnings || "");
  const [interviewCount, setInterviewCount] = useState("");
  const [paidIntentCount, setPaidIntentCount] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState("");
  const [channelQuotes, setChannelQuotes] = useState("");
  const [estimatedCac, setEstimatedCac] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveFeedback() {
    if (!result) {
      setMessage("请选择验证结果");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await validationCardApi.submitReview(card.id, {
        final_decision: result === "achieved" ? "continue" : result === "not_achieved" ? "pause" : "adjust",
        interview_count: toNumber(interviewCount),
        paid_intent_count: toNumber(paidIntentCount),
        rejection_reasons: splitList(rejectionReasons),
        channel_quotes: splitList(channelQuotes),
        estimated_cac: estimatedCac.trim(),
        actual_outcome: actualOutcome.trim(),
        learnings: learnings.trim(),
      });
      setMessage("已完成第7天复盘，已沉淀到经营档案与病例库");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "回填失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-[#f7f8ff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-[#172452]">{card.title}</div>
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-500">
            {card.biggest_uncertainty}
          </p>
        </div>
        {card.result && (
          <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-brand">
            {validationResultMeta[card.result]}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2">
        <select
          value={result ?? ""}
          onChange={(event) => setResult((event.target.value || null) as ValidationCard["result"])}
          className="h-9 rounded-xl border border-line bg-white px-3 text-[12px] font-semibold text-[#172452] outline-none focus:border-brand/50"
        >
          <option value="">选择验证结果</option>
          {Object.entries(validationResultMeta).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={interviewCount}
            onChange={(event) => setInterviewCount(event.target.value)}
            className="h-9 rounded-xl border border-line bg-white px-3 text-[12px] outline-none placeholder:text-slate-400 focus:border-brand/50"
            placeholder="访谈人数"
          />
          <input
            value={paidIntentCount}
            onChange={(event) => setPaidIntentCount(event.target.value)}
            className="h-9 rounded-xl border border-line bg-white px-3 text-[12px] outline-none placeholder:text-slate-400 focus:border-brand/50"
            placeholder="付费意向数"
          />
        </div>
        <input
          value={estimatedCac}
          onChange={(event) => setEstimatedCac(event.target.value)}
          className="h-9 rounded-xl border border-line bg-white px-3 text-[12px] outline-none placeholder:text-slate-400 focus:border-brand/50"
          placeholder="预估 CAC，例如：280元/线索"
        />
        <textarea
          value={rejectionReasons}
          onChange={(event) => setRejectionReasons(event.target.value)}
          className="min-h-[52px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 outline-none placeholder:text-slate-400 focus:border-brand/50"
          placeholder="拒绝原因，用逗号或换行分隔"
        />
        <textarea
          value={channelQuotes}
          onChange={(event) => setChannelQuotes(event.target.value)}
          className="min-h-[52px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 outline-none placeholder:text-slate-400 focus:border-brand/50"
          placeholder="渠道报价/合作条件，用逗号或换行分隔"
        />
        <textarea
          value={actualOutcome}
          onChange={(event) => setActualOutcome(event.target.value)}
          className="min-h-[62px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 outline-none placeholder:text-slate-400 focus:border-brand/50"
          placeholder="实际结果，例如：访谈 8 人，2 人愿意试用，无人愿意预付"
        />
        <textarea
          value={learnings}
          onChange={(event) => setLearnings(event.target.value)}
          className="min-h-[62px] resize-none rounded-xl border border-line bg-white px-3 py-2 text-[12px] leading-5 outline-none placeholder:text-slate-400 focus:border-brand/50"
          placeholder="复盘学习，例如：客户认可问题，但付费承诺不足"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400">{message}</span>
        <button
          type="button"
          onClick={saveFeedback}
          disabled={saving}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-bold text-brand disabled:opacity-50"
        >
          <Icon name={saving ? "refresh" : "check"} className={cn("h-3.5 w-3.5", saving && "animate-spin")} />
          提交复盘
        </button>
      </div>
      {card.result && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/70 pt-3">
          <a
            href={`/validation-cards/${card.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[11px] font-black text-brand hover:bg-[#f0edff]"
          >
            完整验证卡
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
          <a
            href={`/bach/${card.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[11px] font-black text-orange-600 hover:bg-orange-50"
          >
            BACH 评分
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

function DecisionCaseCard({ item }: { item: DecisionCase }) {
  const tone =
    item.decision === "继续"
      ? "bg-emerald-50 text-emerald-600"
      : item.decision === "暂停"
        ? "bg-rose-50 text-rose-500"
        : "bg-orange-50 text-orange-500";
  return (
    <a
      href={`/validation-cards/${item.validation_card_id}`}
      className="block rounded-2xl border border-line bg-white p-4 transition-colors hover:border-brand/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-[#172452]">{item.title}</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-400">
            证据等级 {item.evidence_grade}
            {item.saved_investment_estimate ? ` · 节省投入 ${item.saved_investment_estimate}` : ""}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-md px-2 py-1 text-[11px] font-black", tone)}>{item.decision}</span>
      </div>
      <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-slate-500">
        {item.key_learning || item.final_outcome || item.biggest_uncertainty || "已完成复盘，等待沉淀方法资产。"}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.assets.slice(0, 4).map((asset) => (
          <span key={asset.kind} className="rounded-lg bg-[#f0edff] px-2 py-1 text-[10.5px] font-bold text-brand">
            {asset.label}
          </span>
        ))}
      </div>
    </a>
  );
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1.5 text-[12px] font-bold text-[#172452]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[13px] outline-none placeholder:text-slate-400 focus:border-brand/50"
        placeholder={placeholder}
      />
    </label>
  );
}

function ProjectCard({ project, onMoveNext }: { project: Project; onMoveNext: () => void }) {
  const meta = statusMeta[project.status];
  const topRisks = riskProfileItems(project.risk_profile);
  return (
    <Card className="group p-5 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[18px] font-black tracking-[-0.02em] text-ink">{project.name}</h2>
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", meta.tone)}>
              {meta.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-400">
            <span>{taskPackMeta[project.task_pack]}</span>
            {project.industry && <span>· {project.industry}</span>}
            <span>· {dayDiff(project.updated_at)}</span>
          </div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f0edff] text-brand">
          <Icon name="archive" className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-[12px] leading-6 text-slate-500">
        <Info label="目标客户" value={project.target_customer || "尚未定义目标客户"} />
        <Info label="当前问题" value={project.current_problem || "尚未沉淀核心问题"} />
      </div>

      {topRisks.length > 0 && (
        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-orange-500">
            <Icon name="alert" className="h-3.5 w-3.5" />
            项目风险画像
          </div>
          <div className="mt-2 space-y-1.5">
            {topRisks.slice(0, 2).map((item, index) => (
              <div key={`${item.risk}-${index}`} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="min-w-0 truncate font-semibold text-[#172452]">{item.risk}</span>
                <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10.5px] font-bold text-orange-500">
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 rounded-2xl border border-line bg-slate-50/60 p-3 text-center">
        <MiniStat label="报告" value={project.report_count} />
        <MiniStat label="最近诊断" value={project.last_diagnosed_at ? fmtTime(project.last_diagnosed_at).slice(5, 16) : "暂无"} />
        <MiniStat label="状态" value={meta.label} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={`/chat?projectId=${project.id}`}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f0edff] px-3 text-[12px] font-bold text-brand transition-colors hover:bg-[#e8e3ff]"
        >
          进入访谈
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </a>
        <a
          href={`/canvas-diagnosis?projectId=${project.id}`}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[12px] font-bold text-[#172452] transition-colors hover:text-brand"
        >
          验证诊断
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </a>
        {meta.next && (
          <button
            type="button"
            onClick={onMoveNext}
            className="ml-auto flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[12px] font-bold text-slate-500 transition-colors hover:text-brand"
          >
            推进状态
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Card>
  );
}

function riskProfileItems(value: Record<string, unknown>) {
  const rows = Array.isArray(value?.top_risks) ? value.top_risks : [];
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      risk: String(item.risk || ""),
      severity: String(item.severity || "medium"),
    }))
    .filter((item) => item.risk);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold text-slate-400">{label}</div>
      <p className="line-clamp-2">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[15px] font-black text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
    </div>
  );
}
