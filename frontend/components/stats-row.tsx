import { Icon } from "./icon";
import { cn } from "@/lib/utils";
import { stats } from "@/lib/data";

export function StatsRow() {
  return (
    <div className="dashboard-card grid min-h-[118px] grid-cols-5 divide-x divide-line rounded-2xl">
      {stats.map((s) => (
        <div key={s.key} className="flex items-center gap-3.5 px-4 py-5 xl:px-5">
          <div className={cn("flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl", s.tint)}>
            <Icon name={s.icon} className={cn("h-5 w-5", s.iconColor)} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-slate-500">{s.label}</div>
            <div className="mt-0.5 text-ink">
              <span className="text-[23px] font-black leading-none tracking-[-0.02em]">{s.value}</span>
              <span className="ml-1 text-[12px] text-gray-400">{s.unit}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
              <span>较上月</span>
              <span
                className={cn(
                  "font-semibold",
                  s.trend === "up" ? "text-emerald-500" : "text-rose-500"
                )}
              >
                {s.trend === "up" ? "↑" : "↓"} {s.delta}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
