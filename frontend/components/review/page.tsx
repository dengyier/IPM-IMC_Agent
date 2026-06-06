"use client";

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import {
  ApiError,
  ReviewTask,
  ReviewTaskDetail,
  reviewApi,
} from "@/lib/api";
import {
  extensionTypeLabel,
  reviewStatusTone,
  reviewTaskTypeLabel,
  sourceTypeLabel,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 8;
const REVIEWER = "管理员";

type StatusKey = "pending" | "approved" | "rejected" | "all";

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已驳回" },
  { key: "all", label: "全部" },
];

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ReviewPage() {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<StatusKey>("pending");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"" | "approved" | "rejected">("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  async function loadAll(keepSelection = true) {
    setLoading(true);
    setListError(null);
    try {
      const data = await reviewApi.tasks("all");
      setTasks(data);
      setSelectedId((prev) =>
        keepSelection && prev && data.some((t) => t.id === prev) ? prev : null
      );
    } catch (e) {
      setListError(e instanceof ApiError ? e.message : "加载审核任务失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { pending: 0, approved: 0, rejected: 0, all: tasks.length };
    for (const t of tasks) {
      if (t.status === "pending") c.pending++;
      else if (t.status === "approved") c.approved++;
      else if (t.status === "rejected") c.rejected++;
    }
    return c;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (q && !(`${t.task_type} ${t.item_id} ${t.reviewer ?? ""}`.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [tasks, tab, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pendingFilteredIds = useMemo(
    () => filtered.filter((t) => t.status === "pending").map((t) => t.id),
    [filtered]
  );

  async function bulkDecide(decision: "approved" | "rejected") {
    const ids = pendingFilteredIds;
    if (!ids.length || bulkBusy) return;
    const action = decision === "approved" ? "通过" : "拒绝";
    if (
      decision === "rejected" &&
      !window.confirm(`确认一键拒绝当前筛选出的 ${ids.length} 条待审核任务吗？`)
    ) {
      return;
    }
    setBulkBusy(decision);
    setBulkMsg(null);
    try {
      const res = await reviewApi.bulkDecide({
        decision,
        task_ids: ids,
        reviewer: REVIEWER,
        comment: `一键${action}`,
        evolve_on_approve: decision === "approved",
      });
      setBulkMsg(res.message || `已一键${action}。`);
      setSelectedId(null);
      await loadAll(false);
    } catch (e) {
      setBulkMsg(e instanceof ApiError ? `批量操作失败：${e.message}` : "批量操作失败");
    } finally {
      setBulkBusy("");
    }
  }

  useEffect(() => {
    setPage(1);
    setBulkMsg(null);
  }, [tab, query]);

  // 默认选中当前筛选结果的第一条
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <ReviewHeader query={query} onQueryChange={setQuery} onRefresh={() => loadAll(true)} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pb-8 pt-5">
          <StatusTabs tab={tab} counts={counts} onSelect={setTab} />
          <div className="mt-5 grid min-h-0 flex-1 gap-5 xl:grid-cols-[380px_1fr]">
            <TaskList
              items={pageItems}
              total={filtered.length}
              loading={loading}
              error={listError}
              selectedId={selectedId}
              onSelect={setSelectedId}
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              pendingCount={pendingFilteredIds.length}
              bulkBusy={bulkBusy}
              bulkMsg={bulkMsg}
              onBulkDecide={bulkDecide}
            />
            <TaskDetailPanel taskId={selectedId} onDecided={() => loadAll(true)} />
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewHeader({
  query,
  onQueryChange,
  onRefresh,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-6 px-8 pt-6">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">人工审核台</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          严格把控知识质量，外部扩展进入正式知识网络前的必经人工闸口
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-[300px] items-center gap-2.5 rounded-xl border border-line bg-white px-4">
          <Icon name="search" className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="搜索任务类型 / 提交人 / 条目ID..."
          />
        </div>
        <button
          onClick={onRefresh}
          className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-[#172452] hover:text-brand"
        >
          <Icon name="refresh" className="h-4 w-4" />
          刷新
        </button>
      </div>
    </header>
  );
}

function StatusTabs({
  tab,
  counts,
  onSelect,
}: {
  tab: StatusKey;
  counts: Record<StatusKey, number>;
  onSelect: (k: StatusKey) => void;
}) {
  return (
    <Card className="mt-6 flex flex-wrap items-center gap-3 px-5 py-4">
      {STATUS_TABS.map((t) => {
        const active = t.key === tab;
        return (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold transition-colors",
              active ? "bg-[#f0edff] text-brand" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            {t.label}
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                active ? "bg-white text-brand" : "bg-slate-100 text-slate-400"
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </Card>
  );
}

function TaskList({
  items,
  total,
  loading,
  error,
  selectedId,
  onSelect,
  page,
  totalPages,
  onPageChange,
  pendingCount,
  bulkBusy,
  bulkMsg,
  onBulkDecide,
}: {
  items: ReviewTask[];
  total: number;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  pendingCount: number;
  bulkBusy: "" | "approved" | "rejected";
  bulkMsg: string | null;
  onBulkDecide: (decision: "approved" | "rejected") => void;
}) {
  return (
    <Card className="flex flex-col px-4 py-4">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-[15px] font-black text-ink">审核任务（{total}）</h2>
      </div>
      {pendingCount > 0 && (
        <BulkBar
          pendingCount={pendingCount}
          bulkBusy={bulkBusy}
          bulkMsg={bulkMsg}
          onBulkDecide={onBulkDecide}
        />
      )}
      <div className="mt-3 space-y-3">
        {loading && <p className="px-1 py-8 text-center text-[13px] text-slate-400">加载中…</p>}
        {error && !loading && (
          <p className="px-1 py-8 text-center text-[13px] text-rose-500">{error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="px-1 py-8 text-center text-[13px] text-slate-400">暂无任务</p>
        )}
        {!loading &&
          !error &&
          items.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              active={t.id === selectedId}
              onClick={() => onSelect(t.id)}
            />
          ))}
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      )}
    </Card>
  );
}

function BulkBar({
  pendingCount,
  bulkBusy,
  bulkMsg,
  onBulkDecide,
}: {
  pendingCount: number;
  bulkBusy: "" | "approved" | "rejected";
  bulkMsg: string | null;
  onBulkDecide: (decision: "approved" | "rejected") => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-line bg-[#fbfbff] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-md bg-[#f0edff] px-2 py-0.5 text-[11px] font-bold text-brand">
          当前筛选 {pendingCount} 条待审核
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onBulkDecide("approved")}
            disabled={pendingCount === 0 || !!bulkBusy}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="check-circle" className="h-4 w-4" />
            {bulkBusy === "approved" ? "处理中…" : "一键通过"}
          </button>
          <button
            onClick={() => onBulkDecide("rejected")}
            disabled={pendingCount === 0 || !!bulkBusy}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-[12.5px] font-bold text-rose-500 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="x-circle" className="h-4 w-4" />
            {bulkBusy === "rejected" ? "处理中…" : "一键拒绝"}
          </button>
        </div>
      </div>
      {bulkMsg && <p className="mt-2 text-[12px] font-semibold text-brand">{bulkMsg}</p>}
    </div>
  );
}

function TaskCard({
  task,
  active,
  onClick,
}: {
  task: ReviewTask;
  active: boolean;
  onClick: () => void;
}) {
  const st = reviewStatusTone[task.status] ?? {
    label: task.status,
    tone: "bg-slate-100 text-slate-500",
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
        <Icon name="clipboard-check" className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-[13px] font-bold", active ? "text-brand" : "text-[#172452]")}>
            {reviewTaskTypeLabel(task.task_type)}
          </span>
          <span className={cn("ml-auto rounded-md px-2 py-0.5 text-[11px] font-bold", st.tone)}>
            {st.label}
          </span>
        </div>
        <div className="mt-1.5 truncate text-[12px] font-medium text-slate-400">
          条目：{task.item_id.slice(0, 8)}…
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>{fmtTime(task.created_at)}</span>
          {task.reviewer && <span>审核人：{task.reviewer}</span>}
        </div>
      </div>
    </button>
  );
}

function Pagination({
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
    <div className="mt-5 flex items-center justify-center gap-2">
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

function TaskDetailPanel({
  taskId,
  onDecided,
}: {
  taskId: string | null;
  onDecided: () => void;
}) {
  const [detail, setDetail] = useState<ReviewTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [evolve, setEvolve] = useState(true);
  const [busy, setBusy] = useState<"" | "approved" | "rejected">("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setComment("");
    setEvolve(true);
    setResultMsg(null);
    (async () => {
      try {
        const d = await reviewApi.task(taskId);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "加载任务详情失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function decide(decision: "approved" | "rejected") {
    if (!taskId || busy) return;
    setBusy(decision);
    setResultMsg(null);
    try {
      const res = await reviewApi.decide(taskId, {
        decision,
        reviewer: REVIEWER,
        comment: comment.trim() || undefined,
        evolve_on_approve: evolve,
      });
      setResultMsg(res.message || "已提交决策。");
      // 重新拉详情以反映最新状态
      const d = await reviewApi.task(taskId);
      setDetail(d);
      onDecided();
    } catch (e) {
      setResultMsg(e instanceof ApiError ? `操作失败：${e.message}` : "操作失败");
    } finally {
      setBusy("");
    }
  }

  if (!taskId) {
    return (
      <Card className="flex min-w-0 items-center justify-center">
        <p className="text-[13px] text-slate-400">从左侧选择一条审核任务</p>
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
  if (error || !detail) {
    return (
      <Card className="flex min-w-0 items-center justify-center">
        <p className="text-[13px] text-rose-500">{error ?? "任务不存在"}</p>
      </Card>
    );
  }

  const item = detail.item;
  const st = reviewStatusTone[detail.status] ?? {
    label: detail.status,
    tone: "bg-slate-100 text-slate-500",
  };
  const pending = detail.status === "pending";

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line px-7 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-violet-100 px-2.5 py-1 text-[12px] font-bold text-violet">
            {reviewTaskTypeLabel(detail.task_type)}
          </span>
          <span className={cn("rounded-md px-2.5 py-1 text-[12px] font-bold", st.tone)}>{st.label}</span>
        </div>
        <h2 className="text-[20px] font-black text-ink">{item?.title ?? "（条目缺失）"}</h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-medium text-slate-500">
          {item?.source && (
            <>
              <span>提交人：<span className="text-[#172452]">{item.source.submitted_by || "—"}</span></span>
              <span>来源：<span className="text-[#172452]">{sourceTypeLabel(item.source.source_type)}「{item.source.title}」</span></span>
            </>
          )}
          {item && (
            <span>
              类型：<span className="text-[#172452]">{extensionTypeLabel(item.extension_type)}</span>
            </span>
          )}
          {item && (
            <span>
              对齐分：<span className="text-[#172452]">{(item.alignment_score * 100).toFixed(0)}</span>
            </span>
          )}
          <span className="ml-auto">
            提交时间：<span className="text-[#172452]">{fmtTime(detail.created_at)}</span>
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {item ? (
          <>
            {/* 原始内容 */}
            <h3 className="text-[15px] font-black text-ink">原始内容</h3>
            <div className="mt-3 whitespace-pre-line rounded-2xl bg-[#f8faff] px-6 py-5 text-[13px] font-medium leading-7 text-[#3b4a6b]">
              {item.content || "（无原始内容）"}
            </div>

            {/* AI 提取结果 */}
            <h3 className="mt-6 text-[15px] font-black text-ink">AI 提取摘要</h3>
            <p className="mt-3 text-[13px] font-medium leading-7 text-[#3b4a6b]">
              {item.summary || "—"}
            </p>
            {item.key_points.length > 0 && (
              <ul className="mt-3 space-y-2 text-[13px] font-medium leading-6 text-[#3b4a6b]">
                {item.key_points.map((kp, i) => (
                  <li key={i} className="flex gap-2.5 rounded-xl bg-[#f8faff] px-4 py-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {kp}
                  </li>
                ))}
              </ul>
            )}

            {/* 建议合并位置 */}
            <h3 className="mt-6 text-[15px] font-black text-ink">建议合并位置</h3>
            {item.aligned_node ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
                  <Icon name="git-merge" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-[#172452]">
                    {item.aligned_node.node_name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {item.aligned_node.node_category || "未分类"} · {item.aligned_node.version}
                  </div>
                </div>
                <span className="ml-auto rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                  对齐 {(item.alignment_score * 100).toFixed(0)}
                </span>
              </div>
            ) : (
              <p className="mt-3 text-[13px] font-medium text-slate-400">未对齐到核心节点（将作为新增扩展）。</p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-rose-500">关联扩展条目缺失。</p>
        )}

        {/* 决策区 */}
        {pending ? (
          <>
            <div className="mt-7 grid grid-cols-2 gap-4">
              <button
                onClick={() => decide("approved")}
                disabled={!!busy}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.28)] disabled:opacity-50"
              >
                <Icon name="check-circle" className="h-[18px] w-[18px]" />
                {busy === "approved" ? "提交中…" : "通过并合并"}
              </button>
              <button
                onClick={() => decide("rejected")}
                disabled={!!busy}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-500 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(244,63,94,0.26)] disabled:opacity-50"
              >
                <Icon name="x-circle" className="h-[18px] w-[18px]" />
                {busy === "rejected" ? "提交中…" : "拒绝"}
              </button>
            </div>

            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              className="mt-4 w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-medium text-[#172452] outline-none placeholder:text-slate-400"
              placeholder="添加审核意见（选填），将作为记录保存..."
            />

            <label className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
              <input
                type="checkbox"
                checked={evolve}
                onChange={(e) => setEvolve(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-brand"
              />
              通过后立即触发关联节点版本演进
            </label>
          </>
        ) : (
          <div className="mt-7 rounded-2xl bg-[#f8faff] px-5 py-4 text-[13px]">
            <div className="font-bold text-[#172452]">
              已{st.label}
              {detail.reviewer && <span className="ml-2 font-medium text-slate-400">by {detail.reviewer}</span>}
              {detail.reviewed_at && (
                <span className="ml-2 font-medium text-slate-400">· {fmtTime(detail.reviewed_at)}</span>
              )}
            </div>
            {detail.decision_comment && (
              <p className="mt-2 font-medium leading-6 text-[#3b4a6b]">审核意见：{detail.decision_comment}</p>
            )}
          </div>
        )}

        {resultMsg && <p className="mt-4 text-[12.5px] font-semibold text-brand">{resultMsg}</p>}
      </div>
    </Card>
  );
}
