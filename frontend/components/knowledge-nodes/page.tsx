import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  knowledgeAssistantPrompts,
  knowledgeCategories,
  knowledgeHistory,
  knowledgeNodes,
} from "@/lib/data";

const filters = ["节点状态：全部", "来源类型：全部", "适用场景：全部", "版本：全部"];

const graphLinks = [
  ["客户细分", "影响", "渠道通路"],
  ["渠道通路", "关联", "价值主张"],
  ["价值主张", "支撑", "客户关系"],
  ["客户关系", "子项", "收入来源"],
  ["核心资源", "合作", "关键活动"],
  ["关键活动", "产生", "价值主张"],
  ["价值主张", "合作", "重要伙伴"],
  ["重要伙伴", "合作", "成本结构"],
];

export function KnowledgeNodesPage() {
  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <KnowledgeHeader />
        <KnowledgeSearch />
        <CategoryTabs />
        <FilterRow />
        <NodeGrid />
        <KnowledgeGraphMini />
      </section>
      <KnowledgeAssistant />
    </main>
  );
}

function KnowledgeHeader() {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-black tracking-[-0.03em] text-ink">知识节点库</h1>
          <span className="rounded-full bg-[#f0edff] px-3 py-1 text-[12px] font-bold text-brand">
            共 368 个节点
          </span>
        </div>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          基于课程方法论、课堂案例和同学经验沉淀的结构化商业知识资产
        </p>
      </div>
      <div className="dashboard-card flex h-11 w-[300px] items-center gap-3 rounded-xl px-4">
        <span className="text-[13px] font-bold text-slate-400">⌘ K</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          placeholder="快速搜索或输入指令..."
        />
      </div>
      <TopActions />
    </header>
  );
}

function TopActions() {
  return (
    <div className="flex shrink-0 items-center gap-5">
      <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
        <Icon name="bell" className="h-[19px] w-[19px]" />
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
          8
        </span>
      </button>
      <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white" />
      <div className="leading-tight">
        <div className="text-[13px] font-bold text-ink">张晓明</div>
        <div className="text-[11px] text-slate-400">管理员</div>
      </div>
      <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
    </div>
  );
}

function KnowledgeSearch() {
  return (
    <div className="mt-7 flex gap-4">
      <div className="dashboard-card flex h-[58px] min-w-0 flex-1 items-center gap-3 rounded-2xl px-5">
        <Icon name="search" className="h-5 w-5 text-[#65719a]" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#8c96b8]"
          placeholder="搜索知识节点，例如：价值主张、客户细分、最小可行验证..."
        />
      </div>
      <button className="dashboard-card flex h-[58px] items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-[#172452]">
        <Icon name="filter" className="h-4 w-4" />
        高级筛选
      </button>
      <button className="brand-gradient flex h-[58px] items-center gap-2 rounded-xl px-6 text-[14px] font-bold text-white shadow-soft">
        <Icon name="plus" className="h-4 w-4" />
        新建节点
      </button>
    </div>
  );
}

