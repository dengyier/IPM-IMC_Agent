"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/icon";
import { PendingTaskBell } from "@/components/pending-task-bell";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { useAuth } from "@/components/auth-context";
import { MobileTabBar } from "@/components/mobile/tab-bar";
import { DashboardSummary, dashboardApi } from "@/lib/api";
import { fmtNum } from "@/lib/presentation";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type MenuItem = {
  icon: string;
  label: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
  danger?: boolean;
};

export function MobileProfile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    dashboardApi.summary().then(setSummary).catch(() => undefined);
  }, []);

  async function handleLogout() {
    if (!window.confirm("确认退出登录吗？")) return;
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  const roleLabel = user?.is_super_admin ? "超管" : "成员";
  const sourceTotal = summary ? summary.methodology_sources + summary.expansion_sources : null;

  const stats = [
    { label: "资料总数", value: sourceTotal !== null ? fmtNum(sourceTotal) : "··", unit: "份", icon: "layers" },
    { label: "知识节点", value: summary ? fmtNum(summary.nodes) : "··", unit: "个", icon: "route" },
    { label: "关系边", value: summary ? fmtNum(summary.edges) : "··", unit: "条", icon: "link" },
    { label: "报告数", value: summary ? fmtNum(summary.reports) : "··", unit: "份", icon: "clipboard" },
  ];

  const primaryMenu: MenuItem[] = [
    { icon: "users", label: "个人资料", href: "/settings" },
    { icon: "bot", label: "我的会话", href: "/chat" },
    { icon: "file-bar-chart", label: "诊断报告", href: "/reports" },
  ];
  const secondaryMenu: MenuItem[] = [
    { icon: "pencil", label: "意见反馈", onClick: () => setFeedbackOpen(true) },
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent pb-[96px]">
      {/* 顶部条 */}
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <div className="min-w-0 flex-1 truncate text-center text-[16px] font-black text-ink">我的</div>
        <PendingTaskBell />
        <a href="/chat" className="flex h-9 w-9 items-center justify-center rounded-full text-[#172452] hover:text-brand" title="对话历史">
          <Icon name="history" className="h-5 w-5" />
        </a>
      </header>

      <div className="space-y-4 px-4 pt-1">
        {/* 个人资料卡 */}
        <a
          href="/settings"
          className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-[0_10px_24px_rgba(30,58,138,0.05)]"
        >
          <span className="relative shrink-0">
            <span className="block h-16 w-16 rounded-full bg-[radial-gradient(circle_at_50%_30%,#f8d5c2_0_18%,#233a70_19%_48%,#111827_49%)]" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white ring-2 ring-white">
              <Icon name="pencil" className="h-3 w-3" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[18px] font-black text-ink">{user?.display_name || "用户"}</span>
              <span className="shrink-0 rounded-md bg-[#f0edff] px-2 py-0.5 text-[11px] font-bold text-brand">{roleLabel}</span>
            </div>
            <div className="mt-1 truncate text-[12.5px] text-slate-500">让数据驱动决策，让智能创造价值。</div>
            <div className="mt-1 text-[11px] text-slate-400">加入时间：{fmtDate(user?.created_at ?? null)}</div>
          </div>
          <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-slate-300" />
        </a>

        {/* 统计卡 */}
        <div className="grid grid-cols-4 rounded-2xl border border-line bg-white py-4 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 text-center">
              <Icon name={s.icon} className="h-5 w-5 text-brand" />
              <div className="text-[11px] text-slate-400">{s.label}</div>
              <div className="text-ink">
                <span className="text-[17px] font-black">{s.value}</span>
                <span className="ml-0.5 text-[11px] text-slate-400">{s.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 菜单 */}
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
          <MenuGroup items={primaryMenu} />
          <div className="mx-4 border-t border-line" />
          <MenuGroup items={secondaryMenu} />
          <div className="mx-4 border-t border-line" />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
              <Icon name="logout" className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 text-[14px] font-bold text-rose-500">退出登录</span>
            <Icon name="chevron-right" className="h-5 w-5 text-rose-200" />
          </button>
        </div>

        {/* 页脚 */}
        <div className="py-3 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-400">
            <Icon name="boxes" className="h-4 w-4" />
            天机AI 商业决策智能体 v1.0
          </div>
          <div className="mt-1 text-[11px] text-slate-300">© 2024 IMC&IPM. 保留所有权利。</div>
        </div>
      </div>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <MobileTabBar />
    </main>
  );
}

function MenuGroup({ items }: { items: MenuItem[] }) {
  return (
    <div>
      {items.map((item) => {
        const inner = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4f1ff] text-brand">
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 text-[14px] font-bold text-[#172452]">{item.label}</span>
            {!!item.badge && item.badge > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                {item.badge}
              </span>
            )}
            <Icon name="chevron-right" className="h-5 w-5 text-slate-300" />
          </>
        );
        const cls = "flex w-full items-center gap-3 px-4 py-3.5 text-left";
        return item.href ? (
          <a key={item.label} href={item.href} className={cls}>
            {inner}
          </a>
        ) : (
          <button key={item.label} onClick={item.onClick} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
