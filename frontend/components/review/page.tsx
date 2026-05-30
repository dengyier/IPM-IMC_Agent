import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const categories = [
  { label: "全部任务", count: 23, active: true },
  { label: "新知识节点审核", count: 6 },
  { label: "笔记合并审核", count: 8 },
  { label: "版本升级审核", count: 3 },
  { label: "差异观点审核", count: 2 },
  { label: "案例补充审核", count: 4 },
];

const filters = [
  { label: "任务状态", value: "待审核" },
  { label: "优先级", value: "全部" },
  { label: "来源类型", value: "全部" },
  { label: "关联节点", value: "全部" },
];

type Priority = "高" | "中" | "低";

const priorityTone: Record<Priority, string> = {
  高: "bg-rose-50 text-rose-500",
  中: "bg-orange-50 text-orange-500",
  低: "bg-emerald-50 text-emerald-600",
};

const priorityDot: Record<Priority, string> = {
  高: "bg-rose-500",
  中: "bg-orange-400",
  低: "bg-emerald-500",
};

interface Task {
  type: string;
  icon: string;
  iconTone: string;
  title: string;
  relationLabel: string;
  relation: string;
  author: string;
  time: string;
  priority: Priority;
  active?: boolean;
}

const tasks: Task[] = [
  {
    type: "同学笔记合并审核",
    icon: "send",
    iconTone: "bg-[#f0edff] text-brand",
    title: "关于“价值主张”的补充观点",
    relationLabel: "关联节点",
    relation: "价值主张",
    author: "李同学",
    time: "10 分钟前",
    priority: "高",
    active: true,
  },
  {
    type: "新知识节点审核",
    icon: "file-text",
    iconTone: "bg-emerald-50 text-emerald-600",
    title: "数字化转型中的组织敏捷性",
    relationLabel: "关联分类",
    relation: "组织管理",
    author: "王同学",
    time: "25 分钟前",
    priority: "中",
  },
  {
    type: "案例补充审核",
    icon: "check-circle",
    iconTone: "bg-green-50 text-green-600",
    title: "瑞幸咖啡早期验证案例补充",
    relationLabel: "关联节点",
    relation: "最小可行验证",
    author: "陈同学",
    time: "1 小时前",
    priority: "低",
  },
  {
    type: "版本升级审核",
    icon: "refresh",
    iconTone: "bg-blue-50 text-blue-500",
    title: "客户细分 v1.2 升级申请",
    relationLabel: "当前版本",
    relation: "v1.1 → 申请版本：v1.2",
    author: "系统",
    time: "2 小时前",
    priority: "中",
  },
  {
    type: "差异观点审核",
    icon: "alert",
    iconTone: "bg-rose-50 text-rose-500",
    title: "关于“收入来源多元化”的不同观点",
    relationLabel: "关联节点",
    relation: "收入来源",
    author: "赵同学",
    time: "3 小时前",
    priority: "高",
  },
];

const detailTabs = ["原始内容", "AI 提取结果", "建议合并位置", "影响分析", "历史关联", "版本对比"];

const detailMeta = [
  { label: "提交人", value: "李同学" },
  { label: "所属课程", value: "商业画布与战略设计" },
  { label: "来源", value: "同学课堂笔记" },
  { label: "字数", value: "820" },
];

const noteParagraphs = [
  "在今天的课堂讨论中，我对于价值主张有了新的理解。老师提到价值主张是“为客户创造独特价值”。但我在思考，如果一个产品在早期阶段，可能并不能提供非常独特的价值，而是解决了客户的某个小痛点，那么这个时候是否也可以构成价值主张？",
  "例如我们小组调研的一个案例，他们最开始的产品只是解决了用户操作效率提升 10% 的问题，但客户仍然愿意付费，因为它帮助客户省了时间成本。",
  "我认为价值主张不一定要在一开始就非常“独特”，而是要“对客户重要”，并且能够被客户感知到价值。",
  "这个观点和老师讲的“从客户视角出发”是一致的，只是我把它理解为可以从小价值切入。",
];

const assistantPoints = [
  "提出了价值主张的渐进式观点",
  "强调从小价值切入的合理性",
  "与课程“客户视角”理念一致",
  "建议作为补充观点合并",
];

const assistantPrompts = ["总结核心观点", "查找相似历史观点", "评估与老师观点的关系", "生成合并后的内容预览"];

const taskInfo = [
  { label: "任务 ID", value: "REV-20250602-001" },
  { label: "任务类型", value: "同学笔记合并审核" },
  { label: "优先级", value: "高", priority: true },
  { label: "关联知识节点", value: "价值主张 (ID: KN-001)", accent: true },
  { label: "影响范围", value: "1 个节点" },
  { label: "预计影响版本", value: "v1.1 → v1.2" },
  { label: "历史提交记录", value: "查看 (2)", link: true },
];

