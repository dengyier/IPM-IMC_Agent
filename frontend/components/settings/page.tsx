"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth-context";
import { ApiError, EditableSystemSettings, systemApi } from "@/lib/api";
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

const themeModes = [
  { icon: "sun", label: "浅色模式", value: "light" },
  { icon: "moon", label: "深色模式", value: "dark" },
  { icon: "monitor", label: "跟随系统", value: "system" },
];

const accentColors = ["#5B4BFF", "#3B82F6", "#22C55E", "#F59E0B", "#EC4899", "#A855F7"];

const densityModes = [
  { icon: "panel", title: "折叠模式", desc: "收起侧边栏，仅显示图标", value: "collapsed" },
  { icon: "list", title: "展开模式", desc: "完整显示菜单文字和图标", value: "expanded" },
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

const DEFAULT_SETTINGS: EditableSystemSettings = {
  system_name: "IMC&IPM 商业决策智能体",
  system_short_name: "IMC&IPM",
  system_version: "v2.3.1",
  deployment_environment: "生产环境",
  deployed_at: "2025-03-15 10:30:00",
  timezone: "(GMT+08:00) 北京，上海，香港",
  company_name: "智策科技有限公司",
  company_short_name: "智策科技",
  company_website: "https://www.zhicetec.com",
  language: "简体中文",
  date_format: "YYYY-MM-DD",
  time_format: "24 小时制 (HH:mm)",
  number_format: "1,234.56",
  currency: "人民币 (¥)",
  theme_mode: "light",
  accent_color: "#5B4BFF",
  nav_density: "expanded",
  allow_registration: false,
  require_2fa: true,
  require_email_verification: false,
  audit_log_enabled: true,
  auto_backup_enabled: true,
  backup_retention_days: 30,
  updated_at: null,
};

const assistantPoints = ["查找系统设置项", "解释配置含义", "推荐最佳实践", "检测配置风险", "生成配置报告"];
const assistantPrompts = ["如何设置更安全的密码策略？", "如何配置邮件通知？", "如何管理用户角色权限？", "如何备份和恢复系统数据？"];

export function SettingsPage() {
  const [settings, setSettings] = useState<EditableSystemSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<EditableSystemSettings>(DEFAULT_SETTINGS);
  const [editing, setEditing] = useState<"system" | "enterprise" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    systemApi
      .editableSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setDraft(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setMessage(e instanceof ApiError ? `设置加载失败：${e.message}` : "设置加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateDraft<K extends keyof EditableSystemSettings>(key: K, value: EditableSystemSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(section: "system" | "enterprise") {
    setDraft(settings);
    setEditing(section);
    setMessage(null);
  }

  function cancelEdit() {
    setDraft(settings);
    setEditing(null);
    setMessage(null);
  }

  async function saveSettings(successText = "设置已保存") {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await systemApi.updateEditableSettings(draft);
      setSettings(saved);
      setDraft(saved);
      setEditing(null);
      setMessage(successText);
    } catch (e) {
      setMessage(e instanceof ApiError ? `保存失败：${e.message}` : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <SettingsHeader />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pb-6 pt-5">
          <SettingsTabs />
          <div className="mt-7 flex items-center justify-between gap-4">
            <h2 className="text-[19px] font-black text-ink">基本设置</h2>
            <div className="min-h-5 text-[12.5px] font-bold">
              {loading && <span className="text-slate-400">正在加载设置…</span>}
              {!loading && message && (
                <span className={message.includes("失败") ? "text-rose-500" : "text-emerald-600"}>
                  {message}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-5 xl:grid-cols-3">
            <SystemInfoCard
              draft={draft}
              editing={editing === "system"}
              saving={saving}
              onEdit={() => startEdit("system")}
              onCancel={cancelEdit}
              onSave={() => saveSettings("系统信息已保存")}
              onChange={updateDraft}
            />
            <EnterpriseCard
              draft={draft}
              editing={editing === "enterprise"}
              saving={saving}
              onEdit={() => startEdit("enterprise")}
              onCancel={cancelEdit}
              onSave={() => saveSettings("企业信息已保存")}
              onChange={updateDraft}
            />
            <SystemConfigCard
              draft={draft}
              saving={saving}
              onChange={updateDraft}
              onSave={() => saveSettings("系统配置已保存")}
            />
          </div>
          <div className="mt-5 grid gap-5">
            <AppearanceCard
              draft={draft}
              saving={saving}
              onChange={updateDraft}
              onSave={() => saveSettings("外观设置已保存")}
            />
          </div>
          <SettingsFooter />
        </section>
        <SettingsAssistant />
      </div>
    </main>
  );
}

function SettingsHeader() {
  const { user, logout } = useAuth();

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
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-3 rounded-2xl py-1 pl-2 pr-2 text-left hover:bg-white"
          title="退出登录"
        >
          <div className="h-9 w-9 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white" />
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-ink">{user?.display_name || "用户"}</div>
            <div className="text-[11px] text-slate-400">{user?.role || "访客"}</div>
          </div>
          <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
        </button>
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

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col px-6 py-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-black text-ink">{title}</h3>
        {action}
      </div>
      <div className="mt-5 flex-1">{children}</div>
    </Card>
  );
}

type SettingsChange = <K extends keyof EditableSystemSettings>(
  key: K,
  value: EditableSystemSettings[K]
) => void;

function CardActions({
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: {
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!editing) {
    return (
      <button onClick={onEdit} className="flex items-center gap-1 text-[12.5px] font-bold text-brand">
        <Icon name="pencil" className="h-3.5 w-3.5" />
        编辑
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onCancel}
        disabled={saving}
        className="h-8 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-slate-500 disabled:opacity-50"
      >
        取消
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="brand-gradient h-8 rounded-lg px-3 text-[12px] font-bold text-white shadow-soft disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}

function EditableRow({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <span className="shrink-0 font-medium text-slate-400">{label}</span>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-right text-[13px] font-bold text-[#172452] outline-none focus:border-brand/60"
        />
      ) : (
        <span className="text-right font-bold text-[#172452]">{value}</span>
      )}
    </div>
  );
}

function SystemInfoCard({
  draft,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
  onChange,
}: {
  draft: EditableSystemSettings;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: SettingsChange;
}) {
  return (
    <SectionCard
      title="系统信息"
      action={
        <CardActions
          editing={editing}
          saving={saving}
          onEdit={onEdit}
          onCancel={onCancel}
          onSave={onSave}
        />
      }
    >
      <div className="space-y-3.5">
        <EditableRow label="系统名称" value={draft.system_name} editing={editing} onChange={(v) => onChange("system_name", v)} />
        <EditableRow label="系统简称" value={draft.system_short_name} editing={editing} onChange={(v) => onChange("system_short_name", v)} />
        <EditableRow label="系统版本" value={draft.system_version} editing={editing} onChange={(v) => onChange("system_version", v)} />
        <EditableRow label="部署环境" value={draft.deployment_environment} editing={editing} onChange={(v) => onChange("deployment_environment", v)} />
        <EditableRow label="部署时间" value={draft.deployed_at} editing={editing} onChange={(v) => onChange("deployed_at", v)} />
        <EditableRow label="系统时区" value={draft.timezone} editing={editing} onChange={(v) => onChange("timezone", v)} />
      </div>
    </SectionCard>
  );
}

function EnterpriseCard({
  draft,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
  onChange,
}: {
  draft: EditableSystemSettings;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: SettingsChange;
}) {
  return (
    <SectionCard
      title="企业信息"
      action={
        <CardActions
          editing={editing}
          saving={saving}
          onEdit={onEdit}
          onCancel={onCancel}
          onSave={onSave}
        />
      }
    >
      <div className="space-y-3.5">
        <EditableRow label="企业名称" value={draft.company_name} editing={editing} onChange={(v) => onChange("company_name", v)} />
        <EditableRow label="企业简称" value={draft.company_short_name} editing={editing} onChange={(v) => onChange("company_short_name", v)} />
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
        <EditableRow label="企业官网" value={draft.company_website} editing={editing} onChange={(v) => onChange("company_website", v)} />
      </div>
    </SectionCard>
  );
}

function AppearanceCard({
  draft,
  saving,
  onChange,
  onSave,
}: {
  draft: EditableSystemSettings;
  saving: boolean;
  onChange: SettingsChange;
  onSave: () => void;
}) {
  return (
    <SectionCard title="系统外观设置">
      <div>
        <div className="text-[13px] font-bold text-[#172452]">主题模式</div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {themeModes.map((m) => (
            <button
              key={m.label}
              onClick={() => onChange("theme_mode", m.value)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-bold transition-colors",
                draft.theme_mode === m.value ? "border-brand bg-[#f6f5ff] text-brand ring-1 ring-brand/20" : "border-line bg-white text-slate-500"
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
              onClick={() => onChange("accent_color", color)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 transition",
                draft.accent_color === color && "ring-2 ring-brand"
              )}
              style={{ backgroundColor: color }}
            >
              {draft.accent_color === color && <Icon name="check" className="h-4 w-4 text-white" />}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {densityModes.map((d) => (
            <button
              key={d.title}
              onClick={() => onChange("nav_density", d.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors",
                draft.nav_density === d.value ? "border-brand bg-[#f6f5ff] ring-1 ring-brand/20" : "border-line bg-white"
              )}
            >
              <Icon name={d.icon} className={cn("mt-0.5 h-[18px] w-[18px]", draft.nav_density === d.value ? "text-brand" : "text-slate-400")} />
              <div>
                <div className={cn("text-[13px] font-bold", draft.nav_density === d.value ? "text-brand" : "text-[#172452]")}>{d.title}</div>
                <div className="mt-1 text-[11px] font-medium text-slate-400">{d.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onSave}
            disabled={saving}
            className="brand-gradient flex h-10 items-center justify-center rounded-xl px-8 text-[13px] font-bold text-white shadow-soft disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存外观"}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

const configRows = [
  { icon: "users", title: "新用户注册", desc: "允许新用户自动注册", key: "allow_registration" },
  { icon: "shield", title: "双重认证", desc: "登录时需要双重身份验证", key: "require_2fa" },
  { icon: "file-check", title: "邮箱验证", desc: "新用户需进行邮箱验证激活", key: "require_email_verification" },
  { icon: "history", title: "操作日志记录", desc: "记录用户关键操作日志", key: "audit_log_enabled" },
  { icon: "database", title: "自动备份", desc: "每日自动备份系统数据", key: "auto_backup_enabled" },
] as const;

function ToggleControl({
  on,
  onClick,
}: {
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        on ? "brand-gradient" : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "absolute h-5 w-5 rounded-full bg-white shadow transition-all",
          on ? "left-[22px]" : "left-0.5"
        )}
      />
    </button>
  );
}

function SystemConfigCard({
  draft,
  saving,
  onChange,
  onSave,
}: {
  draft: EditableSystemSettings;
  saving: boolean;
  onChange: SettingsChange;
  onSave: () => void;
}) {
  return (
    <SectionCard title="系统配置">
      <div className="grid grid-cols-2 gap-x-8 gap-y-5">
        {configRows.map((item) => (
          <div key={item.title} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[#172452]">{item.title}</div>
              <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{item.desc}</div>
            </div>
            <ToggleControl
              on={Boolean(draft[item.key])}
              onClick={() => onChange(item.key, !draft[item.key])}
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
            <Icon name="calendar" className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-[#172452]">备份保留天数</div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">保留最近 {draft.backup_retention_days} 天的备份</div>
          </div>
          <select
            value={draft.backup_retention_days}
            onChange={(e) => onChange("backup_retention_days", Number(e.target.value))}
            className="h-9 shrink-0 rounded-lg border border-line bg-white px-3 text-[12.5px] font-semibold text-[#172452] outline-none"
          >
            {[7, 14, 30, 60, 90].map((day) => (
              <option key={day} value={day}>
                {day} 天
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="brand-gradient flex h-10 items-center justify-center rounded-xl px-8 text-[13px] font-bold text-white shadow-soft disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存配置"}
        </button>
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
  const { user } = useAuth();

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
          <span>👋</span> 你好，{user?.display_name || "用户"} <span>👋</span>
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
