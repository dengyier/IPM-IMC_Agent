"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-context";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

type Placement = "bottom-end" | "top-start";

export function UserAccountMenu({
  className,
  avatarClassName,
  chevronClassName,
  placement = "bottom-end",
}: {
  className?: string;
  avatarClassName?: string;
  chevronClassName?: string;
  placement?: Placement;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    const redirect = pathname && pathname !== "/login" ? `?redirect=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${redirect}`);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-3 rounded-2xl py-1 pl-2 pr-2 text-left transition-colors hover:bg-white",
          className
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title="账户信息"
      >
        <div
          className={cn(
            "h-10 w-10 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white",
            avatarClassName
          )}
        />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-ink">{user?.display_name || "未登录"}</div>
          <div className="text-[11px] text-gray-400">{user?.role || "访客"}</div>
        </div>
        <Icon
          name="chevron-down"
          className={cn("h-4 w-4 text-gray-300 transition-transform", open && "rotate-180", chevronClassName)}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-50 w-40 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[0_16px_40px_rgba(30,41,59,0.12)]",
            placement === "bottom-end" && "right-0 top-[calc(100%+8px)]",
            placement === "top-start" && "bottom-[calc(100%+8px)] left-3"
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-semibold text-rose-500 transition-colors hover:bg-rose-50"
          >
            <Icon name="logout" className="h-4 w-4" />
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}
