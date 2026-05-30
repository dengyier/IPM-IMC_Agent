import { Icon } from "./icon";
import { Card, CardHeader } from "./card";
import { cn } from "@/lib/utils";
import { pendingItems, recentReports, quickActions } from "@/lib/data";

const gradeStyle: Record<string, string> = {
  优秀: "bg-emerald-50 text-emerald-600",
  良好: "bg-blue-50 text-blue-600",
  中等: "bg-orange-50 text-orange-500",
};

export function MiddleCards() {
  return (
    <div className="grid grid-cols-3 gap-5">
      {/* 待处理事项 */}
      <Card>
        <CardHeader title="待处理事项" />
        <div className="px-5 pb-4 pt-2">
          {pendingItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 border-b border-line/70 py-3.5 last:border-0"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f5ff]">
                <Icon name={item.icon} className="h-4 w-4 text-brand" />
              </div>
              <span className="text-[13px] text-gray-600">{item.label}</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[13px] font-bold text-ink">{item.count}</span>
                <span className="text-[12px] text-gray-400">{item.unit}</span>
                <span className={cn("h-2 w-2 rounded-full", item.dot)} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 最近诊断报告 */}
      <Card>
        <CardHeader title="最近诊断报告" action="查看全部" />
        <div className="px-5 pb-4 pt-2">
          {recentReports.map((r) => (
            <div
              key={r.title}
              className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-50">
                <Icon name="file-text" className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-gray-700">{r.title}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">{r.time}</div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                  gradeStyle[r.grade]
                )}
              >
                {r.grade}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* 常用功能 */}
      <Card>
        <CardHeader title="常用功能" />
        <div className="grid grid-cols-4 gap-x-2 gap-y-5 px-4 pb-5 pt-4">
          {quickActions.map((a) => (
            <button
              key={a.label}
              className="flex flex-col items-center gap-2 rounded-xl py-1.5 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-indigo-50 to-violet-50 text-brand shadow-[inset_0_0_0_1px_rgba(91,75,255,0.04)]">
                <Icon name={a.icon} className="h-[18px] w-[18px]" />
              </div>
              <span className="text-[11px] text-gray-500">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
