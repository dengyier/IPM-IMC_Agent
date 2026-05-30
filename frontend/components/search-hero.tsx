import { Icon } from "./icon";
import { suggestionChips } from "@/lib/data";

export function SearchHero() {
  return (
    <div>
      <div className="dashboard-card flex h-[58px] items-center gap-3 rounded-2xl px-5">
        <Icon name="search" className="h-5 w-5 text-[#65719a]" />
        <input
          className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-[#8c96b8]"
          placeholder="你想了解或分析什么？可直接向我提问..."
        />
        <button className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-soft transition-transform hover:scale-105">
          <Icon name="send" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] text-slate-500">或尝试以下问题</span>
        {suggestionChips.map((chip) => (
          <button
            key={chip}
            className="rounded-full border border-[#dfe5ff] bg-[#f4f2ff] px-3.5 py-1.5 text-[12.5px] font-medium text-brand transition-colors hover:border-brand hover:bg-white"
          >
            <span className="mr-1.5 inline-block h-3 w-3 rounded-[4px] border border-brand/50 align-[-1px]" />
            {chip}
          </button>
        ))}
        <button className="flex items-center gap-1 rounded-full border border-line bg-white px-3.5 py-1.5 text-[12.5px] text-slate-500 transition-colors hover:border-brand hover:text-brand">
          更多问题
          <Icon name="chevron-down" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
