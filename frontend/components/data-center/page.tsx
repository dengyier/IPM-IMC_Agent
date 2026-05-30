import { Icon } from "@/components/icon";
import { Card, CardHeader } from "@/components/card";
import { cn } from "@/lib/utils";
import { materialFiles, materialStats, processSteps } from "@/lib/data";

const categoryTabs = ["全部", "老师课件", "课堂转写稿", "课堂文案", "同学笔记", "商业画布", "企业案例", "外部资料"];

export function DataCenterPage() {
  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <DataHeader />
        <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <UploadCard />
          <ProcessFlow />
        </div>
        <MaterialOverview />
        <MaterialLibrary />
      </section>
      <MaterialAssistant />
    </main>
  );
}

function DataHeader() {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-[26px] font-black tracking-[-0.03em] text-ink">资料中心</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          上传各类课程资料、案例、笔记等内容，系统将自动解析并转化为结构化知识资产
        </p>
      </div>
      <div className="dashboard-card flex h-11 w-[360px] items-center gap-3 rounded-xl px-4">
        <Icon name="search" className="h-4.5 w-4.5 text-slate-400" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          placeholder="搜索资料名称、内容、标签..."
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
      <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
        <Icon name="help-circle" className="h-[19px] w-[19px]" />
      </button>
    </div>
  );
}

function UploadCard() {
  return (
    <Card className="min-h-[226px] p-4">
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#beb7ff] bg-gradient-to-br from-white to-[#fbfaff] p-5">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f2efff] text-brand ring-8 ring-[#f8f6ff]">
            <Icon name="upload-cloud" className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-[15px] font-bold text-ink">拖拽文件到此处，或点击上传</h2>
          <p className="mx-auto mt-2 max-w-[330px] text-[12px] leading-6 text-slate-400">
            支持 PDF、DOCX、PPTX、TXT、MD 等格式，单个文件须小于 200MB
          </p>
          <button className="brand-gradient mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13px] font-semibold text-white shadow-soft">
            <Icon name="folder" className="h-4 w-4" />
            选择文件
          </button>
        </div>
      </div>
    </Card>
  );
}

