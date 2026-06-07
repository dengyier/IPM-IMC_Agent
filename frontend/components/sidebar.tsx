"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";
import { navItems } from "@/lib/data";
import { dashboardApi, type DashboardSummary } from "@/lib/api";
import { canAccessNavItem } from "@/lib/authz";
import { fmtNum } from "@/lib/presentation";
import { useAuth } from "./auth-context";
import { UserAccountMenu } from "./user-account-menu";
import { FeedbackDialog } from "./feedback-dialog";

export function Sidebar({ activeKey = "home" }: { activeKey?: string }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const visibleNavItems = navItems.filter((item) => canAccessNavItem(user, item));

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .summary()
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceTotal = summary ? summary.methodology_sources + summary.expansion_sources : null;

  return (
    <aside className="flex h-screen w-[212px] shrink-0 flex-col border-r border-line bg-white/92 shadow-[10px_0_38px_rgba(30,58,138,0.035)] backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-[12px] shadow-soft ring-4 ring-indigo-50">
          <Icon name="boxes" className="h-5 w-5 text-white" strokeWidth={1.9} />
        </div>
        <div className="leading-tight">
          <div className="text-[15.5px] font-black tracking-tight text-ink">IMC&IPM</div>
          <div className="mt-0.5 text-[12px] font-semibold text-ink/85">商业决策智能体</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-0 flex flex-col gap-1 px-3">
        {visibleNavItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3.5 py-3 text-[13.5px] transition-all",
              item.key === activeKey
                ? "bg-[#f0edff] font-semibold text-brand shadow-[inset_0_0_0_1px_rgba(91,75,255,0.06)]"
                : "text-[#1c2a54] hover:bg-gray-50 hover:text-brand"
            )}
          >
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Asset card */}
      <div className="mx-3 mt-6 overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-b from-indigo-50 to-white p-4 shadow-card">
        <div className="text-[13px] font-bold text-brand">知识资产沉淀中</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          每一次学习都会沉淀为可复用的知识资产
        </p>
        {user?.is_super_admin && (
          <a
            href="/knowledge-graph"
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-100 bg-white/85 text-[12px] font-bold text-brand transition-colors hover:bg-[#f6f5ff]"
          >
            查看完整图谱
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
        )}
        <div className="mt-4 space-y-3">
          <AssetStat label="资料总数" value={error ? "—" : sourceTotal !== null ? fmtNum(sourceTotal) : "··"} unit="份" />
          <AssetStat label="知识节点总数" value={error ? "—" : summary ? fmtNum(summary.nodes) : "··"} unit="个" />
          <AssetStat label="关系边总数" value={error ? "—" : summary ? fmtNum(summary.edges) : "··"} unit="条" />
          <AssetStat label="诊断报告总数" value={error ? "—" : summary ? fmtNum(summary.reports) : "··"} unit="份" />
          <AssetStat label="待审核任务" value={error ? "—" : summary ? fmtNum(summary.pending_reviews) : "··"} unit="条" />
        </div>
        <div className="mt-2 flex justify-center pb-1 pt-1">
          <div className="isometric-blocks">
            <span className="left-[16px] top-[70px] h-[22px] w-[104px] rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500" />
            <span className="left-[34px] top-[52px] h-[28px] w-[34px] rounded-lg bg-gradient-to-br from-[#4c43df] to-[#7f6bff]" />
            <span className="left-[73px] top-[34px] h-[48px] w-[34px] rounded-lg bg-gradient-to-br from-[#7d66ff] to-[#b49aff]" />
            <span className="left-[88px] top-[58px] h-[25px] w-[18px] rounded-md bg-white/40" />
            <span className="left-[19px] top-[83px] h-[12px] w-[76px] rounded-lg bg-gradient-to-r from-blue-500 to-violet-400 opacity-70" />
          </div>
        </div>
      </div>

      {/* User */}
      <div className="mt-auto border-t border-line">
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="mx-3 mt-3 flex h-10 w-[calc(100%-24px)] items-center gap-2.5 rounded-xl px-3.5 text-[13px] font-semibold text-[#1c2a54] transition-colors hover:bg-[#f0edff] hover:text-brand"
        >
          <Icon name="help-circle" className="h-4 w-4" />
          意见反馈
        </button>
        <UserAccountMenu
          placement="top-start"
          className="w-full rounded-none px-4 py-4 hover:bg-slate-50"
          avatarClassName="h-9 w-9 overflow-hidden ring-slate-50"
          chevronClassName="ml-auto"
        />
      </div>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </aside>
  );
}

function AssetStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-ink">
        <span className="text-[18px] font-black">{value}</span>
        <span className="ml-1 text-[11px] text-slate-400">{unit}</span>
      </div>
    </div>
  );
}
