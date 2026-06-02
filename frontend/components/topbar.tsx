"use client";

import { Icon } from "./icon";
import { useAuth } from "./auth-context";

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-[23px] font-black tracking-[-0.02em] text-ink">
          你好，{user?.display_name || "用户"} <span className="text-[20px]">👋</span>
        </h1>
        <p className="mt-1.5 text-[13px] text-slate-500">欢迎使用 IMC&IPM 商业决策智能体</p>
      </div>

      <div className="flex items-center gap-5">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] transition-colors hover:bg-white hover:text-brand">
          <Icon name="bell" className="h-[19px] w-[19px]" />
          <span className="absolute right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            6
          </span>
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#172452] transition-colors hover:bg-white hover:text-brand">
          <Icon name="help-circle" className="h-[19px] w-[19px]" />
        </button>
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-3 rounded-2xl py-1 pl-2 pr-2 text-left transition-colors hover:bg-white"
          title="退出登录"
        >
          <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white" />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-ink">{user?.display_name || "未登录"}</div>
            <div className="text-[11px] text-gray-400">{user?.role || "访客"}</div>
          </div>
          <Icon name="chevron-down" className="h-4 w-4 text-gray-300" />
        </button>
      </div>
    </div>
  );
}
