"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import {
  ApiError,
  DiagnoseResult,
  DiagnosisReport,
  pollTask,
  reportsApi,
} from "@/lib/api";
import { moduleLabel, reportStatusTone } from "@/lib/presentation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;

// 0~1 → 0~100 整数（后端质量分是 0~1）
const pct = (v: number) => Math.round((v ?? 0) * 100);

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type ModuleFinding = {
  assessment?: string;
  issues?: string[];
  suggestions?: string[];
  current_judgement?: string;
  evidence_and_observations?: string[];
  key_issues?: string[];
  business_impact?: string;
  hypotheses_to_validate?: string[];
  recommended_actions?: string[];
  metrics_to_track?: string[];
  methodology_basis?: string[];
  confidence?: number | null;
};

type RiskRow = {
  risk?: string;
  impact?: string;
  probability?: string;
  severity?: string;
  mitigation?: string;
  validation_method?: string;
};

type RoadmapStage = {
  stage?: string;
  objective?: string;
  actions?: string[];
  success_criteria?: string[];
  duration?: string;
};

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join("；");
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferred = ["risk", "tension", "logic_chain", "objective", "action", "recommendation", "assumption", "finding", "title", "stage"];
    const parts = preferred.map((key) => asText(obj[key])).filter(Boolean);
    if (parts.length > 0) return parts.slice(0, 4).join("；");
    return Object.values(obj).map(asText).filter(Boolean).slice(0, 4).join("；");
  }
  return "";
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asText(v)).filter(Boolean);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asObjectList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => v && typeof v === "object" && !Array.isArray(v)) as T[];
}

