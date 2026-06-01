"use client";

import { useEffect, useState } from "react";

import { Icon } from "./icon";
import { Card, CardHeader } from "./card";
import { cn } from "@/lib/utils";
import { quickActions } from "@/lib/data";
import { ApiError, RecentReport, dashboardApi } from "@/lib/api";
import { reportGrade } from "@/lib/presentation";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function MiddleCards() {
  return (
    <div className="grid grid-cols-2 gap-5">
      <RecentReportsCard />

      {/* 常用功能 */}
      <Card>
        <CardHeader title="常用功能" />
        <div className="grid grid-cols-4 gap-x-2 gap-y-5 px-4 pb-5 pt-4">
          {quickActions.map((a) => (
            <a
              key={a.label}
              href={a.href}
              className="flex flex-col items-center gap-2 rounded-xl py-1.5 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-indigo-50 to-violet-50 text-brand shadow-[inset_0_0_0_1px_rgba(91,75,255,0.04)]">
                <Icon name={a.icon} className="h-[18px] w-[18px]" />
              </div>
              <span className="text-[11px] text-gray-500">{a.label}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RecentReportsCard() {
  const [reports, setReports] = useState<RecentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .recentReports(6)
      .then((d) => !cancelled && setReports(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "加载失败"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader title="最近诊断报告" action="查看全部" />
      <div className="px-5 pb-4 pt-2">
        {loading && <p className="py-6 text-center text-[12px] text-gray-400">加载中…</p>}
        {error && !loading && <p className="py-6 text-center text-[12px] text-rose-500">{error}</p>}
        {!loading && !error && reports.length === 0 && (
          <p className="py-6 text-center text-[12px] text-gray-400">暂无诊断报告</p>
        )}
        {!loading &&
          !error &&
          reports.map((r) => {
            const grade = reportGrade(r.quality_score);
            return (
              <a
                key={r.id}
                href="/reports"
                className="flex items-center gap-3 border-b border-line/70 py-2.5 transition-colors last:border-0 hover:bg-gray-50/60"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-50">
                  <Icon name="file-text" className="h-3.5 w-3.5 text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-gray-700">{r.title}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{fmtTime(r.created_at)}</div>
                </div>
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium", grade.tone)}>
                  {grade.label}
                </span>
              </a>
            );
          })}
      </div>
    </Card>
  );
}
