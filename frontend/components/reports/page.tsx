import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const listTabs = ["全部报告", "我创建的", "我参与的", "我收藏的", "被采纳的"];

const filters = [
  { label: "报告状态", value: "全部" },
  { label: "报告类型", value: "全部" },
  { label: "行业领域", value: "全部" },
  { label: "创建时间", value: "全部" },
];

const tagTone: Record<string, string> = {
  violet: "bg-violet-50 text-violet",
  blue: "bg-blue-50 text-blue-500",
  emerald: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-500",
};

interface ReportItem {
  title: string;
  iconTone: string;
  tags: { text: string; tone: keyof typeof tagTone }[];
  client: string;
  date: string;
  done: boolean;
  active?: boolean;
}

const reports: ReportItem[] = [
  {
    title: "智能硬件产品可行性诊断报告",
    iconTone: "bg-[#f0edff] text-brand",
    tags: [
      { text: "商业诊断", tone: "violet" },
      { text: "营销分析", tone: "blue" },
    ],
    client: "智联科技有限公司",
    date: "2025-06-02 14:30",
    done: true,
    active: true,
  },
  {
    title: "社区电商平台优化诊断报告",
    iconTone: "bg-orange-50 text-orange-500",
    tags: [
      { text: "运营优化", tone: "emerald" },
      { text: "增长策略", tone: "orange" },
    ],
    client: "邻里优选",
    date: "2025-06-01 10:25",
    done: true,
  },
  {
    title: "教育SaaS产品商业模式诊断",
    iconTone: "bg-emerald-50 text-emerald-600",
    tags: [
      { text: "商业模式", tone: "violet" },
      { text: "市场分析", tone: "blue" },
    ],
    client: "知学教育",
    date: "2025-05-30 16:45",
    done: true,
  },
  {
    title: "新能源汽车充电站项目评估报告",
    iconTone: "bg-[#f0edff] text-brand",
    tags: [
      { text: "项目评估", tone: "violet" },
      { text: "风险分析", tone: "orange" },
    ],
    client: "绿能科技",
    date: "2025-05-29 09:15",
    done: false,
  },
  {
    title: "跨境电商独立站出海策略诊断",
    iconTone: "bg-blue-50 text-blue-500",
    tags: [
      { text: "出海策略", tone: "blue" },
      { text: "渠道进入", tone: "emerald" },
    ],
    client: "海拓贸易",
    date: "2025-05-28 15:20",
    done: true,
  },
  {
    title: "餐饮连锁品牌升级诊断报告",
    iconTone: "bg-orange-50 text-orange-500",
    tags: [
      { text: "品牌升级", tone: "orange" },
      { text: "用户体验", tone: "violet" },
    ],
    client: "味之源餐饮",
    date: "2025-05-26 18:30",
    done: true,
  },
  {
    title: "医疗健康APP产品定位诊断",
    iconTone: "bg-[#f0edff] text-brand",
    tags: [
      { text: "产品定位", tone: "blue" },
      { text: "用户研究", tone: "violet" },
    ],
    client: "康联医疗",
    date: "2025-05-26 18:30",
    done: false,
  },
];

const detailTabs = ["报告概览", "关键结论", "商业画布诊断", "风险分析", "方案建议", "执行路径", "附件资料"];

const conclusions = [
  { icon: "check-circle", tone: "bg-emerald-50 text-emerald-600", title: "价值主张", status: "成立", statusTone: "text-emerald-600", desc: "用户需求真实存在" },
  { icon: "users", tone: "bg-blue-50 text-blue-500", title: "客户细分", status: "清晰", statusTone: "text-blue-500", desc: "目标人群清晰" },
  { icon: "shield", tone: "bg-teal-50 text-teal-600", title: "商业可行性", status: "可行", statusTone: "text-teal-600", desc: "具备盈利潜力" },
  { icon: "alert", tone: "bg-orange-50 text-orange-500", title: "主要风险", status: "中等", statusTone: "text-orange-500", desc: "需重点关注竞争" },
  { icon: "target", tone: "bg-violet-50 text-violet", title: "推荐优先级", status: "高", statusTone: "text-violet", desc: "建议推进验证" },
];

const keyData = [
  { label: "目标市场规模", value: "28.6", unit: "亿", note: "TAM" },
  { label: "预计首年营收", value: "1.2", unit: "亿", note: "保守估计" },
  { label: "毛利率预估", value: "42", unit: "%", note: "中等水平" },
  { label: "投资回收期", value: "18", unit: "个月", note: "较短" },
  { label: "成功概率", value: "68", unit: "%", note: "综合评估" },
];