export function ReportsPage({ initialReportId = null }: { initialReportId?: string | null }) {
  const [reports, setReports] = useState<DiagnosisReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function loadList(keepSelection = true, preferredReportId: string | null = null) {
    setLoading(true);
    setListError(null);
    try {
      const data = await reportsApi.list();
      setReports(data);
      setSelectedId((prev) => {
        if (preferredReportId && data.some((r) => r.id === preferredReportId)) {
          return preferredReportId;
        }
        if (keepSelection && prev && data.some((r) => r.id === prev)) return prev;
        return data[0]?.id ?? null;
      });
    } catch (e) {
      setListError(e instanceof ApiError ? e.message : "加载报告列表失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList(false, initialReportId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReportId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.company_name ?? "").toLowerCase().includes(q)
    );
  }, [reports, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query]);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <ReportsHeader
        query={query}
        onQueryChange={setQuery}
        total={reports.length}
        onRefresh={() => loadList(true)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4 md:px-8 md:pb-8 md:pt-5">
          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[336px_1fr]">
            <ReportList
              items={pageItems}
              total={filtered.length}
              loading={loading}
              error={listError}
              selectedId={selectedId}
              onSelect={setSelectedId}
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
            <ReportDetail
              reportId={selectedId}
              onDeleted={() => loadList(false)}
              onRegenerated={(newReportId) => loadList(false, newReportId)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ReportsHeader({
  query,
  onQueryChange,
  total,
  onRefresh,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  total: number;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 pl-16 pr-4 pt-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-8 md:pt-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-[#172452] transition-colors hover:text-brand"
            title="返回"
          >
            <Icon name="chevron-left" className="h-5 w-5" />
          </button>
          <h1 className="text-[22px] font-black tracking-[-0.03em] text-ink md:text-[27px]">诊断报告中心</h1>
        </div>
        <p className="mt-1.5 text-[12.5px] font-medium text-slate-500 md:text-[13px]">
          集中管理所有商业诊断报告，支持查看、重新生成与删除（共 {total} 份）
        </p>
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-white px-4 md:w-[280px] md:flex-none">
          <Icon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="搜索报告名称或客户..."
          />
        </div>
        <button
          onClick={onRefresh}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-white px-3 text-[13px] font-bold text-[#172452] hover:text-brand md:px-4"
        >
          <Icon name="refresh" className="h-4 w-4" />
          <span className="hidden sm:inline">刷新</span>
        </button>
      </div>
    </header>
  );
}

function ReportList({
  items,
  total,
  loading,
  error,
  selectedId,
  onSelect,
  page,
  totalPages,
  onPageChange,
}: {
  items: DiagnosisReport[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <Card className="flex flex-col px-4 py-4">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-[15px] font-black text-ink">报告列表（{total}）</h2>
      </div>
      <div className="mt-3 space-y-3">
        {loading && <p className="px-1 py-8 text-center text-[13px] text-slate-400">加载中…</p>}
        {error && !loading && (
          <p className="px-1 py-8 text-center text-[13px] text-rose-500">{error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="px-1 py-8 text-center text-[13px] text-slate-400">暂无报告</p>
        )}
        {!loading &&
          !error &&
          items.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              active={r.id === selectedId}
              onClick={() => onSelect(r.id)}
            />
          ))}
      </div>
      {totalPages > 1 && (
        <ReportPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      )}
    </Card>
  );
}

function ReportCard({
  report,
  active,
  onClick,
}: {
  report: DiagnosisReport;
  active: boolean;
  onClick: () => void;
}) {
  const st = reportStatusTone[report.status] ?? {
    label: report.status,
    tone: "bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 rounded-xl border p-3.5 text-left transition-all",
        active
          ? "border-brand/60 bg-[#f8f7ff] shadow-[0_10px_28px_rgba(91,75,255,0.1)] ring-1 ring-brand/30"
          : "border-line bg-white hover:border-brand/40 hover:bg-[#fbfbff]"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          active ? "bg-[#f0edff] text-brand" : "bg-slate-50 text-slate-400"
        )}
      >
        <Icon name="file-text" className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className={cn("text-[13.5px] font-black leading-snug", active ? "text-brand" : "text-ink")}>
            {report.title}
          </span>
          <span className="ml-auto shrink-0 text-[12px] font-black text-slate-400">
            {pct(report.quality_score)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-400">
            客户：{report.company_name || "—"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{fmtTime(report.created_at)}</span>
          <span className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold", st.tone)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
            {st.label}
          </span>
        </div>
      </div>
    </button>
  );
}

function ReportPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div className="mt-5 flex items-center justify-center gap-1.5">
      <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        <Icon name="chevron-left" className="h-4 w-4" />
      </PageButton>
      {pages.map((p) => (
        <PageButton key={p} active={p === page} onClick={() => onPageChange(p)}>
          {p}
        </PageButton>
      ))}
      <PageButton disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        <Icon name="chevron-right" className="h-4 w-4" />
      </PageButton>
    </div>
  );
}

function PageButton({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[12.5px] font-bold transition-colors disabled:opacity-40",
        active ? "border-brand bg-[#f0edff] text-brand" : "border-line bg-white text-slate-500 hover:text-brand"
      )}
    >
      {children}
    </button>
  );
}

function ReportDetail({
  reportId,
  onDeleted,
  onRegenerated,
}: {
  reportId: string | null;
  onDeleted: () => void;
  onRegenerated: (newReportId: string | null) => void;
}) {
  const [report, setReport] = useState<DiagnosisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "regenerate" | "delete">("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActionMsg(null);
    (async () => {
      try {
        const rep = await reportsApi.detail(reportId);
        if (cancelled) return;
        setReport(rep);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "加载报告详情失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function handleRegenerate() {
    if (!reportId || busy) return;
    setBusy("regenerate");
    setActionMsg("正在重新生成（重跑诊断，可能数十秒）…");
    try {
      const { task_id } = await reportsApi.regenerate(reportId);
      const task = await pollTask<DiagnoseResult>(task_id, {
        onProgress: (t) => setActionMsg(`重新生成中… ${t.progress}%`),
      });
      const newId = task.result?.report?.id;
      setActionMsg(newId ? "已生成新报告，正在刷新列表…" : "已完成。");
      onRegenerated(newId ?? null);
    } catch (e) {
      setActionMsg(e instanceof ApiError ? `重新生成失败：${e.message}` : "重新生成失败");
    } finally {
      setBusy("");
    }
  }

  async function handleDelete() {
    if (!reportId || busy) return;
    if (!window.confirm("确认删除该报告？此操作不可恢复。")) return;
    setBusy("delete");
    try {
      await reportsApi.remove(reportId);
      onDeleted();
    } catch (e) {
      setActionMsg(e instanceof ApiError ? `删除失败：${e.message}` : "删除失败");
    } finally {
      setBusy("");
    }
  }

  if (!reportId) {
    return (
      <Card className="flex min-w-0 items-center justify-center">
        <p className="text-[13px] text-slate-400">从左侧选择一份报告查看详情</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="flex min-w-0 items-center justify-center">
        <p className="text-[13px] text-slate-400">加载中…</p>
      </Card>
    );
  }

  if (error || !report) {
    return (
      <Card className="flex min-w-0 items-center justify-center">
        <p className="text-[13px] text-rose-500">{error ?? "报告不存在"}</p>
      </Card>
    );
  }

  const st = reportStatusTone[report.status] ?? {
    label: report.status,
    tone: "bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
  };
  const moduleEntries = Object.entries(report.module_findings ?? {}) as [string, ModuleFinding][];
  const executiveSummary = asObject(report.executive_summary);
  const coreTensions = asObjectList<Record<string, unknown>>(report.core_tensions);
  const crossCanvasLogic = asObjectList<Record<string, unknown>>(report.cross_canvas_logic);
  const unitEconomics = asObject(report.unit_economics);
  const riskMatrix = asObjectList<RiskRow>(report.risk_matrix);
  const mvpPath = asObjectList<RoadmapStage>(report.mvp_validation_path);
  const ninetyDayPlan = asObject(report.ninety_day_plan);
  const finalRecommendation = asObject(report.final_recommendation);

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <div className="border-b border-line px-7 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0edff] text-brand">
            <Icon name="file-text" className="h-5 w-5" />
          </span>
          <h2 className="text-[19px] font-black text-ink">{report.title}</h2>
          <span className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold", st.tone)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
            {st.label}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={handleRegenerate}
              disabled={!!busy}
              className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-bold text-[#172452] disabled:opacity-50"
            >
              <Icon name="refresh" className={cn("h-4 w-4", busy === "regenerate" && "animate-spin")} />
              重新生成
            </button>
            <button
              onClick={handleDelete}
              disabled={!!busy}
              className="flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-[13px] font-bold text-rose-500 hover:bg-rose-50 disabled:opacity-50"
            >
              <Icon name="trash" className="h-4 w-4" />
              删除
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-medium text-slate-500">
          <span>客户：<span className="text-[#172452]">{report.company_name || "—"}</span></span>
          {report.intent && <span>诊断意图：<span className="text-[#172452]">{report.intent}</span></span>}
          <span>创建时间：<span className="text-[#172452]">{fmtTime(report.created_at)}</span></span>
          <span>方法论引用：<span className="text-[#172452]">{report.methodology_node_ids.length} 个节点</span></span>
          <span>引擎：<span className="text-[#172452]">{report.used_llm ? "LLM" : "本地回退"}</span></span>
          <span>报告深度：<span className="text-[#172452]">{report.report_depth || "consulting"}</span></span>
        </div>
        {actionMsg && <p className="mt-3 text-[12px] font-semibold text-brand">{actionMsg}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {/* 报告摘要 */}
        <div>
          <h3 className="text-[15px] font-black text-ink">报告摘要</h3>
          <p className="mt-3 whitespace-pre-line text-[13px] font-medium leading-7 text-[#3b4a6b]">
            {report.overall_summary || "暂无摘要。"}
          </p>
          {report.question && (
            <p className="mt-3 rounded-xl bg-[#f8faff] px-4 py-3 text-[12.5px] font-medium leading-6 text-slate-500">
              <span className="font-bold text-[#172452]">诊断问题：</span>
              {report.question}
            </p>
          )}
        </div>

        <ExecutiveSummarySection summary={executiveSummary} />
        <CoreTensionsSection items={coreTensions} />

        {/* 商业画布诊断 */}
        {moduleEntries.length > 0 && (
          <>
            <h3 className="mt-7 text-[15px] font-black text-ink">商业画布诊断</h3>
            <div className="mt-4 space-y-3">
              {moduleEntries.map(([key, finding]) => (
                <ModuleCard key={key} moduleKey={key} finding={finding} />
              ))}
            </div>
          </>
        )}

        <CrossCanvasSection items={crossCanvasLogic} />
        <UnitEconomicsSection data={unitEconomics} />
        <RiskMatrixSection items={riskMatrix} />
        <RoadmapSection items={mvpPath} />
        <NinetyDayPlanSection data={ninetyDayPlan} />
        <FinalRecommendationSection data={finalRecommendation} />

        {/* 关键假设 */}
        <ListSection
          title="关键假设"
          icon="target"
          tone="bg-violet-50 text-violet"
          items={report.key_assumptions}
        />
        {/* 风险分析 */}
        <ListSection
          title="风险分析"
          icon="alert"
          tone="bg-orange-50 text-orange-500"
          items={report.risks}
        />
        {/* 方案建议 */}
        <ListSection
          title="方案建议"
          icon="check-circle"
          tone="bg-emerald-50 text-emerald-600"
          items={report.recommended_actions}
        />

      </div>
    </Card>
  );
}

function ModuleCard({ moduleKey, finding }: { moduleKey: string; finding: ModuleFinding }) {
  const evidence = finding.evidence_and_observations ?? [];
  const keyIssues = finding.key_issues?.length ? finding.key_issues : finding.issues ?? [];
  const actions = finding.recommended_actions?.length ? finding.recommended_actions : finding.suggestions ?? [];
  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
          <Icon name="layers" className="h-4 w-4" />
        </span>
        <h4 className="text-[14px] font-black text-ink">{moduleLabel(moduleKey)}</h4>
        {typeof finding.confidence === "number" && (
          <span className="ml-auto rounded-full bg-[#f8faff] px-2 py-0.5 text-[11px] font-bold text-slate-500">
            置信度 {Math.round(finding.confidence * 100)}%
          </span>
        )}
      </div>
      {(finding.current_judgement || finding.assessment) && (
        <p className="mt-2.5 text-[13px] font-medium leading-6 text-[#3b4a6b]">
          {finding.current_judgement || finding.assessment}
        </p>
      )}
      {finding.business_impact && (
        <p className="mt-3 rounded-xl bg-[#f8faff] px-3 py-2.5 text-[12.5px] font-medium leading-6 text-[#3b4a6b]">
          <span className="font-bold text-[#172452]">商业影响：</span>
          {finding.business_impact}
        </p>
      )}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <MiniList title="依据与观察" tone="bg-blue-50 text-blue-600" items={evidence} />
        <MiniList title="关键问题" tone="bg-orange-50 text-orange-500" items={keyIssues} />
        <MiniList title="待验证假设" tone="bg-violet-50 text-violet" items={finding.hypotheses_to_validate ?? []} />
        <MiniList title="建议动作" tone="bg-emerald-50 text-emerald-600" items={actions} />
        <MiniList title="关键指标" tone="bg-slate-100 text-slate-600" items={finding.metrics_to_track ?? []} />
        <MiniList title="方法论依据" tone="bg-[#f0edff] text-brand" items={finding.methodology_basis ?? []} />
      </div>
    </div>
  );
}

function ExecutiveSummarySection({ summary }: { summary: Record<string, unknown> }) {
  if (Object.keys(summary).length === 0) return null;
  const findings = asList(summary.top_3_findings);
  const risks = asList(summary.top_3_risks);
  return (
    <section className="mt-7 rounded-2xl border border-line bg-white px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
          <Icon name="sparkles" className="h-4 w-4" />
        </span>
        <h3 className="text-[15px] font-black text-ink">执行摘要</h3>
        {summary.overall_score !== undefined && (
          <span className="ml-auto rounded-full bg-[#f8faff] px-2.5 py-1 text-[11px] font-bold text-slate-500">
            综合判断 {Math.round(Number(summary.overall_score) * 100)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-[14px] font-black leading-7 text-[#172452]">
        {asText(summary.one_sentence_judgement)}
      </p>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <SummaryBox label="成熟阶段" value={asText(summary.maturity_stage)} />
        <SummaryBox label="建议决策" value={asText(summary.recommended_decision)} wide />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <MiniList title="核心结论" tone="bg-emerald-50 text-emerald-600" items={findings} />
        <MiniList title="最高风险" tone="bg-orange-50 text-orange-500" items={risks} />
      </div>
    </section>
  );
}

function SummaryBox({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={cn("rounded-xl bg-[#f8faff] px-4 py-3", wide && "xl:col-span-2")}>
      <div className="text-[11px] font-bold text-slate-400">{label}</div>
      <div className="mt-1 text-[13px] font-bold leading-6 text-[#172452]">{value}</div>
    </div>
  );
}

function CoreTensionsSection({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) return null;
  return (
    <RichCardSection title="核心矛盾识别" icon="target">
      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-line bg-[#fbfcff] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f0edff] px-2 py-0.5 text-[11px] font-black text-brand">
                {asText(item.priority) || "priority"}
              </span>
            </div>
            <div className="mt-2 text-[13px] font-black leading-6 text-[#172452]">{asText(item.tension)}</div>
            <p className="mt-2 text-[12.5px] font-medium leading-6 text-[#3b4a6b]">{asText(item.why_it_matters)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {asList(item.affected_canvas_modules).map((m) => (
                <span key={m} className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-500">
                  {moduleLabel(m)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </RichCardSection>
  );
}

function CrossCanvasSection({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) return null;
  return (
    <RichCardSection title="商业闭环与交叉推理" icon="git-branch">
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl bg-[#f8faff] px-4 py-3">
            <div className="text-[13px] font-black leading-6 text-brand">{asText(item.logic_chain)}</div>
            <p className="mt-1.5 text-[12.5px] font-medium leading-6 text-[#3b4a6b]">{asText(item.explanation)}</p>
          </div>
        ))}
      </div>
    </RichCardSection>
  );
}

function UnitEconomicsSection({ data }: { data: Record<string, unknown> }) {
  if (Object.keys(data).length === 0) return null;
  return (
    <RichCardSection title="单位经济模型测算框架" icon="money">
      <div className="grid gap-3 lg:grid-cols-2">
        <MiniList title="收入项" tone="bg-emerald-50 text-emerald-600" items={asList(data.revenue_items)} />
        <MiniList title="成本项" tone="bg-orange-50 text-orange-500" items={asList(data.cost_items)} />
        <MiniList title="毛利假设" tone="bg-blue-50 text-blue-600" items={asList(data.gross_margin_assumptions)} />
        <MiniList title="缺失数据" tone="bg-slate-100 text-slate-600" items={asList(data.missing_data)} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <TextPanel label="CAC / LTV 框架" value={asText(data.cac_ltv_framework)} />
        <TextPanel label="盈亏平衡逻辑" value={asText(data.break_even_logic)} />
      </div>
    </RichCardSection>
  );
}

function RiskMatrixSection({ items }: { items: RiskRow[] }) {
  if (items.length === 0) return null;
  return (
    <RichCardSection title="风险矩阵" icon="alert">
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[1.2fr_0.45fr_0.45fr_0.45fr_1fr_1fr] bg-[#f8faff] px-3 py-2 text-[11px] font-black text-slate-500">
          <span>风险</span><span>影响</span><span>概率</span><span>等级</span><span>缓释动作</span><span>验证方式</span>
        </div>
        {items.map((r, idx) => (
          <div key={idx} className="grid grid-cols-[1.2fr_0.45fr_0.45fr_0.45fr_1fr_1fr] gap-2 border-t border-line px-3 py-3 text-[12px] font-medium leading-5 text-[#3b4a6b]">
            <span className="font-bold text-[#172452]">{r.risk}</span>
            <span>{r.impact}</span>
            <span>{r.probability}</span>
            <span className="font-bold text-orange-500">{r.severity}</span>
            <span>{r.mitigation}</span>
            <span>{r.validation_method}</span>
          </div>
        ))}
      </div>
    </RichCardSection>
  );
}

function RoadmapSection({ items }: { items: RoadmapStage[] }) {
  if (items.length === 0) return null;
  return (
    <RichCardSection title="MVP 最小验证路径" icon="route">
      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((stage, idx) => (
          <div key={idx} className="rounded-xl border border-line bg-[#fbfcff] px-4 py-3">
            <div className="text-[12px] font-bold text-brand">{stage.duration}</div>
            <div className="mt-1 text-[14px] font-black text-[#172452]">{stage.stage}</div>
            <p className="mt-2 text-[12.5px] font-medium leading-6 text-[#3b4a6b]">{stage.objective}</p>
            <MiniList title="动作" tone="bg-white text-slate-600" items={stage.actions ?? []} compact />
            <MiniList title="成功标准" tone="bg-emerald-50 text-emerald-600" items={stage.success_criteria ?? []} compact />
          </div>
        ))}
      </div>
    </RichCardSection>
  );
}

function NinetyDayPlanSection({ data }: { data: Record<string, unknown> }) {
  if (Object.keys(data).length === 0) return null;
  return (
    <RichCardSection title="90 天行动计划" icon="calendar">
      <div className="grid gap-3 lg:grid-cols-3">
        <MiniList title="0-30 天" tone="bg-violet-50 text-violet" items={asList(data.day_0_30)} />
        <MiniList title="31-60 天" tone="bg-blue-50 text-blue-600" items={asList(data.day_31_60)} />
        <MiniList title="61-90 天" tone="bg-emerald-50 text-emerald-600" items={asList(data.day_61_90)} />
      </div>
    </RichCardSection>
  );
}

function FinalRecommendationSection({ data }: { data: Record<string, unknown> }) {
  if (Object.keys(data).length === 0) return null;
  return (
    <RichCardSection title="最终决策建议" icon="check-circle">
      <p className="rounded-xl bg-[#f8faff] px-4 py-3 text-[13px] font-bold leading-7 text-[#172452]">
        {asText(data.final_judgement)}
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <MiniList title="继续推进条件" tone="bg-emerald-50 text-emerald-600" items={asList(data.go_conditions)} />
        <MiniList title="暂缓条件" tone="bg-orange-50 text-orange-500" items={asList(data.pause_conditions)} />
        <MiniList title="需补充信息" tone="bg-slate-100 text-slate-600" items={asList(data.missing_information)} />
      </div>
    </RichCardSection>
  );
}

function RichCardSection({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="mt-7 rounded-2xl border border-line bg-white px-5 py-4">
      <h3 className="flex items-center gap-2 text-[15px] font-black text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TextPanel({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-[#f8faff] px-4 py-3">
      <div className="text-[12px] font-bold text-slate-400">{label}</div>
      <p className="mt-1 text-[12.5px] font-medium leading-6 text-[#3b4a6b]">{value}</p>
    </div>
  );
}

function MiniList({
  title,
  tone,
  items,
  compact = false,
}: {
  title: string;
  tone: string;
  items: string[];
  compact?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className={cn("rounded-xl bg-[#fbfcff] px-3 py-3", compact && "mt-3 bg-white")}>
      <div className={cn("inline-flex rounded-md px-2 py-1 text-[11px] font-black", tone)}>{title}</div>
      <ul className="mt-2 space-y-1.5 text-[12.5px] font-medium leading-5 text-[#3b4a6b]">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
function ListSection({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: string;
  tone: string;
  items: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <>
      <h3 className="mt-7 flex items-center gap-2 text-[15px] font-black text-ink">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tone)}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-[13px] font-medium leading-6 text-[#3b4a6b]">
        {items.map((it, idx) => (
          <li key={idx} className="flex gap-2.5 rounded-xl bg-[#f8faff] px-4 py-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {it}
          </li>
        ))}
      </ul>
    </>
  );
}
