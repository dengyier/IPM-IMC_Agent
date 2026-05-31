import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("dashboard-card rounded-2xl", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  actionHref,
}: {
  title: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 pb-1 pt-4">
      <h3 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h3>
      {action && actionHref ? (
        <a
          href={actionHref}
          className="flex items-center gap-0.5 text-[12px] font-medium text-brand transition-colors hover:text-violet"
        >
          {action}
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </a>
      ) : action ? (
        <button className="flex items-center gap-0.5 text-[12px] font-medium text-brand transition-colors hover:text-violet">
          {action}
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