const timeline = [
  { label: "项目创建", time: "05-28 10:20" },
  { label: "资料收集", time: "05-28 14:30" },
  { label: "AI 分析", time: "05-30 09:15" },
  { label: "专家复核", time: "06-01 16:40" },
  { label: "报告完成", time: "08-02 14:30" },
];

const reportTags = ["智能硬件", "健康医疗", "可行性分析", "B2C", "早期项目"];

const assistantPoints = ["解读关键结论和数据", "分析风险和机会点", "生成执行建议清单", "对比历史相似案例", "生成报告摘要PPT"];
const assistantPrompts = ["这个项目最大的风险是什么？", "建议优先验证哪个关键假设？", "如何降低竞争风险？", "这个估值合理吗？"];

const usage = [
  { label: "被查看", value: "18", unit: "次" },
  { label: "被分享", value: "6", unit: "次" },
  { label: "被下载", value: "3", unit: "次" },
];

const related = [
  { title: "智能手环产品定位诊断", sim: "85%", iconTone: "bg-orange-50 text-orange-500" },
  { title: "家用医疗设备市场分析", sim: "78%", iconTone: "bg-blue-50 text-blue-500" },
  { title: "健康监测设备竞品分析", sim: "72%", iconTone: "bg-emerald-50 text-emerald-600" },
];

const operations = [
  { icon: "copy", label: "复制报告" },
  { icon: "presentation", label: "生成报告PPT" },
  { icon: "download", label: "导出为PDF" },
  { icon: "archive", label: "归档报告" },
  { icon: "trash", label: "删除报告", danger: true },
];

export function ReportsPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <ReportsHeader />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pb-8 pt-5">
          <FilterTabs />
          <FilterBar />
          <div className="mt-5 grid min-h-0 flex-1 gap-5 xl:grid-cols-[336px_1fr]">
            <ReportList />
            <ReportDetail />
          </div>
        </section>
        <ReportsAssistant />
      </div>
    </main>
  );
}