function CategoryTabs() {
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex items-center gap-7 border-b border-line px-5 py-4">
        {knowledgeCategories.map((item, index) => (
          <button
            key={item.label}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold",
              index === 0 ? "bg-[#f0edff] text-brand" : "text-[#172452] hover:bg-slate-50"
            )}
          >
            {item.label}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px]", index === 0 ? "bg-white/70" : "bg-slate-100 text-slate-500")}>
              {item.count}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function FilterRow() {
  return (
    <Card className="mt-0 rounded-t-none px-5 py-4">
      <div className="flex items-center gap-4">
        {filters.map((filter) => (
          <button
            key={filter}
            className="flex h-10 min-w-[146px] items-center justify-between rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452]"
          >
            {filter}
            <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
          </button>
        ))}
        <button className="h-10 rounded-lg border border-line bg-white px-5 text-[13px] font-semibold text-slate-500">
          重置
        </button>
        <div className="ml-auto flex gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
            <Icon name="grid-2" className="h-4 w-4" />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-[#172452]">
            <Icon name="panel" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function NodeGrid() {
  return (
    <div className="mt-5">
      <div className="grid gap-4 xl:grid-cols-3">
        {knowledgeNodes.map((node) => (
          <NodeCard key={node.title} node={node} />
        ))}
        <button className="min-h-[88px] rounded-2xl border border-dashed border-[#d8dcf7] bg-[#f6f7ff] text-center text-brand transition-colors hover:border-brand hover:bg-white">
          <div className="flex items-center justify-center gap-2 text-[15px] font-bold">
            <Icon name="plus" className="h-5 w-5" />
            新建知识节点
          </div>
          <p className="mt-1 text-[12px] text-slate-500">沉淀新的知识资产</p>
        </button>
      </div>
      <Pagination />
    </div>
  );
}

function NodeCard({ node }: { node: (typeof knowledgeNodes)[number] }) {
  return (
    <article
      className={cn(
        "dashboard-card min-h-[178px] rounded-2xl p-5 transition-transform hover:-translate-y-0.5",
        node.accent && "border-brand/30 shadow-float"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className={cn("text-[17px] font-black tracking-[-0.02em]", node.accent ? "text-brand" : "text-[#172452]")}>
          {node.title}
        </h2>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", node.statusTone)}>
          <Icon name={node.status === "已发布" ? "check-circle" : "clock"} className="h-3.5 w-3.5" />
          {node.status}
        </span>
      </div>
      <p className="mt-4 min-h-[44px] text-[13px] leading-6 text-[#405070]">{node.desc}</p>
      <div className="mt-4 flex items-center gap-5 text-[12px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="file-text" className="h-3.5 w-3.5" />
          {node.version}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="link" className="h-3.5 w-3.5" />
          关联 {node.related} 个节点
        </span>
      </div>
      <div className="mt-5 flex items-center border-t border-line pt-3 text-[12px] text-slate-500">
        <span className="truncate">来源：{node.source}</span>
        <span className="ml-auto flex items-center gap-1">
          <MiniPeople />
          {node.people}
        </span>
      </div>
    </article>
  );
}

function MiniPeople() {
  return (
    <span className="flex -space-x-1">
      <span className="h-5 w-5 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-2 ring-white" />
      <span className="h-5 w-5 rounded-full bg-[radial-gradient(circle_at_50%_28%,#ffd6cc_0_18%,#7c3aed_19%_46%,#312e81_47%)] ring-2 ring-white" />
    </span>
  );
}

function Pagination() {
  return (
    <div className="mt-5 flex items-center justify-between text-[13px] text-slate-500">
      <span>共 368 条</span>
      <div className="flex items-center gap-2">
        <PageButton icon="chevron-left" />
        {[1, 2, 3, 4, 5].map((page) => (
          <button
            key={page}
            className={cn(
              "h-9 w-9 rounded-lg border text-[13px] font-semibold",
              page === 1 ? "border-brand text-brand" : "border-line bg-white text-slate-600"
            )}
          >
            {page}
          </button>
        ))}
        <span className="px-2">...</span>
        <button className="h-9 w-9 rounded-lg border border-line bg-white text-[13px] font-semibold text-slate-600">19</button>
        <PageButton icon="chevron-right" />
        <button className="ml-4 flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-slate-600">
          20 条/页
          <Icon name="chevron-down" className="h-3.5 w-3.5" />
        </button>
        <span className="ml-3">跳至</span>
        <button className="h-9 w-16 rounded-lg border border-line bg-white text-ink">1</button>
        <span>页</span>
      </div>
    </div>
  );
}

function PageButton({ icon }: { icon: string }) {
  return (
    <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-slate-500">
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

function KnowledgeGraphMini() {
  return (
    <Card className="mt-7 px-6 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">知识图谱（局部视图：商业画布）</h2>
        <button className="flex items-center gap-1 text-[12px] font-bold text-brand">
          查看完整图谱
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative mt-5 h-[190px] overflow-hidden rounded-2xl bg-white">
        <svg viewBox="0 0 820 190" className="h-full w-full">
          <defs>
            <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {graphLinks.map(([from, label, to], index) => {
            const left = graphLayout[from as keyof typeof graphLayout];
            const right = graphLayout[to as keyof typeof graphLayout];
            if (!left || !right) return null;
            return (
              <g key={`${from}-${to}`}>
                <line x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke="#d9e1f4" strokeWidth="1.2" />
                <text x={(left.x + right.x) / 2} y={(left.y + right.y) / 2 - 5} textAnchor="middle" fontSize="10" fill="#9aa5bd">
                  {label}
                </text>
              </g>
            );
          })}
          {Object.entries(graphLayout).map(([name, point]) => (
            <g key={name}>
              <rect
                x={point.x - point.w / 2}
                y={point.y - 17}
                width={point.w}
                height="34"
                rx="17"
                fill={name === "价值主张" ? "#5b4bff" : "#f0f3ff"}
                filter={name === "价值主张" ? "url(#softGlow)" : undefined}
              />
              <text
                x={point.x}
                y={point.y + 4}
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill={name === "价值主张" ? "#fff" : "#4f62d8"}
              >
                {name}
              </text>
            </g>
          ))}
        </svg>
        <div className="absolute right-5 top-8 flex flex-col rounded-lg border border-line bg-white shadow-card">
          <button className="flex h-8 w-8 items-center justify-center text-brand">+</button>
          <button className="flex h-8 w-8 items-center justify-center border-t border-line text-slate-500">−</button>
        </div>
      </div>
    </Card>
  );
}

const graphLayout = {
  客户细分: { x: 175, y: 45, w: 92 },
  渠道通路: { x: 310, y: 45, w: 92 },
  价值主张: { x: 420, y: 80, w: 104 },
  客户关系: { x: 555, y: 45, w: 92 },
  收入来源: { x: 680, y: 45, w: 92 },
  核心资源: { x: 145, y: 135, w: 92 },
  关键活动: { x: 285, y: 135, w: 92 },
  重要伙伴: { x: 520, y: 135, w: 92 },
  成本结构: { x: 665, y: 135, w: 92 },
};

function KnowledgeAssistant() {
  return (
    <aside className="flex h-screen w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">IMC&IPM 智能助手</div>
            <div className="text-[11px] text-slate-400">基于学院方法论的决策助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 rounded-xl bg-white p-4 shadow-[0_8px_26px_rgba(30,58,138,0.06)]">
          <p className="text-[13px] font-bold text-ink">👋 你好，张晓明</p>
          <p className="mt-3 text-[12px] font-semibold text-slate-600">关于知识节点库，我可以帮助你：</p>
          <ul className="mt-3 space-y-2 text-[12px] leading-6 text-slate-600">
            <li>• 快速查找相关知识节点</li>
            <li>• 分析节点之间的关联关系</li>
            <li>• 搜寻相关的课程资料和案例</li>
            <li>• 发现和归纳笔记中的空白点</li>
            <li>• 评估节点的完整性和质量</li>
          </ul>
        </div>
        <div className="mt-4 space-y-2">
          {knowledgeAssistantPrompts.map((prompt) => (
            <button
              key={prompt}
              className="flex w-full items-center rounded-lg bg-[#f3f1ff] px-3 py-3 text-left text-[12.5px] font-semibold leading-5 text-brand"
            >
              {prompt}
            </button>
          ))}
        </div>
      </Card>
      <Card className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-ink">对话历史</h2>
          <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
        </div>
        <p className="mt-5 text-[12px] font-semibold text-slate-400">今天</p>
        <div className="mt-3 space-y-3">
          {knowledgeHistory.map((item) => (
            <div key={item.label} className="rounded-xl bg-white px-4 py-3 shadow-[0_8px_26px_rgba(30,58,138,0.045)]">
              <div className="text-[12.5px] text-slate-700">{item.label}</div>
              <div className="mt-1 text-right text-[11px] text-slate-400">{item.time}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="mt-auto px-4 py-4">
        <div className="flex h-16 items-center gap-2 rounded-xl bg-white px-3">
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="继续提问..."
          />
          <button className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-soft">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">内容由 AI 生成，仅供参考</p>
      </Card>
    </aside>
  );
}
