import { Icon } from "./icon";
import { Card, CardHeader } from "./card";
import { cn } from "@/lib/utils";
import { assistantSkills, assistantPrompts, todoTasks, recentVisits } from "@/lib/data";

export function RightPanel() {
  return (
    <div className="flex w-[320px] shrink-0 flex-col gap-5 xl:w-[332px]">
      <AiAssistant />
      <TodoTasks />
      <RecentVisits />
    </div>
  );
}

function AiAssistant() {
  return (
    <Card>
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
        <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg shadow-soft">
          <Icon name="boxes" className="h-4 w-4 text-white" />
        </div>
        <span className="text-[14px] font-bold text-ink">IMC&IPM 智能助手</span>
        <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet">
          AI
        </span>
        <button className="ml-auto text-gray-300 transition-colors hover:text-gray-500">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="px-5 pb-5">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
          你好，张晓明 <span>👋</span>
        </div>
        <p className="mt-2 text-[13px] text-slate-600">我可以帮你完成以下工作：</p>
        <ul className="mt-3 space-y-2">
          {assistantSkills.map((s) => (
            <li key={s} className="flex items-center gap-2 text-[12.5px] text-gray-600">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {s}
            </li>
          ))}
        </ul>
        <div className="mt-5 space-y-2">
          {assistantPrompts.map((p) => (
            <button
              key={p.label}
              className="flex w-full items-center gap-2 rounded-lg border border-[#e2e1ff] bg-[#f3f1ff] px-3 py-2.5 text-left text-[12.5px] font-medium text-brand transition-colors hover:border-brand hover:bg-white"
            >
              <Icon name={p.icon} className="h-4 w-4 shrink-0 text-brand" />
              <span className="truncate">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function TodoTasks() {
  return (
    <Card>
      <CardHeader title="待办任务" action="查看全部" />
      <div className="px-5 pb-4 pt-1">
        {todoTasks.map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0"
          >
            <Icon name={t.icon} className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="text-[12.5px] text-gray-600">{t.label}</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-gray-400">{t.time}</span>
              <span className={cn("h-2 w-2 rounded-full", t.dot)} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecentVisits() {
  return (
    <Card>
      <CardHeader title="最近访问" action="查看全部" />
      <div className="px-5 pb-4 pt-1">
        {recentVisits.map((v) => (
          <div
            key={v.label}
            className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0"
          >
            <Icon name={v.icon} className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="truncate text-[12.5px] text-gray-600">{v.label}</span>
            <span className="ml-auto shrink-0 text-[11px] text-gray-400">{v.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
