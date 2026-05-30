import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const steps = [
  { title: "提交笔记", desc: "上传或粘贴同学笔记" },
  { title: "解析与理解", desc: "AI 理解笔记内容" },
  { title: "匹配知识节点", desc: "找到最相关的节点" },
  { title: "提取增量内容", desc: "提取观点/案例/场景" },
  { title: "生成进化建议", desc: "形成结构化建议" },
];

const matchedNodes = [
  { icon: "clipboard-check", title: "价值主张", sub: "商业画布 · 核心模块", rate: "95%", width: "95%", tag: "强相关", tone: "bg-violet-50 text-brand" },
  { icon: "file-text", title: "最小可行验证", sub: "关键活动 · 方法论", rate: "87%", width: "87%", tag: "强相关", tone: "bg-orange-50 text-orange-500" },
  { icon: "file-check", title: "客户细分", sub: "商业画布 · 核心模块", rate: "78%", width: "78%", tag: "相关", tone: "bg-emerald-50 text-emerald-600" },
];

const insightCards = [
  {
    title: "新增观点（2条）",
    body: ["早期验证价值主张时，不应先做完整产品，而应先验证用户是否愿意为核心价值付费。", "价值主张验证的关键不是“有多少用户喜欢”，而是“有多少用户愿意长期使用”。"],
  },
  {
    title: "新增案例（1个）",
    body: ["某智能硬件团队通过做“功能最小化原型”，仅用 2 周完成 30 位目标用户的付费意愿测试，验证了核心价值主张。"],
  },
  {
    title: "应用场景扩展（1条）",
    body: ["将该方法应用于 B 端企业服务场景：通过小范围客户深度访谈 + 低保真方案验证付费意愿。"],
  },
];

const prompts = [
  "这篇笔记能补充哪些知识节点？",
  "有哪些新的观点或案例？",
  "是否与老师观点存在差异？",
  "建议如何合并到知识体系中？",
];

const history = [
  { title: "从0到1验证价值主张的3...", meta: "李同学 · 商业画布", status: "分析完成", tone: "bg-emerald-50 text-emerald-600" },
  { title: "To B 产品的获客思路拆解", meta: "王同学 · 渠道通路", status: "待审核", tone: "bg-orange-50 text-orange-500" },
  { title: "SaaS 付费模式的思考", meta: "张同学 · 收入来源", status: "已合并", tone: "bg-emerald-50 text-emerald-600" },
  { title: "品牌定位的用户洞察方法", meta: "陈同学 · 价值主张", status: "分歧归纳", tone: "bg-green-50 text-green-600" },
];

export function NoteEvolutionPage() {
  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <NoteHeader />
        <StepBar />
        <SubmitNote />
        <AnalysisResult />
      </section>
      <NoteAssistant />
    </main>
  );
}

