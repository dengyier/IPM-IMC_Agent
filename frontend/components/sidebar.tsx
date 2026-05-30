import { Icon } from "./icon";
import { cn } from "@/lib/utils";
import { navItems } from "@/lib/data";

export function Sidebar({ activeKey = "home" }: { activeKey?: string }) {
  return (
    <aside className="flex h-screen w-[212px] shrink-0 flex-col border-r border-line bg-white/92 shadow-[10px_0_38px_rgba(30,58,138,0.035)] backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-[12px] shadow-soft ring-4 ring-indigo-50">
          <Icon name="boxes" className="h-5 w-5 text-white" strokeWidth={1.9} />
        </div>
        <div className="leading-tight">
          <div className="text-[15.5px] font-black tracking-tight text-ink">IMC&IPM</div>
          <div className="mt-0.5 text-[12px] font-semibold text-ink/85">商业决策智能体</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-0 flex flex-col gap-1 px-3">
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3.5 py-3 text-[13.5px] transition-all",
              item.key === activeKey
                ? "bg-[#f0edff] font-semibold text-brand shadow-[inset_0_0_0_1px_rgba(91,75,255,0.06)]"
                : "text-[#1c2a54] hover:bg-gray-50 hover:text-brand"
            )}
          >
            <Icon name={item.icon} className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Asset card */}
      <div className="mx-3 mt-6 overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-b from-indigo-50 to-white p-4 shadow-card">
        <div className="text-[13px] font-bold text-brand">知识资产沉淀中</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          每一次学习都会沉淀为可复用的知识资产
        </p>
        <div className="mt-4 space-y-3">
          <AssetStat label="知识节点总数" value="12,586" unit="个" />
          <AssetStat label="资料总数" value="36,589" unit="份" />
          <AssetStat label="诊断报告总数" value="1,248" unit="份" />
        </div>
        <div className="mt-2 flex justify-center pb-1 pt-1">
          <div className="isometric-blocks">
            <span className="left-[16px] top-[70px] h-[22px] w-[104px] rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500" />
            <span className="left-[34px] top-[52px] h-[28px] w-[34px] rounded-lg bg-gradient-to-br from-[#4c43df] to-[#7f6bff]" />
            <span className="left-[73px] top-[34px] h-[48px] w-[34px] rounded-lg bg-gradient-to-br from-[#7d66ff] to-[#b49aff]" />
            <span className="left-[88px] top-[58px] h-[25px] w-[18px] rounded-md bg-white/40" />
            <span className="left-[19px] top-[83px] h-[12px] w-[76px] rounded-lg bg-gradient-to-r from-blue-500 to-violet-400 opacity-70" />
          </div>
        </div>
      </div>

      {/* User */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-4 py-4">
        <div className="h-9 w-9 overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-slate-50" />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-ink">张晓明</div>
          <div className="text-[11px] text-gray-400">管理员</div>
        </div>
        <Icon name="chevron-down" className="ml-auto h-4 w-4 text-gray-300" />
      </div>
    </aside>
  );
}

function AssetStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-ink">
        <span className="text-[18px] font-black">{value}</span>
        <span className="ml-1 text-[11px] text-slate-400">{unit}</span>
      </div>
    </div>
  );
}
