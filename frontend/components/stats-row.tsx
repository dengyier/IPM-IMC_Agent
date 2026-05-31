"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";
import { dashboardApi, type DashboardSummary } from "@/lib/api";
import { fmtNum } from "@/lib/presentation";

// 卡片的展示配置（样式留前端），value 由真实 summary 映射
type CardCfg = {
  key: string;
  label: string;
  unit: string;
  icon: string;
  tint: string;
  iconColor: string;
  pick: (s: DashboardSummary) => number;
};

const CARDS: CardCfg[] = [
  {
    key: "documents",
    label: "资料总数",
    unit: "份",
    icon: "folder",
    tint: "bg-indigo-50",
    iconColor: "text-indigo-500",
    pick: (s) => s.methodology_sources + s.expansion_sources,
  },
  {
    key: "nodes",
    label: "知识节点总数",
    unit: "个",
    icon: "share",
    tint: "bg-rose-50",
    iconColor: "text-rose-500",
    pick: (s) => s.nodes,
  },
  {
    key: "edges",
    label: "关系边总数",
    unit: "条",
    icon: "git-merge",
    tint: "bg-violet-50",
    iconColor: "text-violet-500",
    pick: (s) => s.edges,
  },
  {
    key: "reports",
    label: "诊断报告总数",
    unit: "份",
    icon: "file",
    tint: "bg-blue-50",
    iconColor: "text-blue-500",
    pick: (s) => s.reports,
  },
  {
    key: "reviews",
    label: "待审核任务",
    unit: "条",
    icon: "clipboard",
    tint: "bg-orange-50",
    iconColor: "text-orange-500",
    pick: (s) => s.pending_reviews,
  },
];

export function StatsRow() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dashboardApi
      .summary()
      .then(setSummary)
      .catch((e) => setError(e.message || "加载失败"));
  }, []);

  return (
    <div className="dashboard-card grid min-h-[118px] grid-cols-5 divide-x divide-line rounded-2xl">
      {CARDS.map((c) => (
        <div key={c.key} className="flex items-center gap-3.5 px-4 py-5 xl:px-5">
          <div className={cn("flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl", c.tint)}>
            <Icon name={c.icon} className={cn("h-5 w-5", c.iconColor)} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-slate-500">{c.label}</div>
            <div className="mt-0.5 text-ink">
              <span className="text-[23px] font-black leading-none tracking-[-0.02em]">
                {error ? "—" : summary ? fmtNum(c.pick(summary)) : "··"}
              </span>
              <span className="ml-1 text-[12px] text-gray-400">{c.unit}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
              <span>实时统计</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
