"use client";

import { useRef } from "react";
import { Icon } from "./icon";
import { suggestionChips } from "@/lib/data";
import { useAssistant } from "./assistant-context";

export function SearchHero() {
  const { input, loading, setInput, sendQuestion } = useAssistant();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function fillDraft(question: string) {
    setInput(question);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendQuestion();
        }}
        className="dashboard-card flex h-[58px] items-center gap-3 rounded-2xl px-5"
      >
        <Icon name="search" className="h-5 w-5 text-[#65719a]" />
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-[#8c96b8]"
          placeholder="输入企业诉求，例如：客户复购低、渠道成本高，如何调整价值主张？"
        />
        <button
          type="submit"
          disabled={loading}
          className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-soft transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name={loading ? "refresh" : "send"} className="h-[18px] w-[18px]" />
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <span className="text-[13px] text-slate-500">或尝试以下问题</span>
        {suggestionChips.map((chip) => (
          <button
            key={chip}
            disabled={loading}
            onClick={() => fillDraft(chip)}
            className="rounded-full border border-[#dfe5ff] bg-[#f4f2ff] px-3.5 py-1.5 text-[12.5px] font-medium text-brand transition-colors hover:border-brand hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
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
