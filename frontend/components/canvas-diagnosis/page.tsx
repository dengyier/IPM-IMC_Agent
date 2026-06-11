"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { PendingTaskBell } from "@/components/pending-task-bell";
import { useIsMobile } from "@/components/mobile/use-is-mobile";
import {
  ApiError,
  DiagnoseResult,
  DiagnosisReport,
  diagnosisApi,
  pollTask,
  projectApi,
  reportsApi,
  type Project,
} from "@/lib/api";
import {
  CANVAS_MODULE_ORDER,
  canvasModuleLabels,
  dimensionLabels,
  moduleLabel,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

const MODULE_ICONS: Record<string, string> = {
  customer_segments: "users",
  value_propositions: "sparkles",
  channels: "send",
  customer_relationships: "link",
  revenue_streams: "money",
  key_resources: "boxes",
  key_activities: "clipboard-check",
  key_partners: "share",
  cost_structure: "bar-chart",
};

const STEPS = ["填写项目与画布", "提交诊断", "AI 分析", "生成报告"];

const pct = (v: number) => Math.round((v ?? 0) * 100);

type Phase = "idle" | "running" | "done" | "error";
type EvidenceRefItem = { label: string; type?: string };

// 9 宫格输入区每个模块的提示
const MODULE_HINTS: Record<string, string> = {
  customer_segments: "服务哪些客户群体？",
  value_propositions: "为客户创造什么独特价值？",
  channels: "如何触达并交付给客户？",
  customer_relationships: "如何获取、维系客户？",
  revenue_streams: "靠什么赚钱、如何定价？",
  key_resources: "需要哪些关键资源？",
  key_activities: "最关键的业务活动是什么？",
  key_partners: "依赖哪些重要合作方？",
  cost_structure: "主要成本结构是什么？",
};

export function CanvasDiagnosisPage({ initialProjectId = null }: { initialProjectId?: string | null }) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [question, setQuestion] = useState("");
  const [canvas, setCanvas] = useState<Record<string, string>>({});
  const [projectContext, setProjectContext] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
  const isMobile = useIsMobile();

  const setModule = (k: string, v: string) => setCanvas((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let cancelled = false;
    if (!initialProjectId) {
      setProjectContext(null);
      setProjectError(null);
      return;
    }
    setProjectLoading(true);
    setProjectError(null);
    projectApi
      .detail(initialProjectId)
      .then((project) => {
        if (cancelled) return;
        setProjectContext(project);
        setTitle((current) => current || project.name || "");
        setCompany((current) => current || project.industry || "");
        setQuestion((current) => current || project.current_problem || "");
        setCanvas((current) => ({
          ...current,
          customer_segments: current.customer_segments || project.target_customer || "",
        }));
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectContext(null);
          setProjectError(error instanceof ApiError ? error.message : "经营档案加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProjectId]);

  const filledModules = CANVAS_MODULE_ORDER.filter((m) => (canvas[m] ?? "").trim()).length;
  const hasDiagnosticInput = question.trim().length > 0 || filledModules > 0;
  const missingSubmitReason = !title.trim()
    ? "请先填写项目名称"
    : !hasDiagnosticInput
      ? "请至少填写一个画布模块或重点分析问题"
      : null;
  const canSubmit = !missingSubmitReason && phase !== "running";

  async function handleDiagnose() {
    if (!canSubmit) return;
    setPhase("running");
    setProgress(0);
    setResult(null);
    setStatusMsg("正在提交诊断…");
    try {
      const cleanCanvas: Record<string, string> = {};
      for (const m of CANVAS_MODULE_ORDER) {
        const v = (canvas[m] ?? "").trim();
        if (v) cleanCanvas[m] = v;
      }
      const { task_id } = await diagnosisApi.create({
        title: title.trim(),
        company_name: company.trim() || null,
        question: question.trim(),
        report_depth: "consulting",
        canvas: cleanCanvas,
        project_id: projectContext?.id ?? initialProjectId ?? null,
        task_pack: projectContext?.task_pack,
      });
      setStatusMsg("AI 分析中（数十秒~分钟级）…");
      const task = await pollTask<DiagnoseResult>(task_id, {
        onProgress: (t) => {
          setProgress(t.progress);
          setStatusMsg(`AI 分析中… ${t.progress}%`);
        },
      });
      setResult(task.result ?? null);
      setProgress(100);
      setPhase("done");
      setStatusMsg("诊断完成。");
      setReportsRefreshKey((v) => v + 1);
    } catch (e) {
      setPhase("error");
      setStatusMsg(e instanceof ApiError ? `诊断失败：${e.message}` : "诊断失败");
    }
  }

  const stepIndex =
    phase === "idle"
      ? 0
      : phase === "running"
        ? progress >= 90
          ? 3
          : progress > 0
            ? 2
            : 1
        : phase === "done"
          ? 3
          : 1;

  if (isMobile === null) return null;
  if (isMobile) {
    return (
      <MobileCanvasForm
        title={title}
        company={company}
        question={question}
        canvas={canvas}
        phase={phase}
        progress={progress}
        statusMsg={statusMsg}
        canSubmit={canSubmit}
        submitHint={missingSubmitReason}
        onTitle={setTitle}
        onCompany={setCompany}
        onQuestion={setQuestion}
        onModule={setModule}
        onDiagnose={handleDiagnose}
        result={result}
        projectContext={projectContext}
        projectLoading={projectLoading}
        projectError={projectError}
      />
    );
  }

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <DiagnosisHeader />
        <StepBar activeIndex={stepIndex} />
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_280px]">
          <ProjectForm
            title={title}
            company={company}
            question={question}
            canvas={canvas}
            filledModules={filledModules}
            phase={phase}
            progress={progress}
            statusMsg={statusMsg}
            submitHint={missingSubmitReason}
            canSubmit={canSubmit}
            onTitle={setTitle}
            onCompany={setCompany}
            onQuestion={setQuestion}
            onModule={setModule}
            onDiagnose={handleDiagnose}
            projectContext={projectContext}
            projectLoading={projectLoading}
            projectError={projectError}
          />
          <RecentDiagnoses refreshKey={reportsRefreshKey} />
        </div>
        {result && <ResultPanel result={result} />}
        <p className="py-5 text-center text-[12px] text-slate-400">
          诊断结果由 AI 生成，仅供决策参考，重要决策请结合实际情况
        </p>
      </section>
    </main>
  );
}

function DiagnosisHeader() {
  return (
    <header className="flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">项目验证诊断</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          基于港大 IMC&IPM 方法论、知识节点与案例，为你的项目生成验证路径、风险审计和结构化诊断报告
        </p>
      </div>
    </header>
  );
}

function StepBar({ activeIndex }: { activeIndex: number }) {
  return (
    <Card className="mt-7 px-7 py-5">
      <div className="grid grid-cols-4 gap-3">
        {STEPS.map((step, index) => {
          const active = index === activeIndex;
          const done = index < activeIndex;
          return (
            <div key={step} className="relative flex items-center justify-center">
              {index > 0 && <span className="absolute right-[50%] top-1/2 h-px w-full -translate-y-1/2 bg-line" />}
              <div
                className={cn(
                  "relative z-10 flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-full text-[13px] font-bold",
                  active ? "bg-[#f0edff] text-brand" : done ? "bg-emerald-50 text-emerald-600" : "bg-white text-slate-500"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
                    active ? "brand-gradient text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                {step}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProjectForm({
  title,
  company,
  question,
  canvas,
  filledModules,
  phase,
  progress,
  statusMsg,
  submitHint,
  canSubmit,
  onTitle,
  onCompany,
  onQuestion,
  onModule,
  onDiagnose,
  projectContext,
  projectLoading,
  projectError,
}: {
  title: string;
  company: string;
  question: string;
  canvas: Record<string, string>;
  filledModules: number;
  phase: Phase;
  progress: number;
  statusMsg: string | null;
  submitHint: string | null;
  canSubmit: boolean;
  onTitle: (v: string) => void;
  onCompany: (v: string) => void;
  onQuestion: (v: string) => void;
  onModule: (k: string, v: string) => void;
  onDiagnose: () => void;
  projectContext: Project | null;
  projectLoading: boolean;
  projectError: string | null;
}) {
  return (
    <Card className="px-6 py-5">
      <div className="flex items-center gap-10">
        <h2 className="text-[17px] font-black text-ink">告诉智能体你的项目</h2>
        <p className="text-[13px] font-semibold text-slate-500">填写越完整，分析越精准（已填 {filledModules}/9 画布模块）</p>
      </div>

      {(projectContext || projectLoading || projectError) && (
        <ProjectLinkNotice
          project={projectContext}
          loading={projectLoading}
          error={projectError}
        />
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Field label="项目名称" required>
          <input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="如：家庭健康监测仪"
            className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none placeholder:text-slate-400"
          />
        </Field>
        <Field label="公司 / 项目主体">
          <input
            value={company}
            onChange={(e) => onCompany(e.target.value)}
            placeholder="如：智联科技有限公司"
            className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none placeholder:text-slate-400"
          />
        </Field>
      </div>

      {/* 商业模式画布 9 宫格 */}
      <h3 className="mt-6 text-[14px] font-black text-ink">商业模式画布（9 模块）</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {CANVAS_MODULE_ORDER.map((m) => (
          <label key={m} className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold text-[#172452]">
              {canvasModuleLabels[m] ?? m}
            </span>
            <textarea
              value={canvas[m] ?? ""}
              onChange={(e) => onModule(m, e.target.value)}
              placeholder={MODULE_HINTS[m]}
              className="h-[72px] w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] font-medium leading-5 text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
            />
          </label>
        ))}
      </div>

      <div className="mt-5">
        <Field label="希望重点分析的问题">
          <textarea
            value={question}
            onChange={(e) => onQuestion(e.target.value)}
            placeholder="如：用户是否愿意为 AI 健康分析付费？差异化是什么？最小验证路径？"
            className="h-[58px] w-full resize-none rounded-lg border border-line bg-white px-4 py-3 text-[13px] font-semibold leading-6 text-[#172452] outline-none placeholder:text-slate-400"
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-4">
        {(statusMsg || submitHint) && (
          <span
            className={cn(
              "text-[12.5px] font-bold",
              phase === "error" || (!statusMsg && submitHint)
                ? "text-rose-500"
                : phase === "done"
                  ? "text-emerald-600"
                  : "text-brand"
            )}
          >
            {statusMsg ?? submitHint}
          </span>
        )}
        <button
          onClick={onDiagnose}
          disabled={!canSubmit}
          className="brand-gradient ml-auto flex h-11 w-[284px] items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white shadow-soft disabled:opacity-50"
        >
          {phase === "running" ? (
            <>
              <Icon name="refresh" className="h-4 w-4 animate-spin" />
              诊断中 {progress}%
            </>
          ) : (
            <>
              <Icon name="sparkles" className="h-4 w-4" />
              开始诊断
            </>
          )}
        </button>
      </div>
    </Card>
  );
}

function projectTaskPackLabel(project: Project) {
  const labels: Record<Project["task_pack"], string> = {
    new_project: "新项目验证",
    sales_growth: "销售增长",
    ai_acquisition: "AI 获客",
    review: "经营复盘",
  };
  return labels[project.task_pack] ?? project.task_pack;
}

function ProjectLinkNotice({
  project,
  loading,
  error,
}: {
  project: Project | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-3 text-[13px] font-semibold text-slate-500">
        正在读取经营档案上下文...
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-500">
        经营档案读取失败：{error}
      </div>
    );
  }
  if (!project) return null;
  return (
    <div className="mt-4 rounded-2xl border border-[#dcd6ff] bg-[#fbfaff] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-black text-[#172452]">已关联经营档案：{project.name}</span>
        <span className="rounded-full bg-[#f0edff] px-2 py-0.5 text-[11px] font-bold text-brand">
          {projectTaskPackLabel(project)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
        {project.current_problem || project.target_customer || "本次诊断会保存到该项目时间线。"}
      </p>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
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

function RecentDiagnoses({ refreshKey }: { refreshKey: number }) {
  const [reports, setReports] = useState<DiagnosisReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportsApi
      .list()
      .then((d) => !cancelled && setReports(d.slice(0, 8)))
      .catch(() => !cancelled && setReports([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <Card className="px-5 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-black text-ink">我的诊断记录</h2>
        <a href="/reports" className="flex items-center gap-1 text-[12px] font-bold text-brand">
          查看全部
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="mt-5 space-y-4">
        {loading && <p className="text-[12px] text-slate-400">加载中…</p>}
        {!loading && reports.length === 0 && (
          <p className="text-[12px] text-slate-400">暂无诊断记录</p>
        )}
        {reports.map((r) => (
          <a key={r.id} href={`/reports?reportId=${encodeURIComponent(r.id)}`} className="block">
            <div className="text-[13px] font-black text-[#172452] hover:text-brand">{r.title}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })}
              </span>
              <span className="rounded-full bg-[#f0edff] px-2 py-0.5 text-[11px] font-bold text-brand">
                {pct(r.quality_score)} 分
              </span>
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
}

function ResultPanel({ result }: { result: DiagnoseResult }) {
  const report = result.report;
  const moduleEntries = Object.entries(report.module_findings ?? {});
  const evidenceRefs = (report.evidence_refs ?? [])
    .map(formatEvidenceRef)
    .filter((item): item is EvidenceRefItem => Boolean(item));
  const qualityScores = Object.entries(result.quality?.dimension_scores ?? {});
  return (
    <Card className="mt-5 px-6 py-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon name="check-circle" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[17px] font-black text-ink">诊断完成：{report.title}</h2>
          <p className="text-[12px] font-medium text-slate-400">
            综合评分 {pct(report.quality_score)} · 引擎 {result.used_llm ? "LLM" : "本地回退"} · 引用 {report.methodology_node_ids.length} 个方法论节点
          </p>
        </div>
        <a
          href={`/reports?reportId=${encodeURIComponent(report.id)}`}
          className="brand-gradient ml-auto flex h-10 items-center gap-2 rounded-lg px-4 text-[13px] font-bold text-white shadow-soft"
        >
          查看完整报告
          <Icon name="chevron-right" className="h-4 w-4" />
        </a>
      </div>

      {report.overall_summary && (
        <p className="mt-4 whitespace-pre-line text-[13px] font-medium leading-7 text-[#3b4a6b]">
          {report.overall_summary}
        </p>
      )}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <ResultList title="关键假设" tone="bg-violet-50 text-violet" items={report.key_assumptions} />
        <ResultList title="主要风险" tone="bg-orange-50 text-orange-500" items={report.risks} danger />
        <ResultList title="方案建议" tone="bg-emerald-50 text-emerald-600" items={report.recommended_actions} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-line bg-white px-5 py-4">
          <div className="flex items-center gap-2 text-[13px] font-black text-ink">
            <Icon name="database" className="h-4 w-4 text-brand" />
            本次调用依据
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {evidenceRefs.length === 0 && (
              <span className="text-[12px] text-slate-400">暂无可展示依据</span>
            )}
            {evidenceRefs.slice(0, 12).map((item, index) => (
              <span
                key={`${item.label}-${index}`}
                className="rounded-full border border-[#d8d2ff] bg-[#f6f3ff] px-3 py-1 text-[12px] font-bold text-brand"
              >
                {item.type ? `${item.type} · ` : ""}
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] font-black text-ink">
              <Icon name="shield" className="h-4 w-4 text-emerald-600" />
              质量检查
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-black",
                result.quality?.passed
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-orange-50 text-orange-500"
              )}
            >
              {result.quality?.passed ? "已通过" : "需复核"}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {qualityScores.length === 0 && (
              <p className="text-[12px] text-slate-400">暂无质量维度评分</p>
            )}
            {qualityScores.slice(0, 4).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-[12px] font-bold text-[#3b4a6b]">
                <span>{qualityLabel(key)}</span>
                <span>{pct(Number(value))} 分</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {moduleEntries.length > 0 && (
        <>
          <h3 className="mt-6 text-[14px] font-black text-ink">画布模块诊断（{moduleEntries.length}）</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {moduleEntries.map(([key, finding]) => {
              const f = finding as { assessment?: string };
              return (
                <div key={key} className="rounded-xl border border-line bg-white px-4 py-3">
                  <div className="text-[13px] font-black text-[#172452]">{moduleLabel(key)}</div>
                  {f.assessment && (
                    <p className="mt-1.5 text-[12.5px] font-medium leading-6 text-[#3b4a6b]">{f.assessment}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function formatEvidenceRef(ref: unknown): EvidenceRefItem | null {
  if (!ref || typeof ref !== "object") return null;
  const row = ref as Record<string, unknown>;
  const label = String(row.ref ?? row.title ?? row.node_name ?? "").trim();
  if (!label) return null;
  const rawType = String(row.type ?? row.extension_type ?? "").trim();
  const type =
    rawType === "methodology_node"
      ? "方法论节点"
      : rawType === "approved_expansion"
        ? "审核扩展"
        : rawType || undefined;
  return { label, type };
}

function qualityLabel(key: string) {
  // 复用报告中心的 7 维度中文映射（与后端 dimension_scores 实际键名一致）
  return dimensionLabels[key] ?? key;
}

function ResultList({
  title,
  tone,
  items,
  danger,
}: {
  title: string;
  tone: string;
  items: string[];
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#f8f9ff] px-5 py-4">
      <h3 className={cn("inline-flex rounded-md px-2 py-0.5 text-[13px] font-black", tone)}>{title}</h3>
      <div className="mt-3 space-y-2.5">
        {items.length === 0 && <p className="text-[12px] text-slate-400">—</p>}
        {items.map((row, index) => (
          <div key={index} className="flex gap-2 text-[12.5px] font-medium leading-5 text-[#172452]">
            {danger ? (
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            ) : (
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f0edff] text-[10px] text-brand">
                {index + 1}
              </span>
            )}
            <span>{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- //
// 移动端：项目验证诊断（字段行列表 + 底部编辑 sheet + 固定开始按钮）
// ----------------------------------------------------------------------------- //

type MobileField = {
  key: string;
  label: string;
  desc: string;
  icon: string;
  required: boolean;
  multiline: boolean;
};

const MOBILE_FIELDS: MobileField[] = [
  { key: "title", label: "项目名称", desc: "请输入项目名称", icon: "clipboard", required: true, multiline: false },
  { key: "company", label: "公司/项目主体", desc: "请输入公司或项目主体名称", icon: "database", required: true, multiline: false },
  ...CANVAS_MODULE_ORDER.map((m) => ({
    key: m,
    label: moduleLabel(m),
    desc: MODULE_HINTS[m] ?? "",
    icon: MODULE_ICONS[m] ?? "list-tree",
    required: true,
    multiline: true,
  })),
  { key: "question", label: "希望重点分析的问题", desc: "告诉我们你最关心的问题（可多条）", icon: "help-circle", required: false, multiline: true },
];

function MobileCanvasForm({
  title,
  company,
  question,
  canvas,
  phase,
  progress,
  statusMsg,
  canSubmit,
  submitHint,
  onTitle,
  onCompany,
  onQuestion,
  onModule,
  onDiagnose,
  result,
  projectContext,
  projectLoading,
  projectError,
}: {
  title: string;
  company: string;
  question: string;
  canvas: Record<string, string>;
  phase: Phase;
  progress: number;
  statusMsg: string | null;
  canSubmit: boolean;
  submitHint: string | null;
  onTitle: (v: string) => void;
  onCompany: (v: string) => void;
  onQuestion: (v: string) => void;
  onModule: (k: string, v: string) => void;
  onDiagnose: () => void;
  result: DiagnoseResult | null;
  projectContext: Project | null;
  projectLoading: boolean;
  projectError: string | null;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const getValue = (key: string): string => {
    if (key === "title") return title;
    if (key === "company") return company;
    if (key === "question") return question;
    return canvas[key] ?? "";
  };
  const setValue = (key: string, v: string) => {
    if (key === "title") onTitle(v);
    else if (key === "company") onCompany(v);
    else if (key === "question") onQuestion(v);
    else onModule(key, v);
  };

  const requiredKeys = MOBILE_FIELDS.filter((f) => f.required).map((f) => f.key);
  const filled = requiredKeys.filter((k) => getValue(k).trim()).length;
  const completion = Math.round((filled / requiredKeys.length) * 100);
  const running = phase === "running";
  const editingField = MOBILE_FIELDS.find((f) => f.key === editingKey) ?? null;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent pb-[168px]">
      {/* 顶部条 */}
      <header className="flex h-14 shrink-0 items-center gap-1 pl-16 pr-3">
        <button
          onClick={() => window.history.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#172452] hover:text-brand"
          title="返回"
        >
          <Icon name="chevron-left" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 truncate text-center text-[15px] font-black text-ink">项目验证诊断</div>
        <PendingTaskBell />
        <a href="/chat" className="flex h-9 w-9 items-center justify-center rounded-full text-[#172452] hover:text-brand" title="对话历史">
          <Icon name="history" className="h-5 w-5" />
        </a>
      </header>

      <div className="space-y-2.5 px-4 pt-2">
        {(projectContext || projectLoading || projectError) && (
          <ProjectLinkNotice
            project={projectContext}
            loading={projectLoading}
            error={projectError}
          />
        )}

        {/* 进度卡 */}
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
          <ProgressRing value={completion} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-brand">填写越完整，分析越精准</div>
            <div className="mt-0.5 text-[12px] text-slate-400">完成度 {completion}%</div>
          </div>
        </div>

        {/* 字段行 */}
        {MOBILE_FIELDS.map((field) => {
          const value = getValue(field.key).trim();
          return (
            <button
              key={field.key}
              onClick={() => setEditingKey(field.key)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 text-left shadow-[0_8px_20px_rgba(30,58,138,0.04)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4f1ff] text-brand">
                <Icon name={field.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[15px] font-bold text-ink">
                  {field.label}
                  {field.required && <span className="text-rose-500">*</span>}
                </span>
                <span className={cn("mt-0.5 block truncate text-[12px]", value ? "text-[#3b4a6b]" : "text-slate-400")}>
                  {value || field.desc}
                </span>
              </span>
              <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-slate-300" />
            </button>
          );
        })}

        {/* 结果（诊断完成后） */}
        {result && <ResultPanel result={result} />}
      </div>

      {/* 固定开始按钮（位于底部 Tab 栏之上） */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-white via-white to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+64px)] pt-4">
        {statusMsg && (
          <p className="mb-2 text-center text-[12px] font-semibold text-brand">{statusMsg}</p>
        )}
        <button
          onClick={onDiagnose}
          disabled={!canSubmit}
          title={submitHint ?? undefined}
          className="brand-gradient flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name={running ? "refresh" : "sparkles"} className={cn("h-5 w-5", running && "animate-spin")} />
          {running ? `分析中… ${progress}%` : "开始诊断"}
        </button>
      </div>

      {/* 字段编辑 sheet */}
      {editingField && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end" onClick={() => setEditingKey(null)}>
          <div className="absolute inset-0 bg-slate-950/30" />
          <div
            className="relative z-10 max-h-[80vh] rounded-t-3xl bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-5 shadow-[0_-18px_56px_rgba(15,23,42,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1 text-[16px] font-black text-ink">
                {editingField.label}
                {editingField.required && <span className="text-rose-500">*</span>}
              </h3>
              <button
                onClick={() => setEditingKey(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-brand"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[12px] text-slate-400">{editingField.desc}</p>
            {editingField.multiline ? (
              <textarea
                value={getValue(editingField.key)}
                onChange={(e) => setValue(editingField.key, e.target.value)}
                rows={5}
                autoFocus
                className="mt-3 w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-[14px] leading-6 text-ink outline-none focus:border-brand/50"
                placeholder={editingField.desc}
              />
            ) : (
              <input
                value={getValue(editingField.key)}
                onChange={(e) => setValue(editingField.key, e.target.value)}
                autoFocus
                className="mt-3 h-12 w-full rounded-xl border border-line bg-white px-4 text-[14px] text-ink outline-none focus:border-brand/50"
                placeholder={editingField.desc}
              />
            )}
            <button
              onClick={() => setEditingKey(null)}
              className="brand-gradient mt-4 h-11 w-full rounded-xl text-[14px] font-bold text-white shadow-soft"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#ece9ff" strokeWidth="5" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="#5b4bff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute text-[11px] font-black text-brand">{value}%</span>
    </span>
  );
}
