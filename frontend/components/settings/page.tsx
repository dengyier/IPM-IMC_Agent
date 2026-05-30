import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { icon: "settings", label: "基本设置", active: true },
  { icon: "users", label: "用户与权限" },
  { icon: "database", label: "知识库管理" },
  { icon: "brain", label: "模型与AI配置" },
  { icon: "link", label: "集成与接口" },
  { icon: "shield", label: "安全与合规" },
  { icon: "bell", label: "通知设置" },
  { icon: "history", label: "日志审计" },
];

const systemInfo = [
  ["系统名称", "IMC&IPM 商业决策智能体"],
  ["系统简称", "IMC&IPM"],
  ["系统版本", "v2.3.1"],
  ["部署环境", "生产环境"],
  ["部署时间", "2025-03-15 10:30:00"],
  ["系统时区", "(GMT+08:00) 北京，上海，香港"],
];

const localeSettings = [
  ["系统语言", "简体中文"],
  ["日期格式", "YYYY-MM-DD"],
  ["时间格式", "24 小时制 (HH:mm)"],
  ["数字格式", "1,234.56"],
  ["货币单位", "人民币 (¥)"],
];

const themeModes = [
  { icon: "sun", label: "浅色模式", active: true },
  { icon: "moon", label: "深色模式" },
  { icon: "monitor", label: "跟随系统" },
];

const accentColors = ["#5B4BFF", "#3B82F6", "#22C55E", "#F59E0B", "#EC4899", "#A855F7"];

const densityModes = [
  { icon: "panel", title: "折叠模式", desc: "收起侧边栏，仅显示图标" },
  { icon: "list", title: "展开模式", desc: "完整显示菜单文字和图标", active: true },
];

type Control =
  | { kind: "toggle"; on: boolean }
  | { kind: "text"; value: string }
  | { kind: "select"; value: string };

interface ConfigItem {
  icon: string;
  title: string;
  desc: string;
  control: Control;
}

const systemConfig: ConfigItem[] = [
  { icon: "users", title: "新用户注册", desc: "允许新用户自动注册", control: { kind: "toggle", on: false } },
  { icon: "shield", title: "双重认证", desc: "登录时需要双重身份验证", control: { kind: "toggle", on: true } },
  { icon: "file-check", title: "邮箱验证", desc: "新用户需进行邮箱验证激活", control: { kind: "toggle", on: false } },
  { icon: "history", title: "操作日志记录", desc: "记录用户关键操作日志", control: { kind: "toggle", on: true } },
  { icon: "database", title: "自动备份", desc: "每日自动备份系统数据", control: { kind: "text", value: "已开启" } },
  { icon: "calendar", title: "备份保留天数", desc: "保留最近 30 天的备份", control: { kind: "select", value: "30 天" } },
];

const maintenance = [
  { icon: "database", tone: "bg-[#f0edff] text-brand", title: "数据备份", desc: "备份系统数据和知识库", meta: "上次备份：2025-06-02 02:00", btn: "立即备份" },
  { icon: "refresh", tone: "bg-blue-50 text-blue-500", title: "数据恢复", desc: "从备份文件恢复系统数据", meta: "上次恢复：2025-05-28 15:30", btn: "恢复数据" },
  { icon: "trash", tone: "bg-orange-50 text-orange-500", title: "缓存清理", desc: "清理系统缓存和临时文件", meta: "上次清理：2025-06-01 10:20", btn: "立即清理" },
  { icon: "rotate-ccw", tone: "bg-emerald-50 text-emerald-600", title: "系统更新", desc: "检查并安装系统更新", meta: "当前版本：v2.3.1", btn: "检查更新" },
  { icon: "upload", tone: "bg-violet-50 text-violet", title: "导出系统配置", desc: "导出当前系统配置文件", meta: "", btn: "导出配置" },
  { icon: "x-circle", tone: "bg-rose-50 text-rose-500", title: "重置系统配置", desc: "将系统配置恢复为默认", meta: "", btn: "重置配置", danger: true },
];

const assistantPoints = ["查找系统设置项", "解释配置含义", "推荐最佳实践", "检测配置风险", "生成配置报告"];
const assistantPrompts = ["如何设置更安全的密码策略？", "如何配置邮件通知？", "如何管理用户角色权限？", "如何备份和恢复系统数据？"];