function ProcessFlow() {
  return (
    <Card className="min-h-[226px] px-6 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">资料处理流程</h2>
        <button className="flex items-center gap-1 text-[12px] font-semibold text-brand">
          了解处理流程
          <Icon name="help-circle" className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-8 flex items-start justify-between">
        {processSteps.map((step, index) => (
          <div key={step.title} className="flex flex-1 items-start">
            <div className="flex flex-1 flex-col items-center text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4f1ff] text-brand shadow-[inset_0_0_0_1px_rgba(91,75,255,0.05)]">
                <Icon name={step.icon} className="h-5 w-5" />
              </div>
              <div className="mt-3 text-[13px] font-bold text-ink">{step.title}</div>
              <div className="mt-1 text-[11px] text-slate-400">{step.desc}</div>
            </div>
            {index < processSteps.length - 1 && (
              <div className="mt-5 flex w-8 shrink-0 items-center justify-center text-slate-300">
                <Icon name="chevron-right" className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function MaterialOverview() {
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
      <Card className="px-6 py-5">
        <h2 className="text-[15px] font-bold text-ink">资料概览</h2>
        <div className="mt-5 grid grid-cols-5 divide-x divide-line">
          {materialStats.map((item) => (
            <div key={item.label} className="text-center">
              <div className={cn("text-[26px] font-black tracking-[-0.03em]", item.tone)}>
                {item.value}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">{item.label}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="flex items-center justify-between px-8 py-5">
        <div>
          <div className="text-[13px] font-medium text-slate-500">今日上传</div>
          <div className="mt-3 text-[24px] font-black text-ink">
            6 <span className="text-[12px] font-medium text-slate-400">份</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            较昨日 <span className="font-semibold text-slate-500">+2</span> ↑
          </div>
        </div>
        <div className="flex h-20 items-end gap-2">
          {[30, 48, 66, 86].map((height, index) => (
            <span
              key={height}
              className="w-3 rounded-t bg-gradient-to-t from-brand to-[#bda9ff]"
              style={{ height }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function MaterialLibrary() {
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex border-b border-line px-5 pt-4">
        <button className="border-b-2 border-brand px-1 pb-3 text-[14px] font-bold text-brand">
          资料列表
        </button>
        <button className="ml-8 flex items-center gap-2 pb-3 text-[14px] font-semibold text-slate-500">
          资料对话（智能检索）
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
            Beta
          </span>
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <FilterButton label="全部类型" />
          <FilterButton label="全部状态" />
          <div className="flex h-10 w-[210px] items-center justify-between rounded-lg border border-line bg-white px-3 text-[13px] text-slate-400">
            上传时间
            <Icon name="calendar" className="h-4 w-4" />
          </div>
          <div className="flex h-10 min-w-[320px] flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3">
            <Icon name="search" className="h-4 w-4 text-slate-400" />
            <input
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
              placeholder="搜索资料名称、内容、标签..."
            />
          </div>
          <button className="h-10 rounded-lg border border-line bg-white px-5 text-[13px] font-semibold text-slate-600">
            重置
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {categoryTabs.map((tab, index) => (
            <button
              key={tab}
              className={cn(
                "h-9 rounded-lg px-4 text-[13px] font-semibold",
                index === 0
                  ? "brand-gradient text-white shadow-soft"
                  : "border border-line bg-white text-slate-600 hover:border-brand hover:text-brand"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <MaterialTable />
    </Card>
  );
}

function FilterButton({ label }: { label: string }) {
  return (
    <button className="flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-slate-600">
      {label}
      <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
    </button>
  );
}

function MaterialTable() {
  return (
    <div className="px-5 pb-5">
      <div className="grid grid-cols-[1.8fr_0.72fr_0.7fr_1fr_0.8fr_0.55fr_0.7fr] rounded-t-xl bg-[#f7f9fd] px-3 py-3 text-[12px] font-bold text-slate-500">
        <span>资料名称</span>
        <span>类型</span>
        <span>上传人</span>
        <span>上传时间</span>
        <span>状态</span>
        <span>知识节点</span>
        <span>操作</span>
      </div>
      <div className="divide-y divide-line">
        {materialFiles.map((file) => (
          <div
            key={file.name}
            className="grid grid-cols-[1.8fr_0.72fr_0.7fr_1fr_0.8fr_0.55fr_0.7fr] items-center px-3 py-3.5 text-[13px]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white", file.fileTone)}>
                <Icon name="file-text" className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{file.name}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{file.size}</div>
              </div>
            </div>
            <span className={cn("w-fit rounded-full px-2.5 py-1 text-[12px] font-semibold", file.typeTone)}>
              {file.type}
            </span>
            <div className="flex items-center gap-2">
              <Avatar tone={file.avatar} />
              <span className="text-slate-600">{file.uploader}</span>
            </div>
            <span className="text-slate-600">{file.time}</span>
            <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold", file.statusTone)}>
              <StatusIcon status={file.status} />
              {file.status}
            </span>
            <span className="text-slate-700">{file.nodes}</span>
            <div className="flex items-center gap-3 text-[#16224e]">
              <button title="预览"><Icon name="eye" className="h-4 w-4" /></button>
              <button title="分析"><Icon name="bar-chart" className="h-4 w-4" /></button>
              <button title="更多"><Icon name="more" className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-[13px] text-slate-500">
        <span>共 128 条</span>
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
          <button className="h-9 w-9 rounded-lg border border-line bg-white text-[13px] font-semibold text-slate-600">13</button>
          <PageButton icon="chevron-right" />
          <button className="ml-4 flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-slate-600">
            10 条/页
            <Icon name="chevron-down" className="h-3.5 w-3.5" />
          </button>
          <span className="ml-3">跳至</span>
          <button className="h-9 w-16 rounded-lg border border-line bg-white text-ink">1</button>
          <span>页</span>
        </div>
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

function Avatar({ tone }: { tone: string }) {
  return (
    <span
      className={cn(
        "h-7 w-7 rounded-full ring-2 ring-white",
        tone === "female"
          ? "bg-[radial-gradient(circle_at_50%_28%,#ffd6cc_0_18%,#7c3aed_19%_46%,#312e81_47%)]"
          : "bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)]"
      )}
    />
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status.includes("失败")) return <Icon name="alert" className="h-3.5 w-3.5" />;
  if (status.includes("处理") && !status.includes("未")) return <Icon name="clock" className="h-3.5 w-3.5" />;
  if (status.includes("未")) return <span className="h-1.5 w-1.5 rounded-full bg-current" />;
  return <Icon name="check-circle" className="h-3.5 w-3.5" />;
}

function MaterialAssistant() {
  return (
    <aside className="flex h-screen w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">资料助手</div>
            <div className="text-[11px] text-slate-400">基于资料库的智能问答助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 rounded-xl bg-white p-4 shadow-[0_8px_26px_rgba(30,58,138,0.06)]">
          <p className="text-[13px] font-bold text-ink">👋 你好，我是资料助手</p>
          <p className="mt-2 text-[12px] leading-6 text-slate-600">
            我可以帮你：快速查找资料内容、总结资料要点、比较不同资料观点、推荐相关知识节点。
          </p>
        </div>
        <div className="mt-4 rounded-xl bg-[#f3f0ff] p-4 text-[13px] font-semibold leading-6 text-brand">
          商业画布中价值主张的核心要点是什么？有哪些典型案例？
        </div>
        <div className="mt-4 rounded-xl bg-white p-4 shadow-[0_8px_26px_rgba(30,58,138,0.06)]">
          <button className="mb-4 flex w-full items-center justify-between rounded-lg bg-[#f7f8fc] px-3 py-2 text-[12px] font-semibold text-slate-500">
            基于 12 份资料找到相关内容
            <Icon name="chevron-down" className="h-4 w-4" />
          </button>
          <p className="text-[12.5px] leading-6 text-slate-700">
            价值主张是商业画布的核心，主要解决客户为什么选择你的问题。核心要点包括明确客户痛点、提供独特解决方案、创造可感知的价值，并与竞争对手形成差异化。
          </p>
          <div className="mt-4 rounded-xl bg-[#f5f2ff] p-3">
            <div className="text-[12px] font-bold text-slate-700">相关资料来源</div>
            <ol className="mt-2 space-y-1 text-[11px] leading-5 text-slate-500">
              <li>1. 第3课_商业画布核心逻辑.pdf（第12页）</li>
              <li>2. 品牌定位方法论.pptx（第8-15页）</li>
              <li>3. 企业案例_小米生态链.pdf（第5-8页）</li>
              <li>+ 9 份资料</li>
            </ol>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {["总结一下这份课件", "找出相关案例", "生成知识节点"].map((item) => (
            <button
              key={item}
              className="flex w-full items-center gap-2 rounded-lg bg-[#f3f1ff] px-3 py-2.5 text-left text-[12.5px] font-semibold text-brand"
            >
              <Icon name="help-circle" className="h-4 w-4" />
              {item}
            </button>
          ))}
        </div>
        <div className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3">
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="继续提问..."
          />
          <button className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">AI 生成内容仅供参考，请结合实际情况判断</p>
      </Card>
    </aside>
  );
}
