"use client";

import { usePathname } from "next/navigation";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const TABS: { label: string; icon: string; href: string }[] = [
  { label: "首页", icon: "home", href: "/" },
  { label: "对话", icon: "bot", href: "/chat" },
  { label: "诊断", icon: "activity", href: "/canvas-diagnosis" },
  { label: "我的", icon: "users", href: "/me" },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// 移动端底部固定 Tab 栏（桌面端隐藏）。
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto flex max-w-[640px] items-stretch">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <a
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-brand" : "text-slate-400"
              )}
            >
              <Icon name={tab.icon} className="h-[22px] w-[22px]" />
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