function ReportsHeader() {
  return (
    <header className="flex items-center justify-between gap-6 px-8 pt-6">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">诊断报告中心</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          集中管理所有商业诊断报告，支持查看、分享、跟踪执行与复盘
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-[280px] items-center gap-2.5 rounded-xl border border-line bg-white px-4">
          <Icon name="search" className="h-4 w-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="搜索报告名称、项目、客户、标签..."
          />
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-slate-400 hover:text-brand">
          <Icon name="filter" className="h-4 w-4" />
        </button>
        <button className="brand-gradient flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold text-white shadow-soft">
          <Icon name="plus" className="h-4 w-4" />
          新建报告
        </button>
        <div className="h-6 w-px bg-line" />
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
          <Icon name="bell" className="h-[19px] w-[19px]" />
          <span className="absolute right-0.5 top-0 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
            0
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

function FilterTabs() {
  return (
    <Card className="mt-6 flex items-center gap-9 px-6 pt-4">
      {listTabs.map((tab, index) => (
        <button
          key={tab}
          className={cn(
            "relative pb-4 text-[14px] font-bold transition-colors",
            index === 0 ? "text-brand" : "text-slate-500 hover:text-[#172452]"
          )}
        >
          {tab}
          {index === 0 && <span className="absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-brand" />}
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
      <button className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[12.5px] font-semibold text-[#172452]">
        <Icon name="filter" className="h-3.5 w-3.5 text-slate-400" />
        更多筛选
        <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
      </button>
      <button className="flex h-10 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold text-slate-400 hover:text-brand">
        重置
      </button>
    </Card>
  );
}

function ReportList() {
  return (
    <Card className="flex flex-col px-4 py-4">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-[15px] font-black text-ink">报告列表（36）</h2>
        <button className="flex items-center gap-1 text-[12px] font-semibold text-slate-400 hover:text-brand">
          最新创建
          <Icon name="chevron-down" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {reports.map((r) => (
          <ReportCard key={r.title} report={r} />
        ))}
      </div>
      <ReportPagination />
    </Card>
  );
}

function ReportCard({ report }: { report: ReportItem }) {
  return (
    <button
      className={cn(
        "flex w-full gap-3 rounded-xl border p-3.5 text-left transition-all",
        report.active
          ? "border-brand/60 bg-[#f8f7ff] shadow-[0_10px_28px_rgba(91,75,255,0.1)] ring-1 ring-brand/30"
          : "border-line bg-white hover:border-brand/40 hover:bg-[#fbfbff]"
      )}
    >
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", report.iconTone)}>
        <Icon name="file-text" className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className={cn("text-[13.5px] font-black leading-snug", report.active ? "text-brand" : "text-ink")}>
            {report.title}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Icon
              name="star"
              className={cn("h-4 w-4", report.active ? "fill-amber-400 text-amber-400" : "text-slate-300")}
            />
            <Icon name="more" className="h-4 w-4 text-slate-300" />
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {report.tags.map((t) => (
            <span key={t.text} className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", tagTone[t.tone])}>
              {t.text}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-slate-400">客户：{report.client}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{report.date}</span>
          <span
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold",
              report.done ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-500"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", report.done ? "bg-emerald-500" : "bg-orange-400")} />
            {report.done ? "已完成" : "待完善"}
          </span>
        </div>
      </div>
    </button>
  );
}

function ReportPagination() {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-center gap-1.5">
        <PageButton>
          <Icon name="chevron-left" className="h-4 w-4" />
        </PageButton>
        {[1, 2, 3, 4, 5].map((p) => (
          <PageButton key={p} active={p === 1}>
            {p}
          </PageButton>
        ))}
        <span className="px-1 text-[12px] text-slate-400">…</span>
        <PageButton>6</PageButton>
        <PageButton>
          <Icon name="chevron-right" className="h-4 w-4" />
        </PageButton>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-slate-400">
        跳至
        <input
          defaultValue="1"
          className="h-7 w-10 rounded-md border border-line bg-white text-center text-[12px] font-bold text-[#172452] outline-none"
        />
        页
      </div>
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

function ReportDetail() {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <div className="border-b border-line px-7 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0edff] text-brand">
            <Icon name="file-text" className="h-5 w-5" />
          </span>
          <h2 className="text-[19px] font-black text-ink">智能硬件产品可行性诊断报告</h2>
          <Icon name="star" className="h-5 w-5 fill-amber-400 text-amber-400" />
          <div className="ml-auto flex items-center gap-3">
            <button className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-bold text-[#172452]">
              <Icon name="share" className="h-4 w-4" />
              分享
            </button>
            <button className="brand-gradient flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-bold text-white shadow-soft">
              <Icon name="download" className="h-4 w-4" />
              下载报告
              <Icon name="chevron-down" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-medium text-slate-500">
          <span>客户：<span className="text-[#172452]">智联科技有限公司</span></span>
          <span>创建人：<span className="text-[#172452]">李同学</span></span>
          <span>创建时间：<span className="text-[#172452]">2025-06-02 14:30</span></span>
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[12px] text-slate-400">
          <Icon name="eye" className="h-4 w-4" />
          <div className="flex -space-x-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-5 w-5 rounded-full border-2 border-white bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)]"
              />
            ))}
          </div>
          等 3 人参与
        </div>
      </div>

      <div className="flex gap-7 overflow-x-auto border-b border-line px-7">
        {detailTabs.map((tab, index) => (
          <button
            key={tab}
            className={cn(
              "relative whitespace-nowrap py-4 text-[13px] font-bold transition-colors",
              index === 0 ? "text-brand" : "text-slate-500 hover:text-[#172452]"
            )}
          >
            {tab}
            {index === 0 && <span className="absolute -bottom-px left-0 h-0.5 w-full rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-7 py-6">
        {/* 报告摘要 + 评分 */}
        <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
          <div>
            <h3 className="text-[15px] font-black text-ink">报告摘要</h3>
            <p className="mt-3 text-[13px] font-medium leading-7 text-[#3b4a6b]">
              本报告基于 IMC&IPM 方法论，对智能硬件产品【家庭健康检测仪】项目进行了全面诊断。项目在市场需求、技术可行性和商业模式方面表现良好，但在竞争壁垒和获客成本方面存在一定风险。
            </p>
          </div>
          <ScoreCard />
        </div>

        {/* 核心结论 */}
        <h3 className="mt-7 text-[15px] font-black text-ink">核心结论</h3>
        <div className="mt-4 grid grid-cols-5 gap-3">
          {conclusions.map((c) => (
            <div key={c.title} className="rounded-2xl bg-[#f8faff] px-4 py-4 text-center">
              <span className={cn("mx-auto flex h-10 w-10 items-center justify-center rounded-xl", c.tone)}>
                <Icon name={c.icon} className="h-5 w-5" />
              </span>
              <div className="mt-3 text-[13px] font-bold text-[#172452]">{c.title}</div>
              <div className={cn("mt-1 text-[14px] font-black", c.statusTone)}>{c.status}</div>
              <div className="mt-1 text-[11px] font-medium text-slate-400">{c.desc}</div>
            </div>
          ))}
        </div>

        {/* 关键数据概览 */}
        <h3 className="mt-7 text-[15px] font-black text-ink">关键数据概览</h3>
        <div className="mt-4 grid grid-cols-5 gap-3">
          {keyData.map((d) => (
            <div key={d.label} className="rounded-2xl bg-[#f8faff] px-4 py-4">
              <div className="text-[12px] font-medium text-slate-400">{d.label}</div>
              <div className="mt-2 text-ink">
                <span className="text-[24px] font-black tracking-[-0.02em]">{d.value}</span>
                <span className="ml-1 text-[12px] font-bold text-slate-500">{d.unit}</span>
              </div>
              <div className="mt-1 text-[11px] font-medium text-slate-400">{d.note}</div>
            </div>
          ))}
        </div>

        {/* 报告时间线 */}
        <h3 className="mt-7 text-[15px] font-black text-ink">报告时间线</h3>
        <Timeline />

        {/* 标签 */}
        <h3 className="mt-7 text-[15px] font-black text-ink">标签</h3>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {reportTags.map((t) => (
            <span key={t} className="rounded-lg bg-[#f0edff] px-3 py-1.5 text-[12px] font-bold text-brand">
              {t}
            </span>
          ))}
        </div>

        {/* 备注 */}
        <div className="mt-7 flex items-center justify-between">
          <h3 className="text-[15px] font-black text-ink">备注</h3>
          <button className="flex items-center gap-1 text-[12px] font-bold text-brand">
            编辑备注
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-[13px] font-medium text-slate-400">暂无备注</p>
      </div>
    </Card>
  );
}

function ScoreCard() {
  const score = 82;
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-[#f8faff] py-5">
      <div className="text-[13px] font-bold text-slate-500">综合评分</div>
      <div className="relative mt-2 h-[120px] w-[120px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#e9ecf6" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#5B4BFF"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[34px] font-black leading-none text-ink">{score}</span>
          <span className="mt-1 text-[12px] font-bold text-slate-400">/100</span>
        </div>
      </div>
      <span className="mt-3 rounded-full bg-emerald-50 px-4 py-1 text-[12px] font-bold text-emerald-600">良好</span>
    </div>
  );
}

function Timeline() {
  return (
    <div className="mt-5 flex items-start justify-between px-2">
      {timeline.map((node, index) => (
        <div key={node.label} className="relative flex flex-1 flex-col items-center">
          {index < timeline.length - 1 && (
            <span className="absolute left-1/2 top-2 h-0.5 w-full bg-[#dfe3f1]" />
          )}
          <span
            className={cn(
              "relative z-10 h-4 w-4 rounded-full border-[3px] bg-white",
              index === timeline.length - 1 ? "border-brand bg-brand" : "border-brand"
            )}
          />
          <div className="mt-3 text-[12px] font-bold text-[#172452]">{node.label}</div>
          <div className="mt-1 text-[11px] text-slate-400">{node.time}</div>
        </div>
      ))}
    </div>
  );
}

function ReportsAssistant() {
  return (
    <aside className="flex w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">IMC&IPM 智能助手</div>
            <div className="text-[11px] text-slate-400">基于商业方法论的决策助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[14px] font-bold text-ink">
          <span>👋</span> 你好，张晓明
        </p>
        <p className="mt-3 text-[13px] font-semibold leading-6 text-[#172452]">关于此报告，我可以为你：</p>
        <ul className="mt-3 space-y-2.5 text-[12.5px] font-semibold leading-6 text-slate-600">
          {assistantPoints.map((point) => (
            <li key={point} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-2.5">
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
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-ink">报告使用情况</h2>
          <button className="flex items-center gap-1 text-[12px] font-bold text-brand">
            查看详情
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {usage.map((u) => (
            <div key={u.label}>
              <div className="text-ink">
                <span className="text-[20px] font-black">{u.value}</span>
                <span className="ml-0.5 text-[11px] text-slate-400">{u.unit}</span>
              </div>
              <div className="mt-1 text-[11px] font-medium text-slate-400">{u.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-ink">相关报告推荐</h2>
          <button className="flex items-center gap-1 text-[12px] font-bold text-brand">
            <Icon name="refresh" className="h-3.5 w-3.5" />
            换一换
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {related.map((item) => (
            <div key={item.title} className="flex items-center gap-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", item.iconTone)}>
                <Icon name="file-text" className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-[#172452]">{item.title}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">相似度 {item.sim}</div>
              </div>
              <button className="shrink-0 text-[12px] font-bold text-brand">查看</button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <h2 className="text-[15px] font-black text-ink">报告操作</h2>
        <div className="mt-4 space-y-1">
          {operations.map((op) => (
            <button
              key={op.label}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-[13px] font-bold transition-colors hover:bg-slate-50",
                op.danger ? "text-rose-500 hover:bg-rose-50" : "text-[#172452]"
              )}
            >
              <Icon name={op.icon} className="h-4 w-4" />
              {op.label}
            </button>
          ))}
        </div>
      </Card>
    </aside>
  );
}
