import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const steps = [
  "项目信息输入",
  "识别关键假设",
  "商业画布分析",
  "风险与验证路径",
  "生成诊断报告",
];

const problemTags = ["价值主张是否成立", "商业模式健康吗", "风险矩阵", "+ 趋势更多"];

const outputs = [
  { icon: "file-text", title: "九宫格商业画布", desc: "结构化分析" },
  { icon: "clipboard-check", title: "关键假设", desc: "核心假设清单" },
  { icon: "alert", title: "风险识别", desc: "高影响风险排序" },
  { icon: "route", title: "最小验证路径", desc: "可执行验证方案" },
  { icon: "file-bar-chart", title: "行动建议", desc: "下一步行动清单" },
];

const canvasBlocks = [
  { label: "客户细分", tone: "bg-blue-50 text-blue-600", dot: "低" },
  { label: "价值主张", tone: "bg-emerald-50 text-emerald-600", dot: "中" },
  { label: "渠道通路", tone: "bg-violet-50 text-violet-600", dot: "中" },
  { label: "客户关系", tone: "bg-green-50 text-green-600", dot: "低" },
  { label: "收入来源", tone: "bg-orange-50 text-orange-600", dot: "高" },
  { label: "客户关系", tone: "bg-blue-50 text-blue-600", dot: "低" },
  { label: "重要伙伴", tone: "bg-rose-50 text-rose-600", dot: "高" },
  { label: "投入来源", tone: "bg-red-50 text-red-500", dot: "高" },
  { label: "成本结构", tone: "bg-emerald-50 text-emerald-600", dot: "中" },
];

const reports = [
  { title: "智能硬件产品", date: "2025-06-02 09:30", status: "已完成", tone: "bg-emerald-50 text-emerald-600" },
  { title: "社区电商平台优化", date: "2025-06-01 15:20", status: "已完成", tone: "bg-emerald-50 text-emerald-600" },
  { title: "SaaS 定价策略评估", date: "2025-05-31 11:10", status: "草稿", tone: "bg-orange-50 text-orange-500" },
  { title: "教育硬件项目可行性", date: "2025-05-30 14:25", status: "已完成", tone: "bg-emerald-50 text-emerald-600" },
];

const prompts = ["价值主张是否成立？", "客户是否愿意付费？", "商业模式的关键风险？", "最小可行验证路径？", "自定义提问..."];

export function CanvasDiagnosisPage() {
  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <DiagnosisHeader />
        <StepBar />
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_258px]">
          <ProjectForm />
          <DiagnosisContext />
        </div>
        <DiagnosisOutputs />
        <PreviewReport />
        <p className="py-5 text-center text-[12px] text-slate-400">
          诊断结果由 AI 生成，仅供决策参考，重要决策请结合实际情况
        </p>
      </section>
      <DiagnosisAssistant />
    </main>
  );
}

