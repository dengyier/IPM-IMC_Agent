"use client";

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import {
  ApiError,
  tianjiBachApi,
  type TianjiBachCase,
  type TianjiBachHypothesis,
  type TianjiSandboxResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const verdictMap: Record<string, { label: string; tone: string; bg: string }> = {
  continue: { label: "可继续验证", tone: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
  adjust: { label: "建议调整后再投入", tone: "text-orange-600", bg: "bg-orange-50 border-orange-100" },
  pause: { label: "暂不建议继续", tone: "text-rose-600", bg: "bg-rose-50 border-rose-100" },
};

const evidenceSourceLabels: Record<string, string> = {
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

export function BachDetailPage({ cardId }: { cardId: string }) {
  const [data, setData] = useState<TianjiBachCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sandboxRunning, setSandboxRunning] = useState(false);

  async function runSandbox() {
    if (sandboxRunning) return;
    setSandboxRunning(true);
    setError(null);
    try {
      await tianjiBachApi.runSandbox(cardId);
      setData(await tianjiBachApi.case(cardId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "沙盘运行失败");
    } finally {
      setSandboxRunning(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    tianjiBachApi
      .case(cardId)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "BACH 裁决详情加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const evidenceByHypothesis = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.evidence ?? []) {
      map.set(item.hypothesis_id, (map.get(item.hypothesis_id) ?? 0) + 1);
    }
    return map;
  }, [data?.evidence]);

  const verdict = data?.adjudication?.verdict ?? "";
  const verdictMeta = verdictMap[verdict] ?? verdictMap.adjust;
  const probability = data?.adjudication ? Math.round(data.adjudication.probability * 100) : 0;
  const latestPrediction = data?.predictions?.[0] ?? null;

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <a href="/" className="inline-flex items-center gap-1.5 text-[12px] font-black text-brand hover:text-violet">
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
            返回验证工作台
          </a>
          <h1 className="mt-3 text-[28px] font-black tracking-[-0.03em] text-ink">冷酷审判详情</h1>
          <p className="mt-1.5 text-[13px] font-medium text-slate-500">
            BACH 根据假设树、证据账本和公式裁决生成当前判断。
          </p>
        </div>
        {data && (
          <div className={cn("min-w-[220px] rounded-2xl border px-4 py-3", verdictMeta.bg)}>
            <div className="text-[12px] font-black text-slate-500">当前裁决</div>
            <div className={cn("mt-1 text-[20px] font-black", verdictMeta.tone)}>{verdictMeta.label}</div>
            <div className="mt-2 text-[12px] font-bold text-slate-500">综合置信度 {probability}%</div>
          </div>
        )}
      </header>

      {loading ? (
        <section className="dashboard-card mt-6 flex min-h-[260px] items-center justify-center rounded-2xl">
          <div className="flex items-center gap-2 text-[13px] font-bold text-slate-400">
            <Icon name="refresh" className="h-4 w-4 animate-spin" />
            正在加载审判详情...
          </div>
        </section>
      ) : error ? (
        <section className="dashboard-card mt-6 rounded-2xl px-5 py-5 text-[13px] font-bold text-orange-600">
          {error}
        </section>
      ) : data ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_320px]">
          <section className="space-y-5">
            <SummaryPanel data={data} probability={probability} latestBrier={latestPrediction?.brier ?? null} />
            <HypothesisTree rows={data.hypotheses} evidenceByHypothesis={evidenceByHypothesis} />
            <SandboxPanel sandbox={data.sandbox} running={sandboxRunning} onRun={runSandbox} />
            <EvidenceLedger data={data} />
          </section>

          <aside className="space-y-4">
            <SideCard title="裁决理由">
              <ol className="space-y-2">
                {(data.adjudication?.reasons ?? []).map((reason, index) => (
                  <li key={reason} className="flex gap-2 text-[12px] font-bold leading-5 text-[#172452]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] text-orange-600">
                      {index + 1}
                    </span>
                    {reason}
                  </li>
                ))}
              </ol>
            </SideCard>

            <SideCard title="停止信号">
              <div className="space-y-2">
                {(data.adjudication?.kill_criteria ?? []).map((item, index) => (
                  <div key={`${item.hypothesis_id}-${index}`} className="rounded-xl bg-orange-50 px-3 py-2 text-[12px] font-bold leading-5 text-orange-700">
                    {String(item.signal || "关键假设被证伪")}
                  </div>
                ))}
              </div>
            </SideCard>

            <SideCard title="审计状态">
              <Metric label="算法版本" value={data.algorithm_version} />
              <Metric label="账本重放" value={data.replay_consistent ? "一致" : "需检查"} tone={data.replay_consistent ? "text-emerald-600" : "text-orange-600"} />
              <Metric label="证据记录" value={`${data.evidence.length} 条`} />
              <Metric label="预测快照" value={`${data.predictions.length} 次`} />
            </SideCard>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function SummaryPanel({
  data,
  probability,
  latestBrier,
}: {
  data: TianjiBachCase;
  probability: number;
  latestBrier: number | null;
}) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Score label="综合置信度" value={`${probability}%`} icon="gauge" />
        <Score label="关键假设" value={`${data.hypotheses.length} 个`} icon="target" />
        <Score label="证据账本" value={`${data.evidence.length} 条`} icon="file-check" />
        <Score label="Brier 评分" value={latestBrier === null ? "待复盘" : String(latestBrier)} icon="activity" />
      </div>
    </section>
  );
}

function HypothesisTree({
  rows,
  evidenceByHypothesis,
}: {
  rows: TianjiBachHypothesis[];
  evidenceByHypothesis: Map<string, number>;
}) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-black text-ink">假设树</h2>
        <span className="text-[12px] font-bold text-slate-400">概率来自 log-odds 公式更新</span>
      </div>
      <div className="space-y-3">
        {rows.map((item) => (
          <div key={item.id} className="rounded-2xl border border-line bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-[#f0edff] px-2 py-1 text-[11px] font-black text-brand">{dimensionLabel(item.dimension)}</span>
                  <span className={cn("rounded-lg px-2 py-1 text-[11px] font-black", statusTone(item.status))}>{statusLabel(item.status)}</span>
                  {item.decisive && (
                    <span className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-600">决定性假设</span>
                  )}
                  <span className="text-[11px] font-bold text-slate-400">证据 {evidenceByHypothesis.get(item.id) ?? 0} 条</span>
                </div>
                <div className="mt-2 text-[14px] font-black leading-6 text-[#172452]">{item.statement}</div>
                <div className="mt-2 grid gap-2 text-[12px] font-semibold leading-5 text-slate-500 md:grid-cols-2">
                  <div>支持信号：{item.validated_by || "待补充"}</div>
                  <div>证伪信号：{item.falsified_by || "待补充"}</div>
                </div>
              </div>
              <div className="w-[120px] shrink-0 text-right">
                <div className="text-[22px] font-black text-brand">{Math.round(item.probability * 100)}%</div>
                <div className="mt-1 text-[11px] font-bold text-slate-400">影响权重 {Math.round(item.impact_weight * 100)}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EvidenceLedger({ data }: { data: TianjiBachCase }) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[17px] font-black text-ink">证据账本</h2>
        <span className="text-[12px] font-bold text-slate-400">A/B/C/D 控制似然比上限</span>
      </div>
      {data.evidence.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-[13px] font-bold text-slate-400">暂无证据入账</div>
      ) : (
        <div className="divide-y divide-line">
          {data.evidence.slice(0, 12).map((item) => {
            const meta = validationEvidenceMeta(item.review_detail);
            return (
              <div key={item.id} className="grid gap-3 py-3 md:grid-cols-[80px_1fr_140px]">
                <div>
                  <span className={cn("rounded-lg px-2 py-1 text-[12px] font-black", gradeTone(item.grade))}>{item.grade} 级</span>
                  {meta.user_grade && meta.user_grade !== item.grade && (
                    <div className="mt-2 text-[10px] font-bold text-slate-400">用户标注 {meta.user_grade}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[13px] font-bold leading-5 text-[#172452]">{item.content}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                    <span className="truncate">{item.source_type} · {item.source_ref}</span>
                    {meta.user_source_type && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-black text-slate-500">
                        {evidenceSourceLabels[meta.user_source_type] || meta.user_source_type}
                      </span>
                    )}
                    {meta.attachment_name && (
                      <a
                        href={meta.attachment_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-blue-50 px-1.5 py-0.5 font-black text-blue-600 underline"
                      >
                        附件：{meta.attachment_name}
                      </a>
                    )}
                    {item.reviewer_spread > 0.6 && (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 font-black text-rose-600">
                        评审分歧 ±{item.reviewer_spread}，已降权
                      </span>
                    )}
                    {Array.isArray(item.review_detail?.reviewers) && (item.review_detail.reviewers as unknown[]).length > 1 && (
                      <span className="rounded bg-[#f0edff] px-1.5 py-0.5 font-black text-brand">
                        {(item.review_detail.reviewers as unknown[]).length} 模型评审
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-[12px] font-bold text-slate-500">
                  <div>LR {item.log_lr_effective}</div>
                  <div className="mt-1 text-slate-400">raw {item.log_lr_raw}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function validationEvidenceMeta(detail: Record<string, unknown>) {
  const meta = detail?.validation_evidence;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {} as Record<string, string>;
  }
  return meta as Record<string, string>;
}

function SandboxPanel({
  sandbox,
  running,
  onRun,
}: {
  sandbox: TianjiSandboxResult | null;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <section className="dashboard-card rounded-2xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-black text-ink">量化沙盘</h2>
          <p className="mt-1 text-[12px] font-bold text-slate-400">蒙特卡洛 10,000 次模拟，参数只从真实证据提取，缺参不编造</p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="brand-gradient flex h-9 items-center gap-1.5 rounded-xl px-4 text-[12px] font-black text-white shadow-soft disabled:opacity-45"
        >
          <Icon name="refresh" className={cn("h-3.5 w-3.5", running && "animate-spin")} />
          {running ? "模拟中" : sandbox ? "重新模拟" : "运行沙盘"}
        </button>
      </div>

      {!sandbox ? (
        <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-[13px] font-bold text-slate-400">
          尚未运行。沙盘会回答：投入在目标期限内收回的概率是多少，最敏感的变量是什么。
        </div>
      ) : !sandbox.available ? (
        <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-[13px] font-black text-orange-700">沙盘不可用：证据中缺少必要参数</div>
          <ul className="mt-2 space-y-1 text-[12px] font-bold text-orange-600">
            {sandbox.missing.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] font-semibold text-slate-500">
            先通过验证动作补齐这些数字证据（如渠道报价、客户预算），再运行沙盘。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Score label={`${sandbox.target_months}个月内回本概率`} value={`${Math.round((sandbox.p_payback ?? 0) * 100)}%`} icon="money" />
            <Score label="完全无法回本概率" value={`${Math.round((sandbox.loss_probability ?? 0) * 100)}%`} icon="alert" />
            <Score label="回本月数 P50" value={sandbox.payback_p50 === null ? "—" : `${sandbox.payback_p50} 个月`} icon="calendar" />
            <Score label="回本月数 P90" value={sandbox.payback_p90 === null ? "—" : `${sandbox.payback_p90} 个月`} icon="calendar" />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-black text-slate-500">敏感性排序（参数在区间两端时回本概率的摆动）</div>
            <div className="space-y-2">
              {sandbox.tornado.slice(0, 5).map((item) => (
                <div key={item.param} className="flex items-center gap-3">
                  <span className="w-[130px] shrink-0 truncate text-[12px] font-bold text-[#172452]">{item.label}</span>
                  <span className="h-2 flex-1 rounded-full bg-slate-100">
                    <span className="block h-2 rounded-full bg-brand" style={{ width: `${Math.max(4, Math.min(item.swing * 100, 100))}%` }} />
                  </span>
                  <span className="w-[90px] shrink-0 text-right text-[12px] font-bold text-slate-500">±{Math.round(item.swing * 100)}pp</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] font-semibold text-slate-400">
            投入 {sandbox.investment ? `${Math.round(sandbox.investment / 10000)}万` : "—"} · 模拟 {sandbox.simulations.toLocaleString()} 次 ·
            结论已作为 B 级证据计入单位经济假设
          </p>
        </div>
      )}
    </section>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="dashboard-card rounded-2xl px-4 py-4">
      <h3 className="mb-3 text-[15px] font-black text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Score({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <Icon name={icon} className="h-4 w-4 text-brand" />
      <div className="mt-3 text-[22px] font-black text-[#172452]">{value}</div>
      <div className="mt-1 text-[12px] font-bold text-slate-400">{label}</div>
    </div>
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

function dimensionLabel(value: string): string {
  return {
    customer_demand: "客户需求",
    willingness_to_pay: "付费意愿",
    channel: "渠道",
    unit_economics: "单位经济",
    delivery: "交付",
    competition: "竞争",
    compliance: "合规",
  }[value] || value;
}

function statusLabel(value: string): string {
  return { open: "待验证", supported: "已支持", refuted: "已证伪", stale: "已过期" }[value] || value;
}

function statusTone(value: string): string {
  if (value === "supported") return "bg-emerald-50 text-emerald-600";
  if (value === "refuted") return "bg-rose-50 text-rose-600";
  return "bg-slate-100 text-slate-500";
}

function gradeTone(value: string): string {
  if (value === "A") return "bg-emerald-50 text-emerald-600";
  if (value === "B") return "bg-sky-50 text-sky-600";
  if (value === "C") return "bg-orange-50 text-orange-600";
  return "bg-slate-100 text-slate-500";
}
