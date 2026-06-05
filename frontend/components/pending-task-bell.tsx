"use client";

import { useEffect, useState } from "react";

import { dashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

export function PendingTaskBell({ className }: { className?: string }) {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .summary()
      .then((summary) => {
        if (!cancelled) setPendingCount(summary.pending_reviews);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      type="button"
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] transition-colors hover:bg-white hover:text-brand",
        className
      )}
      title={pendingCount === null ? "待审核任务" : `待审核任务：${pendingCount} 条`}
    >
      <Icon name="bell" className="h-[19px] w-[19px]" />
      {pendingCount !== null ? (
        <span className="absolute right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      ) : null}
    </button>
  );
}