export function ReviewPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <ReviewHeader />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pb-8 pt-5">
          <CategoryTabs />
          <FilterBar />
          <div className="mt-5 grid min-h-0 flex-1 gap-5 xl:grid-cols-[380px_1fr]">
            <TaskList />
            <TaskDetail />
          </div>
        </section>
        <ReviewAssistant />
      </div>
    </main>
  );
}

function ReviewHeader() {
  return (
    <header className="flex items-center justify-between gap-6 px-8 pt-6">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">人工审核台</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          严格把控知识质量，确保每个知识节点的准确性、完整性和价值
        </p>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex h-10 w-[300px] items-center gap-2.5 rounded-xl border border-line bg-white px-4">
          <Icon name="search" className="h-4 w-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="搜索任务标题、内容、提交人..."
          />
        </div>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
          <Icon name="bell" className="h-[19px] w-[19px]" />
          <span className="absolute right-0.5 top-0 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
            8
          </span>
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
          <Icon name="help-circle" className="h-[19px] w-[19px]" />
        </button>
        <div className="h-9 w-9 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-ink">张晓明</div>
          <div className="text-[11px] text-slate-400">管理员</div>
        </div>
        <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
      </div>
    </header>
  );
}

function CategoryTabs() {
  return (
    <Card className="mt-6 flex flex-wrap items-center gap-3 px-5 py-4">
      {categories.map((cat) => (
        <button
          key={cat.label}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold transition-colors",
            cat.active ? "bg-[#f0edff] text-brand" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          {cat.label}
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
              cat.active ? "bg-white text-brand" : "bg-slate-100 text-slate-400"
            )}
          >
            {cat.count}
          </span>
        </button>
      ))}
    </Card>
  );
}