export function SettingsPage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <SettingsHeader />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pb-6 pt-5">
          <SettingsTabs />
          <h2 className="mt-7 text-[19px] font-black text-ink">基本设置</h2>
          <div className="mt-4 grid gap-5 xl:grid-cols-3">
            <SystemInfoCard />
            <EnterpriseCard />
            <LocaleCard />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <AppearanceCard />
            <SystemConfigCard />
          </div>
          <h2 className="mt-8 text-[19px] font-black text-ink">系统维护</h2>
          <div className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
            {maintenance.map((m) => (
              <MaintenanceCard key={m.title} item={m} />
            ))}
          </div>
          <SettingsFooter />
        </section>
        <SettingsAssistant />
      </div>
    </main>
  );
}

function SettingsHeader() {
  return (
    <header className="flex items-center justify-between gap-6 px-8 pt-6">
      <div>
        <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">系统设置</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          管理系统配置、权限、集成与安全等全局设置，保障系统稳定高效运行
        </p>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex h-10 w-[300px] items-center gap-2.5 rounded-xl border border-line bg-white px-4">
          <Icon name="search" className="h-4 w-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="搜索设置项，例如：模型、权限、通知..."
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

function SettingsTabs() {
  return (
    <Card className="mt-6 flex flex-wrap items-center gap-1 px-3 py-2">
      {settingsTabs.map((tab) => (
        <button
          key={tab.label}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-bold transition-colors",
            tab.active ? "bg-[#f0edff] text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-[#172452]"
          )}
        >
          <Icon name={tab.icon} className="h-[17px] w-[17px]" />
          {tab.label}
        </button>
      ))}
    </Card>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col px-6 py-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-black text-ink">{title}</h3>
        {action && (
          <button className="flex items-center gap-1 text-[12.5px] font-bold text-brand">
            <Icon name="pencil" className="h-3.5 w-3.5" />
            {action}
          </button>
        )}
      </div>
      <div className="mt-5 flex-1">{children}</div>
    </Card>
  );
}

