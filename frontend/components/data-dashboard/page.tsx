"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import {
  dashboardApi,
  nodesApi,
  systemApi,
  type ComponentHealth,
  type ComponentStatus,
  type DashboardSummary,
  type NodeCategory,
  type PendingItem,
  type RecentReport,
  type RecentReviewTask,
  type SystemHealth,
} from "@/lib/api";
import {
  fmtNum,
  pendingItemMeta,
  reportGrade,
  reviewTaskTypeLabel,
  systemStatusTone,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

type LoadState = {
  summary: DashboardSummary | null;
  pending: PendingItem[];
  reports: RecentReport[];
  reviewTasks: RecentReviewTask[];
  categories: NodeCategory[];
  health: SystemHealth | null;
};

const emptyState: LoadState = {
  summary: null,
  pending: [],
  reports: [],
  reviewTasks: [],
  categories: [],
  health: null,
};

export function DataDashboardPage() {
  const [state, setState] = useState<LoadState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dashboardApi.summary(),
      dashboardApi.pendingItems(),
      dashboardApi.recentReports(6),
      dashboardApi.recentReviewTasks(6),
      nodesApi.categories(10),
      systemApi.health(),
    ])
      .then(([summary, pending, reports, reviewTasks, categories, health]) => {
        if (!cancelled) {
          setState({ summary, pending, reports, reviewTasks, categories, health });
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "数据看板加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceTotal = state.summary
    ? state.summary.methodology_sources + state.summary.expansion_sources
    : 0;
  const assetRows = useMemo(() => buildAssetRows(state.summary), [state.summary]);
  const categoryRows = state.categories.filter((item) => item.label !== "全部节点");
  const categoryMax = Math.max(1, ...categoryRows.map((item) => item.count));
  const pendingMax = Math.max(1, ...state.pending.map((item) => item.count));
  const systemComponents = state.health?.components ?? summaryStatusToComponents(state.summary);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <a
            href="/"
            className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-[#172452] hover:text-brand"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
          </a>
          <h1 className="text-[28px] font-black tracking-[-0.03em] text-ink">数据看板</h1>
          <p className="mt-1.5 text-[13px] font-medium text-slate-500">
            聚合资料、知识节点、诊断报告、审核任务与系统健康状态。
          </p>
        </div>
        <div className="dashboard-card flex items-center gap-3 rounded-2xl px-4 py-3">
          <span className={cn("h-2.5 w-2.5 rounded-full", error ? "bg-rose-500" : "bg-emerald-500")} />
          <div>
            <div className="text-[12px] font-bold text-ink">{error ? "加载异常" : loading ? "正在同步" : "实时数据"}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">来源：后端真实统计接口</div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-[13px] font-bold text-rose-500">
          {error}
        </div>
      )}

      <section className="mt-6 grid grid-cols-4 gap-5">
        <MetricCard icon="folder" label="资料总数" value={loadingValue(loading, sourceTotal)} unit="份" />
        <MetricCard icon="share" label="知识节点" value={loadingValue(loading, state.summary?.nodes)} unit="个" />
        <MetricCard icon="git-merge" label="关系边" value={loadingValue(loading, state.summary?.edges)} unit="条" />
        <MetricCard icon="file-bar-chart" label="诊断报告" value={loadingValue(loading, state.summary?.reports)} unit="份" />
      </section>

      <section className="mt-5 grid grid-cols-[1.2fr_0.8fr] gap-5">
        <Panel title="知识资产结构" actionHref="/data-center" action="查看资料">
          <div className="grid grid-cols-2 gap-4">
            {assetRows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-line bg-white/70 px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", row.dot)} />
                  <span className="text-[12px] font-bold text-slate-500">{row.label}</span>
                </div>
                <div className="mt-3 text-[26px] font-black tracking-[-0.03em] text-ink">
                  {loading ? "··" : fmtNum(row.value)}
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div
                    className={cn("h-2 rounded-full", row.bar)}
                    style={{ width: `${Math.max(5, Math.min(row.percent, 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="待处理任务" actionHref="/review" action="去处理">
          <div className="space-y-4">
            {state.pending.map((item) => {
              const meta = pendingItemMeta[item.key];
              if (!meta) return null;
              return (
                <a key={item.key} href={meta.route} className="block rounded-2xl border border-line bg-white/70 px-4 py-3 hover:bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name={meta.icon} className="h-4 w-4 text-brand" />
                      <span className="text-[13px] font-bold text-ink">{meta.label}</span>
                    </div>
                    <span className="text-[18px] font-black text-ink">{loading ? "··" : item.count}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className={cn("h-2 rounded-full", meta.dot)} style={{ width: `${(item.count / pendingMax) * 100}%` }} />
                  </div>
                </a>
              );
            })}
            {!loading && state.pending.length === 0 && <EmptyText text="暂无待处理任务" />}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid grid-cols-[1fr_1fr] gap-5">
        <Panel title="知识节点分类分布" actionHref="/knowledge-nodes" action="查看节点库">
          <div className="space-y-3">
            {categoryRows.map((item, index) => (
              <div key={item.label} className="grid grid-cols-[116px_1fr_42px] items-center gap-3">
                <div className="truncate text-[12px] font-bold text-slate-600">{item.label}</div>
                <div className="h-2.5 rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-brand to-[#25b7c7]"
                    style={{ width: `${Math.max(4, (item.count / categoryMax) * 100)}%`, opacity: 1 - index * 0.035 }}
                  />
                </div>
                <div className="text-right text-[12px] font-black text-ink">{item.count}</div>
              </div>
            ))}
            {!loading && categoryRows.length === 0 && <EmptyText text="暂无节点分类数据" />}
          </div>
        </Panel>

        <Panel title="系统健康状态" actionHref="/settings" action="系统设置">
          <div className="grid grid-cols-2 gap-3">
            {systemComponents.map((item) => (
              <SystemCell key={item.key} item={item} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="mt-5 grid grid-cols-[1fr_1fr] gap-5 pb-8">
        <Panel title="最近诊断报告" actionHref="/reports" action="查看全部">
          <div className="space-y-2">
            {state.reports.map((report) => {
              const grade = reportGrade(report.quality_score);
              return (
                <a key={report.id} href="/reports" className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon name="file-text" className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-ink">{report.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{formatTime(report.created_at)}</div>
                  </div>
                  <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-bold", grade.tone)}>{grade.label}</span>
                </a>
              );
            })}
            {!loading && state.reports.length === 0 && <EmptyText text="暂无诊断报告" />}
          </div>
        </Panel>

        <Panel title="最近审核任务" actionHref="/review" action="查看审核台">
          <div className="space-y-2">
            {state.reviewTasks.map((task) => (
              <a key={task.id} href="/review" className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <Icon name="clipboard-check" className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-ink">{reviewTaskTypeLabel(task.task_type)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{formatTime(task.created_at)}</div>
                </div>
                <StatusBadge status={task.status} />
              </a>
            ))}
            {!loading && state.reviewTasks.length === 0 && <EmptyText text="暂无审核任务" />}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value, unit }: { icon: string; label: string; value: string; unit: string }) {
  return (
    <div className="dashboard-card rounded-2xl px-5 py-5">
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0edff] text-brand">
          <Icon name={icon} className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-600">实时</span>
      </div>
      <div className="mt-5 text-[12px] font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-ink">
        <span className="text-[30px] font-black tracking-[-0.04em]">{value}</span>
        <span className="ml-1 text-[12px] text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  actionHref,
  children,
}: {
  title: string;
  action?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[16px] font-black text-ink">{title}</h2>
        {action && actionHref && (
          <a href={actionHref} className="flex items-center gap-1 text-[12px] font-bold text-brand hover:text-violet">
            {action}
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function SystemCell({ item }: { item: ComponentHealth }) {
  const tone = systemStatusTone[item.status] ?? systemStatusTone.offline;
  return (
    <div className="rounded-2xl border border-line bg-white/70 px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-black text-ink">{item.label}</div>
        <span className={cn("h-2.5 w-2.5 rounded-full", tone.dot)} />
      </div>
      <div className={cn("mt-2 text-[12px] font-bold", tone.text)}>{tone.label}</div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{item.detail}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "pending"
      ? "bg-orange-50 text-orange-500"
      : status === "approved" || status === "checked"
        ? "bg-emerald-50 text-emerald-600"
        : status === "rejected" || status === "failed"
          ? "bg-rose-50 text-rose-500"
          : "bg-slate-100 text-slate-500";
  const label =
    status === "pending"
      ? "待处理"
      : status === "approved"
        ? "已通过"
        : status === "rejected"
          ? "已驳回"
          : status;
  return <span className={cn("rounded-lg px-2 py-0.5 text-[11px] font-bold", tone)}>{label}</span>;
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-2xl bg-slate-50 py-8 text-center text-[12px] font-medium text-slate-400">{text}</div>;
}

function buildAssetRows(summary: DashboardSummary | null) {
  const total = summary
    ? Math.max(
        summary.methodology_sources +
          summary.expansion_sources +
          summary.chunks +
          summary.nodes +
          summary.edges +
          summary.expansion_items,
        1
      )
    : 1;
  return [
    { label: "核心资料", value: summary?.methodology_sources ?? 0, dot: "bg-blue-500", bar: "bg-blue-500" },
    { label: "扩展资料", value: summary?.expansion_sources ?? 0, dot: "bg-violet-500", bar: "bg-violet-500" },
    { label: "知识切块", value: summary?.chunks ?? 0, dot: "bg-cyan-500", bar: "bg-cyan-500" },
    { label: "扩展条目", value: summary?.expansion_items ?? 0, dot: "bg-emerald-500", bar: "bg-emerald-500" },
    { label: "路由规则", value: summary?.routing_rules ?? 0, dot: "bg-orange-500", bar: "bg-orange-500" },
    { label: "关系网络", value: summary?.edges ?? 0, dot: "bg-rose-500", bar: "bg-rose-500" },
  ].map((row) => ({ ...row, percent: (row.value / total) * 100 }));
}

function summaryStatusToComponents(summary: DashboardSummary | null): ComponentHealth[] {
  if (!summary) return [];
  return [
    { key: "database", label: "数据库", status: toComponentStatus(summary.system_status.database), detail: "业务数据读写状态", meta: {} },
    { key: "qdrant", label: "向量库", status: toComponentStatus(summary.system_status.qdrant), detail: "知识检索向量服务", meta: {} },
    { key: "llm", label: "LLM", status: toComponentStatus(summary.system_status.llm), detail: "模型推理服务", meta: {} },
    { key: "embedding", label: "Embedding", status: toComponentStatus(summary.system_status.embedding), detail: "文本向量化服务", meta: {} },
  ];
}

function toComponentStatus(status: string): ComponentStatus {
  if (status === "ok" || status === "offline_fallback" || status === "error" || status === "offline") {
    return status;
  }
  return "offline";
}

function loadingValue(loading: boolean, value: number | undefined) {
  if (loading) return "··";
  return fmtNum(value ?? 0);
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