function FilterBar() {
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-3 px-5 py-3.5">
      {filters.map((f) => (
        <button
          key={f.label}
          className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[12.5px] font-semibold text-[#172452]"
        >
          <span className="text-slate-400">{f.label}：</span>
          {f.value}
          <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
        </button>
      ))}
      <button className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold text-brand">
        <Icon name="refresh" className="h-3.5 w-3.5" />
        重置
      </button>
      <button className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[12.5px] font-semibold text-[#172452]">
        <span className="text-slate-400">排序：</span>
        提交时间（最新）
        <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
      </button>
    </Card>
  );
}

function TaskList() {
  return (
    <Card className="flex flex-col px-4 py-4">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-[15px] font-black text-ink">待审核任务（23）</h2>
        <button className="text-[12px] font-bold text-slate-400 hover:text-brand">全选</button>
      </div>
      <div className="mt-3 space-y-3">
        {tasks.map((task) => (
          <TaskCard key={task.title} task={task} />
        ))}
      </div>
      <Pagination />
    </Card>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <button
      className={cn(
        "flex w-full gap-3 rounded-xl border p-3.5 text-left transition-all",
        task.active
          ? "border-brand/60 bg-[#f8f7ff] shadow-[0_10px_28px_rgba(91,75,255,0.1)] ring-1 ring-brand/30"
          : "border-line bg-white hover:border-brand/40 hover:bg-[#fbfbff]"
      )}
    >
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", task.iconTone)}>
        <Icon name={task.icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-[13px] font-bold", task.active ? "text-brand" : "text-[#172452]")}>{task.type}</span>
          <span className="ml-auto whitespace-nowrap text-[11px] font-medium text-slate-400">{task.time}</span>
          <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", priorityTone[task.priority])}>
            {task.priority}
          </span>
        </div>
        <div className="mt-1.5 truncate text-[14px] font-black text-ink">{task.title}</div>
        <div className="mt-1.5 text-[12px] font-medium text-slate-500">
          {task.relationLabel}：{task.relation}
        </div>
        <div className="mt-1 text-[12px] font-medium text-slate-400">提交人：{task.author}</div>
      </div>
    </button>
  );
}

function Pagination() {
  const pages = [1, 2, 3, 4, 5];
  return (
    <div className="mt-5 flex items-center justify-center gap-2">
      <PageButton>
        <Icon name="chevron-left" className="h-4 w-4" />
      </PageButton>
      {pages.map((p) => (
        <PageButton key={p} active={p === 1}>
          {p}
        </PageButton>
      ))}
      <PageButton>
        <Icon name="chevron-right" className="h-4 w-4" />
      </PageButton>
    </div>
  );
}

function PageButton({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[12.5px] font-bold transition-colors",
        active ? "border-brand bg-[#f0edff] text-brand" : "border-line bg-white text-slate-500 hover:text-brand"
      )}
    >
      {children}
    </button>
  );
}

function TaskDetail() {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-line px-7 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-violet-100 px-2.5 py-1 text-[12px] font-bold text-violet">笔记合并审核</span>
          <span className="rounded-md bg-orange-50 px-2.5 py-1 text-[12px] font-bold text-orange-500">待审核</span>
        </div>
        <h2 className="text-[20px] font-black text-ink">关于“价值主张”的补充观点</h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-medium text-slate-500">
          {detailMeta.map((m) => (
            <span key={m.label}>
              {m.label}：<span className="text-[#172452]">{m.value}</span>
            </span>
          ))}
          <span className="ml-auto">
            提交时间：<span className="text-[#172452]">2025-06-02 14:30</span>
          </span>
        </div>
      </div>

      <div className="flex gap-7 border-b border-line px-7">
        {detailTabs.map((tab, index) => (
          <button
            key={tab}
            className={cn(
              "relative flex items-center gap-2 py-4 text-[13px] font-bold transition-colors",
              index === 0 ? "text-brand" : "text-slate-500 hover:text-[#172452]"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black",
                index === 0 ? "brand-gradient text-white" : "bg-slate-100 text-slate-400"
              )}
            >
              {index + 1}
            </span>
            {tab}
            {index === 0 && <span className="absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        <h3 className="text-[15px] font-black text-ink">原始笔记内容</h3>
        <div className="mt-4 space-y-4 rounded-2xl bg-[#f8faff] px-6 py-5 text-[13px] font-medium leading-7 text-[#3b4a6b]">
          {noteParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <button className="flex w-full items-center justify-center gap-1 pt-1 text-[12px] font-bold text-brand">
            收起
            <Icon name="chevron-down" className="h-3.5 w-3.5 rotate-180" />
          </button>
        </div>

        <h3 className="mt-6 text-[15px] font-black text-ink">附件（1）</h3>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-[12px] font-black text-white">
            W
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold text-[#172452]">小组调研-早期产品价值验证案例.docx</div>
            <div className="text-[11px] text-slate-400">2.4 MB</div>
          </div>
          <button className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-line text-slate-400 hover:text-brand">
            <Icon name="download" className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-4">
          <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.28)]">
            <Icon name="check-circle" className="h-[18px] w-[18px]" />
            通过并合并
          </button>
          <button className="brand-gradient flex h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white shadow-soft">
            <Icon name="pencil" className="h-[18px] w-[18px]" />
            修改后通过
          </button>
          <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-500 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(244,63,94,0.26)]">
            <Icon name="x-circle" className="h-[18px] w-[18px]" />
            拒绝
          </button>
        </div>

        <div className="relative mt-4">
          <textarea
            rows={3}
            className="w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-[13px] font-medium text-[#172452] outline-none placeholder:text-slate-400"
            placeholder="添加审核意见（选填），将作为记录保存..."
          />
          <span className="absolute bottom-3 right-4 text-[11px] text-slate-400">0/500</span>
        </div>

        <label className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded border border-line bg-white" />
          提交后继续下一条
        </label>
      </div>
    </Card>
  );
}

function ReviewAssistant() {
  return (
    <aside className="flex w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">IMC&IPM 智能助手</div>
            <div className="text-[11px] text-slate-400">基于课程方法论的决策助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[14px] font-bold text-ink">
          <span>👋</span> 你好，张晓明
        </p>
        <p className="mt-3 text-[13px] font-semibold leading-6 text-[#172452]">我为你分析了这条笔记，发现以下要点：</p>
        <ul className="mt-3 space-y-2.5 text-[12.5px] font-semibold leading-6 text-slate-600">
          {assistantPoints.map((point) => (
            <li key={point} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {point}
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[13px] font-bold text-[#172452]">你需要我帮你做什么？</p>
        <div className="mt-3 space-y-2.5">
          {assistantPrompts.map((prompt) => (
            <button
              key={prompt}
              className="flex w-full items-center rounded-lg bg-[#f3f1ff] px-4 py-3 text-left text-[13px] font-bold text-brand transition-colors hover:bg-[#ebe7ff]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <h2 className="text-[16px] font-black text-ink">任务信息</h2>
        <div className="mt-4 space-y-3.5">
          {taskInfo.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-slate-400">{row.label}</span>
              {row.priority ? (
                <span className="flex items-center gap-1.5 font-bold text-rose-500">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  高
                </span>
              ) : row.link ? (
                <button className="font-bold text-brand">{row.value}</button>
              ) : (
                <span className={cn("font-bold", row.accent ? "text-brand" : "text-[#172452]")}>{row.value}</span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}