function NoteHeader() {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">同学笔记进化</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          上传课后协同学习笔记，智能识别并匹配知识节点，让集体智慧反哺课程方法论
        </p>
      </div>
      <div className="flex items-center gap-4">
        <button className="h-10 rounded-xl bg-[#f0edff] px-4 text-[12px] font-bold text-brand">
          说明 DeepSeek-R1 分析中
        </button>
        <button className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[12px] font-bold text-[#172452]">
          本月已处理 <span className="text-brand">23 份</span>
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
    <Card className="mt-7 px-7 py-6">
      <div className="grid grid-cols-5 gap-4">
        {steps.map((step, index) => (
          <div key={step.title} className="relative flex items-center">
            {index > 0 && <span className="absolute right-[58%] top-[20px] h-px w-full bg-line" />}
            <div className="relative z-10 flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-black",
                  index === 0 ? "brand-gradient text-white" : "bg-slate-100 text-slate-400"
                )}
              >
                {index + 1}
              </span>
              <div>
                <div className={cn("text-[15px] font-black", index === 0 ? "text-brand" : "text-[#172452]")}>{step.title}</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-400">{step.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SubmitNote() {
  return (
    <Card className="mt-5 px-6 py-5">
      <h2 className="text-[18px] font-black text-ink">提交笔记</h2>
      <div className="mt-4 grid gap-6 xl:grid-cols-[0.9fr_1.25fr]">
        <div>
          <div className="flex gap-3">
            <button className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-bold text-brand">
              <Icon name="file-text" className="h-4 w-4" />
              上传文件
            </button>
            <button className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-bold text-slate-500">
              <Icon name="clipboard-check" className="h-4 w-4" />
              粘贴文本
            </button>
            <button className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-bold text-slate-500">
              <Icon name="pencil" className="h-4 w-4" />
              手动输入
            </button>
          </div>
          <div className="mt-4 flex h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cdd6ff] bg-[#f8faff]">
            <Icon name="upload-cloud" className="h-10 w-10 text-brand" />
            <div className="mt-5 text-[14px] font-black text-[#172452]">点击或拖拽文件到此处</div>
            <div className="mt-3 text-[12px] font-semibold text-slate-400">支持 PDF、Word、TXT、MD 格式，单个文件不超过 50MB</div>
          </div>
        </div>
        <div className="grid gap-5">
          <Field label="笔记信息" required>
            <input className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none" defaultValue="笔记标题：从0到1验证价值主张的3个关键动作" />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="所属课程/主题" required>
              <button className="flex h-11 w-full items-center justify-between rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452]">
                商业画布
                <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
              </button>
            </Field>
            <Field label="笔记作者" required>
              <input className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none" defaultValue="李同学" />
            </Field>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="行业/场景（可选）">
              <input className="h-11 w-full rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-[#172452] outline-none" defaultValue="智能硬件 / 消费电子" />
            </Field>
            <button className="brand-gradient mt-[26px] flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white shadow-soft">
              <Icon name="sparkles" className="h-4 w-4" />
              开始分析
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1 text-[13px] font-bold text-[#172452]">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function AnalysisResult() {
  const tabs = ["匹配结果", "增量内容提取", "与老师观点关系", "进化建议", "影响预览"];

  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex items-center border-b border-line px-6 py-5">
        <h2 className="text-[18px] font-black text-ink">分析结果</h2>
        <span className="ml-3 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-600">
          分析完成
        </span>
        <div className="ml-auto flex items-center gap-3 text-[13px] font-bold text-[#172452]">
          置信度：89%
          <span className="relative h-8 w-8 rounded-full border-[3px] border-blue-500 border-l-blue-100" />
        </div>
      </div>
      <div className="flex gap-9 border-b border-line px-6">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            className={cn(
              "relative py-4 text-[13px] font-bold",
              index === 0 ? "text-brand after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-brand" : "text-slate-500"
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="px-6 py-6">
        <h3 className="text-[15px] font-black text-ink">匹配的知识节点（3个）</h3>
        <div className="mt-5 space-y-5">
          {matchedNodes.map((node) => (
            <MatchedNode key={node.title} node={node} />
          ))}
        </div>
        <div className="mt-7 grid gap-5 xl:grid-cols-3">
          {insightCards.map((card) => (
            <InsightCard key={card.title} card={card} />
          ))}
        </div>
        <MergeSuggestion />
      </div>
    </Card>
  );
}

function MatchedNode({ node }: { node: (typeof matchedNodes)[number] }) {
  return (
    <div className="grid items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-[0_8px_26px_rgba(30,58,138,0.035)] md:grid-cols-[1fr_170px_90px_108px]">
      <div className="flex items-center gap-4">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", node.tone)}>
          <Icon name={node.icon} className="h-5 w-5" />
        </span>
        <div>
          <div className="text-[15px] font-black text-[#172452]">{node.title}</div>
          <div className="mt-1 text-[12px] font-semibold text-slate-400">{node.sub}</div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[12px] font-bold text-[#172452]">匹配度 {node.rate}</div>
        <div className="h-1.5 rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: node.width }} />
        </div>
      </div>
      <span className="justify-self-start rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-600">{node.tag}</span>
      <button className="h-9 rounded-lg border border-line bg-white text-[12px] font-bold text-brand">查看详情</button>
    </div>
  );
}

function InsightCard({ card }: { card: (typeof insightCards)[number] }) {
  return (
    <div className="rounded-2xl bg-[#f8faff] px-5 py-5">
      <h3 className="text-[15px] font-black text-ink">{card.title}</h3>
      <ul className="mt-4 space-y-3 text-[12px] font-semibold leading-6 text-[#405070]">
        {card.body.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {item}
          </li>
        ))}
      </ul>
      <button className="mt-4 flex items-center gap-1 text-[12px] font-bold text-brand">
        查看更多
        <Icon name="chevron-right" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MergeSuggestion() {
  return (
    <div className="mt-6 rounded-2xl bg-[#fbfcff] px-5 py-5">
      <h3 className="text-[15px] font-black text-ink">建议合并内容</h3>
      <p className="mt-3 text-[13px] font-semibold leading-6 text-[#405070]">
        建议将以上增量内容合并到“价值主张”与“最小可行验证”节点中，作为同学增量扩展观点与案例，进入人工审核提醒。
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <span className="rounded-lg bg-[#f0edff] px-3 py-2 text-[12px] font-bold text-brand">价值主张：新增观点 1 条，案例 1 个，应用场景 1 条</span>
        <span className="rounded-lg bg-orange-50 px-3 py-2 text-[12px] font-bold text-orange-500">最小可行验证：新增观点 1 条，案例 1 个</span>
      </div>
      <div className="mt-6 flex justify-end gap-4">
        <button className="flex h-10 w-[170px] items-center justify-center gap-2 rounded-lg border border-line bg-white text-[13px] font-bold text-[#172452]">
          <Icon name="file-text" className="h-4 w-4" />
          保存为草稿
        </button>
        <button className="flex h-10 w-[170px] items-center justify-center gap-2 rounded-lg border border-line bg-white text-[13px] font-bold text-[#172452]">
          <Icon name="refresh" className="h-4 w-4" />
          调整匹配
        </button>
        <button className="brand-gradient flex h-10 w-[190px] items-center justify-center gap-2 rounded-lg text-[13px] font-bold text-white shadow-soft">
          <Icon name="send" className="h-4 w-4" />
          提交人工审核
        </button>
      </div>
    </div>
  );
}

function NoteAssistant() {
  return (
    <aside className="flex h-screen w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">IMC&IPM 智能助手</div>
            <div className="text-[11px] text-slate-400">基于课程方法论的进化助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 rounded-xl bg-white p-4 shadow-[0_8px_26px_rgba(30,58,138,0.06)]">
          <p className="text-[13px] font-bold text-ink">👋 你好，张晓明 👋</p>
          <p className="mt-3 text-[13px] font-semibold leading-6 text-[#172452]">我可以帮你分析同学笔记，并提出进化建议：</p>
          <ul className="mt-3 space-y-2 text-[12px] font-semibold leading-6 text-slate-600">
            <li>识别核心观点与增量信息</li>
            <li>匹配最相关的知识节点</li>
            <li>提取案例与应用场景</li>
            <li>判断与老师观点的关系</li>
            <li>生成结构化进化建议</li>
          </ul>
        </div>
        <p className="mt-5 text-[13px] font-bold text-[#172452]">你可以尝试问我：</p>
        <div className="mt-3 space-y-2">
          {prompts.map((prompt) => (
            <button key={prompt} className="flex w-full items-center rounded-lg bg-[#f3f1ff] px-4 py-3 text-left text-[13px] font-bold text-brand">
              {prompt}
            </button>
          ))}
        </div>
        <div className="mt-6 flex h-20 items-center gap-2 rounded-xl bg-white px-3 shadow-[0_8px_26px_rgba(30,58,138,0.045)]">
          <input className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400" placeholder="继续提问..." />
          <button className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-soft">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Shift + Enter 换行，Enter 发送</p>
      </Card>
      <Card className="px-5 py-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-black text-ink">最近处理记录</h2>
          <button className="flex items-center gap-1 text-[12px] font-bold text-brand">
            查看全部
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-5 space-y-5">
          {history.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-black text-[#172452]">{item.title}</div>
                <div className="mt-1 text-[12px] text-slate-500">{item.meta}</div>
              </div>
              <span className={cn("ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", item.tone)}>{item.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </aside>
  );
}
