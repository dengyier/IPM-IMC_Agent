"use client";

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth-context";
import { MobileTabBar } from "@/components/mobile/tab-bar";
import {
  AssistantConversationRecord,
  DashboardSummary,
  assistantApi,
  dashboardApi,
} from "@/lib/api";
import { navItems } from "@/lib/data";
import { canAccessNavItem } from "@/lib/authz";
import { fmtNum } from "@/lib/presentation";

function fmtRelative(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

const FEATURE_KEYS = ["canvas", "reports"] as const;
const FEATURE_DESC: Record<string, string> = {
  canvas: "全维度诊断与洞察",
  reports: "查看与管理报告",
};

export function MobileHome() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [conversations, setConversations] = useState<AssistantConversationRecord[]>([]);

  useEffect(() => {
    dashboardApi.summary().then(setSummary).catch(() => undefined);
    assistantApi.conversations().then(setConversations).catch(() => undefined);
  }, []);

  const features = useMemo(
    () =>
      FEATURE_KEYS.map((key) => navItems.find((n) => n.key === key))
        .filter((item): item is NonNullable<typeof item> => !!item && canAccessNavItem(user, item)),
    [user]
  );

  const lastConversation = useMemo(
    () => conversations.find((c) => c.message_count > 0) ?? null,
    [conversations]
  );

  const sourceTotal = summary
    ? summary.methodology_sources + summary.expansion_sources
    : null;

  const assetHref = user?.is_super_admin ? "/knowledge-graph" : "/data-dashboard";

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent pb-[88px]">
      {/* 顶部条（左侧给 Sidebar 汉堡按钮留位） */}
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <div className="min-w-0 flex-1 truncate text-center text-[15px] font-black text-ink">
          经营工作台
        </div>
        <a
          href="/chat"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#172452] hover:text-brand"
          title="新建会话"
        >
          <Icon name="edit" className="h-5 w-5" />
        </a>
        <a
          href="/chat"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#172452] hover:text-brand"
          title="对话历史"
        >
          <Icon name="history" className="h-5 w-5" />
        </a>
      </header>

      <div className="space-y-5 px-4 pt-2">
        {/* 问候 */}
        <div>
          <h1 className="flex items-center gap-2 text-[24px] font-black tracking-[-0.02em] text-ink">
            你好，{user?.display_name || "用户"} <span className="text-[20px]">👋</span>
          </h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            查看项目验证、诊断报告与知识资产进展；需要深聊时进入 AI 经营访谈。
          </p>
        </div>

        {/* 继续对话 */}
        {lastConversation && (
          <a
            href="/chat"
            className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-[0_10px_28px_rgba(30,58,138,0.05)]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f0edff] text-brand">
              <Icon name="bot" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold text-brand">继续对话</div>
              <div className="mt-0.5 truncate text-[14px] font-bold text-ink">
                {lastConversation.title}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                更新于 {fmtRelative(lastConversation.updated_at)}
              </div>
            </div>
            <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-slate-300" />
          </a>
        )}

        {/* 功能宫格 2×2 */}
        <div className="grid grid-cols-2 gap-3">
          {features.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className="rounded-2xl border border-line bg-white p-4 shadow-[0_10px_28px_rgba(30,58,138,0.05)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4f1ff] text-brand">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <div className="mt-3 text-[14px] font-bold text-ink">{item.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{FEATURE_DESC[item.key]}</div>
            </a>
          ))}
        </div>

        {/* 知识资产 - 仅超级管理员可见 */}
        {user?.is_super_admin && (
          <div className="overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-b from-indigo-50 to-white p-4 shadow-card">
            <div className="text-[14px] font-bold text-brand">知识资产沉淀中</div>
            <p className="mt-1 text-[11px] text-slate-400">每一次学习都会沉淀为可复用的知识资产</p>
            <div className="mt-4 grid grid-cols-2 gap-y-4">
              <AssetStat label="资料总数" value={sourceTotal !== null ? fmtNum(sourceTotal) : "··"} unit="份" />
              <AssetStat label="知识节点总数" value={summary ? fmtNum(summary.nodes) : "··"} unit="个" />
              <AssetStat label="关系边总数" value={summary ? fmtNum(summary.edges) : "··"} unit="条" />
              <AssetStat label="诊断报告总数" value={summary ? fmtNum(summary.reports) : "··"} unit="份" />
            </div>
            <a
              href={assetHref}
              className="mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-100 bg-white/85 text-[13px] font-bold text-brand"
            >
              <Icon name="layers" className="h-4 w-4" />
              查看知识资产
              <Icon name="chevron-right" className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

      </div>

      <MobileTabBar />
    </main>
  );
}

function AssetStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-ink">
        <span className="text-[20px] font-black tracking-[-0.02em]">{value}</span>
        <span className="ml-1 text-[11px] text-slate-400">{unit}</span>
      </div>
    </div>
  );
}