function DiagnosisHeader() {
  return (
    <header className="flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">商业画布诊断</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          基于 IMC&IPM 方法论，结合知识节点与案例，为你的项目生成结构化诊断报告
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button className="h-10 rounded-xl border border-teal-200 bg-teal-50 px-4 text-[12px] font-bold text-teal-600 shadow-[0_8px_24px_rgba(20,184,166,0.10)]">
          本次诊断使用 DeepSeek-R1
        </button>
        <button className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[12px] font-bold text-[#172452]">
          知识节点 <span className="text-brand">56 个</span>
          <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
        </button>
        <TopActions />
      </div>
    </header>
  );
}

function TopActions() {
  return (
    <div className="flex shrink-0 items-center gap-5">
      <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
        <Icon name="bell" className="h-[19px] w-[19px]" />
        <span className="absolute right-0 top-0 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
          8
        </span>
      </button>
      <div className="h-10 w-px bg-line" />
      <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white" />
      <div className="leading-tight">
        <div className="text-[13px] font-bold text-ink">张晓明</div>
        <div className="text-[11px] text-slate-400">管理员</div>
      </div>
      <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
    </div>
  );
}

function StepBar() {
  return (
    <Card className="mt-7 px-7 py-5">
      <div className="grid grid-cols-5 gap-3">
        {steps.map((step, index) => (
          <div key={step} className="relative flex items-center justify-center">
            {index > 0 && <span className="absolute right-[50%] top-1/2 h-px w-full -translate-y-1/2 bg-line" />}
            <div
              className={cn(
                "relative z-10 flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-full text-[13px] font-bold",
                index === 0 ? "bg-[#f0edff] text-brand" : "bg-white text-slate-500"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
                  index === 0 ? "brand-gradient text-white" : "bg-slate-100 text-slate-400"
                )}
              >
                {index + 1}
              </span>
              {step}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProjectForm() {
  return (
    <Card className="px-6 py-5">
      <div className="flex items-center gap-10">
        <h2 className="text-[17px] font-black text-ink">告诉智能体你的项目</h2>
        <p className="text-[13px] font-semibold text-slate-500">越详细，分析越精准</p>
      </div>
      <div className="mt-5 space-y-5">
        <Field label="项目名称" required>
          <input className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none" defaultValue="智能硬件产品 - 家庭健康监测仪" />
        </Field>
        <Field label="项目背景" required>
          <div className="relative">
            <textarea
              className="h-[86px] w-full resize-none rounded-lg border border-line bg-white px-4 py-3 text-[13px] font-semibold leading-6 text-[#172452] outline-none"
              defaultValue="我们计划推出一款家庭健康监测仪，集成心率、血氧、睡眠质量、体温等多项监测功能，通过AI算法提供健康趋势分析，并与医生/健康管理服务对接。"
            />
            <span className="absolute bottom-3 right-4 text-[11px] text-slate-400">68/500</span>
          </div>
        </Field>
        <Field label="目标客户">
          <input className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none" defaultValue="30-55岁关注健康的家庭用户，慢性病人群及亚健康人群" />
        </Field>
        <div className="grid gap-5 md:grid-cols-[1fr_168px_1fr]">
          <Field label="产品/服务核心价值">
            <input className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none" defaultValue="实时监测 + AI 分析 + 健康建议 + 医疗连接" />
          </Field>
          <Field label="当前阶段" hint>
            <button className="flex h-11 w-full items-center justify-between rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452]">
              产品原型阶段
              <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
            </button>
          </Field>
          <Field label="核心问题（可多选）">
            <div className="min-h-20 rounded-lg border border-line bg-white px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {problemTags.map((tag, index) => (
                  <span key={tag} className={cn("rounded-md px-2.5 py-1.5 text-[12px] font-bold", index === 3 ? "bg-slate-50 text-slate-500" : "bg-[#f0edff] text-brand")}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Field>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="已有资源">
            <textarea className="h-[68px] w-full resize-none rounded-lg border border-line bg-white px-4 py-3 text-[13px] font-semibold leading-6 text-[#172452] outline-none" defaultValue={"- 硬件原型\n- 算法团队\n- 健康资源"} />
          </Field>
          <Field label="主要竞争对手">
            <textarea className="h-[68px] w-full resize-none rounded-lg border border-line bg-white px-4 py-3 text-[13px] font-semibold leading-6 text-[#172452] outline-none" defaultValue="小米手环、华为手表、平安/阿里健康硬件" />
          </Field>
        </div>
        <Field label="希望重点分析的问题">
          <div className="relative">
            <textarea className="h-[58px] w-full resize-none rounded-lg border border-line bg-white px-4 py-3 text-[13px] font-semibold leading-6 text-[#172452] outline-none" defaultValue="用户是否愿意为AI健康分析付费？产品的差异化是什么？最小可行验证路径？" />
            <span className="absolute bottom-3 right-4 text-[11px] text-slate-400">52/300</span>
          </div>
        </Field>
        <div className="flex items-center gap-4 pt-1">
          <div className="flex items-center gap-2 text-[13px] font-bold text-slate-600">
            <Icon name="brain" className="h-4 w-4 text-brand" />
            智能推荐知识节点（已开启）
          </div>
          <span className="relative h-5 w-9 rounded-full bg-brand">
            <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow" />
          </span>
          <button className="brand-gradient ml-auto flex h-11 w-[284px] items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white shadow-soft">
            <Icon name="sparkles" className="h-4 w-4" />
            开始诊断
          </button>
        </div>
      </div>
    </Card>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1 text-[13px] font-bold text-[#172452]">
        {label}
        {required && <span className="text-rose-500">*</span>}
        {hint && <span className="h-3.5 w-3.5 rounded-full bg-[#f0edff] text-center text-[10px] leading-[14px] text-brand">?</span>}
      </span>
      {children}
    </label>
  );
}

function DiagnosisContext() {
  const suggestions = ["范围模糊的区间", "渠道策略", "收入预测模型", "关键合作资源"];
  const references = [
    ["智能穿戴设备项目", "相似度 85%"],
    ["家庭医疗硬件项目", "相似度 78%"],
    ["健康管理 SaaS+硬件", "相似度 72%"],
  ];
  const nodes = ["价值主张（v1.3）", "客户细分（v1.2）", "收入来源（v1.2）", "关键资源（v1.1）", "渠道通路（v1.1）"];

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-ink">智能体建议补充</h2>
          <div className="relative h-12 w-14">
            <div className="absolute bottom-1 left-2 h-8 w-10 rounded-xl bg-blue-100" />
            <Icon name="bot" className="absolute right-1 top-0 h-10 w-10 text-brand" />
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-[#f5f7ff] px-4 py-3 text-[12px] font-semibold leading-6 text-brand">
          AI 建议补全以下信息，可提升分析质量
        </div>
        <ul className="mt-3 space-y-2">
          {suggestions.map((item) => (
            <li key={item} className="flex items-center gap-2 text-[12px] font-bold text-brand">
              <Icon name="check-circle" className="h-3.5 w-3.5" />
              {item}
            </li>
          ))}
        </ul>
        <button className="mt-4 h-10 w-full rounded-lg border border-line bg-white text-[13px] font-bold text-brand">
          一键补充细节
        </button>
      </Card>
      <SideList title="历史项目参考" subtitle="基于相似项目的分析样板" items={references.map(([title, meta]) => ({ title, meta }))} />
      <SideList title="使用的知识节点（预览）" subtitle="共 18 个节点" items={nodes.map((title) => ({ title, meta: "" }))} />
    </div>
  );
}

function SideList({ title, subtitle, items }: { title: string; subtitle: string; items: { title: string; meta: string }[] }) {
  return (
    <Card className="px-5 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-black text-ink">{title}</h2>
        <Icon name="x" className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">{subtitle}</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.title} className="text-[12px]">
            <div className="font-bold text-[#172452]">{item.title}</div>
            {item.meta ? <div className="mt-1 font-bold text-emerald-500">{item.meta}</div> : <div className="mt-1 text-brand">• 关联知识节点</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DiagnosisOutputs() {
  return (
    <Card className="mt-5 px-6 py-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[17px] font-black text-ink">诊断将产出</h2>
        <span className="h-3 w-3 rounded-full bg-fuchsia-500 shadow-[0_0_0_4px_rgba(217,70,239,0.12)]" />
      </div>
      <div className="mt-5 grid grid-cols-5 gap-4">
        {outputs.map((item) => (
          <div key={item.title} className="rounded-xl border border-line bg-white px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="brand-gradient-soft flex h-10 w-10 items-center justify-center rounded-xl text-brand">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[14px] font-black text-[#172452]">{item.title}</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-400">{item.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PreviewReport() {
  return (
    <Card className="mt-5 px-6 py-5">
      <h2 className="text-[17px] font-black text-ink">示例输出预览 <span className="text-[12px] text-slate-400">（基于相似项目）</span></h2>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="grid grid-cols-3 gap-2">
          {canvasBlocks.map((block) => (
            <div key={`${block.label}-${block.dot}`} className={cn("rounded-xl px-3 py-3", block.tone)}>
              <div className="text-[12px] font-black">{block.label}</div>
              <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold opacity-75">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {block.dot}
              </div>
            </div>
          ))}
        </div>
        <PreviewPanel title="关键假设 TOP 3" rows={["用户愿意为AI健康分析付费", "准确的健康数据能带来行为改变", "医疗资源对接能提升付费意愿"]} />
        <PreviewPanel title="主要风险" danger rows={["用户付费意愿低", "数据隐私合规风险", "差异化不够明显"]} />
        <PreviewPanel title="最小验证路径" rows={["用户访谈（30-50人）", "付费意愿测试（A/B 定价）", "产品 MVP 试点测试", "合作医院/健康平台验证"]} />
      </div>
    </Card>
  );
}

function PreviewPanel({ title, rows, danger }: { title: string; rows: string[]; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#f8f9ff] px-5 py-4">
      <h3 className="text-[14px] font-black text-[#172452]">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row, index) => (
          <div key={row} className="flex gap-2 text-[12px] font-bold leading-5 text-[#172452]">
            {danger ? (
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            ) : (
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f0edff] text-[10px] text-brand">{index + 1}</span>
            )}
            <span>{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagnosisAssistant() {
  return (
    <aside className="flex h-screen w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">IMC&IPM 智能助手</div>
            <div className="text-[11px] text-slate-400">擅于同学院方法论的决策助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 rounded-xl bg-white p-4 shadow-[0_8px_26px_rgba(30,58,138,0.06)]">
          <p className="text-[13px] font-bold text-ink">👋 你好，张晓明 👋</p>
          <p className="mt-3 text-[13px] font-semibold leading-6 text-[#172452]">
            你正在进行「智能硬件产品」的商业画布诊断
          </p>
        </div>
        <p className="mt-5 rounded-xl bg-white px-4 py-3 text-[13px] font-semibold text-[#172452] shadow-[0_8px_26px_rgba(30,58,138,0.045)]">
          你更关注哪个方面的分析？
        </p>
        <div className="mt-3 space-y-2">
          {prompts.map((prompt) => (
            <button key={prompt} className="flex w-full items-center rounded-lg bg-[#f3f1ff] px-4 py-3 text-left text-[13px] font-bold text-brand">
              {prompt}
            </button>
          ))}
        </div>
        <div className="mt-5 flex h-20 items-center gap-2 rounded-xl bg-white px-3 shadow-[0_8px_26px_rgba(30,58,138,0.045)]">
          <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400" placeholder="继续追问..." />
          <button className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-soft">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Shift + Enter 换行，Enter 发送</p>
      </Card>
      <Card className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black text-ink">我的诊断记录</h2>
          <button className="flex items-center gap-1 text-[12px] font-bold text-brand">
            查看全部
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {reports.map((report) => (
            <div key={report.title} className="flex items-start gap-3">
              <div>
                <div className="text-[13px] font-black text-[#172452]">{report.title}</div>
                <div className="mt-1 text-[12px] text-slate-500">{report.date}</div>
              </div>
              <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold", report.tone)}>
                {report.status}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}