function SystemInfoCard() {
  return (
    <SectionCard title="系统信息" action="编辑">
      <div className="space-y-3.5">
        {systemInfo.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="shrink-0 font-medium text-slate-400">{label}</span>
            <span className="text-right font-bold text-[#172452]">{value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function EnterpriseCard() {
  return (
    <SectionCard title="企业信息" action="编辑">
      <div className="space-y-3.5">
        <Row label="企业名称" value="智策科技有限公司" />
        <Row label="企业简称" value="智策科技" />
        <div className="flex items-start justify-between gap-4 text-[13px]">
          <span className="shrink-0 pt-3 font-medium text-slate-400">企业 Logo</span>
          <div className="flex items-center gap-3">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-xl shadow-soft">
              <Icon name="boxes" className="h-6 w-6 text-white" />
            </div>
            <div>
              <button className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-[#172452]">
                <Icon name="upload" className="h-3.5 w-3.5" />
                点击更换
              </button>
              <div className="mt-1.5 text-[11px] text-slate-400">支持 JPG、PNG，建议尺寸 200x200px</div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 text-[13px]">
          <span className="shrink-0 font-medium text-slate-400">企业官网</span>
          <a className="font-bold text-brand" href="#">https://www.zhicetec.com</a>
        </div>
      </div>
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <span className="shrink-0 font-medium text-slate-400">{label}</span>
      <span className="text-right font-bold text-[#172452]">{value}</span>
    </div>
  );
}

function LocaleCard() {
  return (
    <SectionCard title="系统语言与区域">
      <div className="space-y-4">
        {localeSettings.map(([label, value]) => (
          <label key={label} className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold text-[#172452]">{label}</span>
            <button className="flex h-10 w-full items-center justify-between rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-[#172452]">
              {value}
              <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
            </button>
          </label>
        ))}
        <div className="flex justify-end pt-1">
          <button className="brand-gradient flex h-10 items-center justify-center rounded-xl px-8 text-[13px] font-bold text-white shadow-soft">
            保存
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function AppearanceCard() {
  return (
    <SectionCard title="系统外观设置">
      <div>
        <div className="text-[13px] font-bold text-[#172452]">主题模式</div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {themeModes.map((m) => (
            <button
              key={m.label}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-bold transition-colors",
                m.active ? "border-brand bg-[#f6f5ff] text-brand ring-1 ring-brand/20" : "border-line bg-white text-slate-500"
              )}
            >
              <Icon name={m.icon} className="h-[18px] w-[18px]" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-6 text-[13px] font-bold text-[#172452]">主色调</div>
        <div className="mt-3 flex items-center gap-4">
          {accentColors.map((color, index) => (
            <button
              key={color}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 transition",
                index === 0 && "ring-2 ring-brand"
              )}
              style={{ backgroundColor: color }}
            >
              {index === 0 && <Icon name="check" className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {densityModes.map((d) => (
            <button
              key={d.title}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
                d.active ? "border-brand bg-[#f6f5ff] ring-1 ring-brand/20" : "border-line bg-white"
              )}
            >
              <Icon name={d.icon} className={cn("mt-0.5 h-[18px] w-[18px]", d.active ? "text-brand" : "text-slate-400")} />
              <div>
                <div className={cn("text-[13px] font-bold", d.active ? "text-brand" : "text-[#172452]")}>{d.title}</div>
                <div className="mt-1 text-[11px] font-medium text-slate-400">{d.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function SystemConfigCard() {
  return (
    <SectionCard title="系统配置">
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {systemConfig.map((item) => (
          <div key={item.title} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[#172452]">{item.title}</div>
              <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{item.desc}</div>
            </div>
            <ControlView control={item.control} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ControlView({ control }: { control: Control }) {
  if (control.kind === "toggle") {
    return (
      <span
        className={cn(
          "relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
          control.on ? "brand-gradient" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "absolute h-5 w-5 rounded-full bg-white shadow transition-all",
            control.on ? "left-[22px]" : "left-0.5"
          )}
        />
      </span>
    );
  }
  if (control.kind === "text") {
    return <span className="shrink-0 text-[12px] font-bold text-emerald-600">{control.value}</span>;
  }
  return (
    <button className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[12.5px] font-semibold text-[#172452]">
      {control.value}
      <Icon name="chevron-down" className="h-3.5 w-3.5 text-slate-400" />
    </button>
  );
}

function MaintenanceCard({ item }: { item: (typeof maintenance)[number] }) {
  return (
    <Card className="flex flex-col px-4 py-5">
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", item.tone)}>
        <Icon name={item.icon} className="h-5 w-5" />
      </span>
      <div className="mt-4 text-[14px] font-black text-ink">{item.title}</div>
      <div className="mt-1.5 text-[11.5px] font-medium leading-5 text-slate-400">{item.desc}</div>
      {item.meta && <div className="mt-2 text-[11px] text-slate-400">{item.meta}</div>}
      <button
        className={cn(
          "mt-4 flex h-9 w-full items-center justify-center rounded-lg border text-[12.5px] font-bold transition-colors",
          item.danger
            ? "border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
            : "border-line bg-white text-brand hover:bg-[#f6f5ff]"
        )}
      >
        {item.btn}
      </button>
    </Card>
  );
}

function SettingsFooter() {
  return (
    <footer className="mt-auto flex items-center justify-center gap-3 pt-8 text-[12px] text-slate-400">
      <span>© 2025 智策科技有限公司. All rights reserved.</span>
      <span className="text-slate-300">|</span>
      <a href="#" className="hover:text-brand">隐私政策</a>
      <a href="#" className="hover:text-brand">服务条款</a>
    </footer>
  );
}

function SettingsAssistant() {
  return (
    <aside className="flex w-[336px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line/70 bg-white/50 px-4 py-6 backdrop-blur-xl">
      <Card className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-soft">
            <Icon name="boxes" className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">IMC&IPM 智能助手</div>
            <div className="text-[11px] text-slate-400">基于系统设置的智能助手</div>
          </div>
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">AI</span>
          <button className="ml-auto text-slate-400">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-6 flex items-center gap-1.5 text-[14px] font-bold text-ink">
          <span>👋</span> 你好，张晓明 <span>👋</span>
        </p>
        <p className="mt-3 text-[13px] font-semibold leading-6 text-[#172452]">我可以帮助你：</p>
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

        <div className="mt-6 flex h-16 items-center gap-2 rounded-xl bg-white px-3 shadow-[0_8px_26px_rgba(30,58,138,0.045)]">
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            placeholder="继续提问..."
          />
          <button className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-soft">
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Shift + Enter 换行，Enter 发送</p>
      </Card>
    </aside>
  );
}
