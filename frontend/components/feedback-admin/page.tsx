"use client";

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { ApiError, feedbackApi, type Feedback, type FeedbackCategory } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  suggestion: "功能建议",
  problem: "问题反馈",
  other: "其它",
};

const STATUS_LABEL: Record<Feedback["status"], string> = {
  open: "待处理",
  resolved: "已处理",
};

export function FeedbackAdminPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | Feedback["status"]>("open");
  const [category, setCategory] = useState<"all" | FeedbackCategory>("all");
  const [keyword, setKeyword] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category]);

  useEffect(() => {
    setReply(selected?.admin_reply || "");
  }, [selected?.id, selected?.admin_reply]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await feedbackApi.list({
        status: status === "all" ? undefined : status,
        category: category === "all" ? undefined : category,
        keyword,
      });
      setItems(data);
      setSelectedId((current) => (current && data.some((item) => item.id === current) ? current : data[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载反馈失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(nextStatus: Feedback["status"]) {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await feedbackApi.updateStatus(selected.id, nextStatus, reply.trim() || undefined);
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "更新反馈失败");
    } finally {
      setSaving(false);
    }
  }

  const openCount = items.filter((item) => item.status === "open").length;
  const resolvedCount = items.filter((item) => item.status === "resolved").length;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[26px] font-black tracking-tight text-ink">反馈管理</h1>
          <p className="mt-2 text-[13px] text-slate-500">
            集中查看用户提交的问题与建议，支持筛选、检索和处理闭环。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
              className="h-11 w-[300px] rounded-xl border border-line bg-white pl-10 pr-4 text-[13px] text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-brand/50"
              placeholder="搜索内容、用户、手机号..."
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-[#24365f] transition-colors hover:text-brand"
          >
            <Icon name="refresh" className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </button>
        </div>
      </header>

      <section className="mt-8 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "open", "resolved"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={cn(
                "h-10 rounded-xl px-4 text-[13px] font-bold transition-colors",
                status === key ? "bg-[#f0edff] text-brand" : "bg-white text-slate-500 hover:bg-slate-50"
              )}
            >
              {key === "all" ? "全部" : STATUS_LABEL[key]}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                {key === "all" ? items.length : key === "open" ? openCount : resolvedCount}
              </span>
            </button>
          ))}
          <div className="mx-2 h-5 w-px bg-line" />
          {(["all", "suggestion", "problem", "other"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                "h-10 rounded-xl px-4 text-[13px] font-bold transition-colors",
                category === key ? "bg-[#f0edff] text-brand" : "bg-white text-slate-500 hover:bg-slate-50"
              )}
            >
              {key === "all" ? "全部类型" : CATEGORY_LABEL[key]}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-500">
          {error}
        </div>
      )}

      <section className="mt-5 grid min-h-[620px] grid-cols-[380px_minmax(0,1fr)] gap-5">
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="border-b border-line px-5 py-4">
            <div className="text-[15px] font-black text-ink">反馈列表（{items.length}）</div>
          </div>
          <div className="max-h-[720px] overflow-y-auto p-4">
            {loading ? (
              <div className="py-20 text-center text-[13px] font-semibold text-slate-400">正在加载反馈...</div>
            ) : items.length === 0 ? (
              <div className="py-20 text-center text-[13px] font-semibold text-slate-400">暂无反馈</div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-all",
                      selected?.id === item.id
                        ? "border-brand/50 bg-[#f8f6ff] shadow-[0_12px_30px_rgba(91,75,255,0.08)]"
                        : "border-line bg-white hover:border-brand/25 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-lg bg-[#f0edff] px-2.5 py-1 text-[12px] font-bold text-brand">
                        {CATEGORY_LABEL[item.category]}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-3 line-clamp-2 text-[13px] font-semibold leading-6 text-ink">
                      {item.content}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[12px] text-slate-400">
                      <span>{item.user_name || item.user_phone || "未知用户"}</span>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#f0edff] px-2.5 py-1 text-[12px] font-bold text-brand">
                      {CATEGORY_LABEL[selected.category]}
                    </span>
                    <StatusBadge status={selected.status} />
                  </div>
                  <h2 className="mt-4 text-[20px] font-black text-ink">
                    {selected.user_name || selected.user_phone || "用户反馈"}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-500">
                    <span>手机号：{selected.user_phone || "-"}</span>
                    <span>联系方式：{selected.contact || "-"}</span>
                    <span>提交时间：{formatDate(selected.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateStatus("resolved")}
                    disabled={saving}
                    className="flex h-10 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-[13px] font-bold text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Icon name="check-circle" className="h-4 w-4" />
                    标记已处理
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus("open")}
                    disabled={saving}
                    className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[13px] font-bold text-slate-500 transition-colors hover:text-brand disabled:opacity-50"
                  >
                    <Icon name="rotate-ccw" className="h-4 w-4" />
                    重新打开
                  </button>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <section>
                  <h3 className="text-[14px] font-black text-ink">反馈内容</h3>
                  <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 text-[14px] leading-8 text-[#233153]">
                    {selected.content}
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-4">
                  <InfoItem label="来源页面" value={selected.page_url || "-"} />
                  <InfoItem label="浏览器信息" value={selected.user_agent || "-"} />
                </section>

                <section>
                  <h3 className="text-[14px] font-black text-ink">处理备注</h3>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    className="mt-3 w-full resize-none rounded-2xl border border-line bg-white px-4 py-3 text-[13px] leading-6 text-ink outline-none transition-colors placeholder:text-slate-400 focus:border-brand/50"
                    placeholder="填写处理说明（选填，仅超管可见）"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => updateStatus(selected.status)}
                      disabled={saving}
                      className="brand-gradient flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-white shadow-soft disabled:opacity-50"
                    >
                      {saving && <Icon name="refresh" className="h-4 w-4 animate-spin" />}
                      保存备注
                    </button>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[620px] items-center justify-center text-[13px] font-semibold text-slate-400">
              从左侧选择一条反馈查看详情
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: Feedback["status"] }) {
  return (
    <span
      className={cn(
        "rounded-lg px-2.5 py-1 text-[12px] font-bold",
        status === "open" ? "bg-orange-50 text-orange-500" : "bg-emerald-50 text-emerald-600"
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-[12px] font-bold text-slate-400">{label}</div>
      <div className="mt-2 line-clamp-3 break-all text-[12.5px] leading-6 text-[#233153]">{value}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
