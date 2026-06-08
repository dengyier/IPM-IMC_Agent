"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth-context";
import { PendingTaskBell } from "@/components/pending-task-bell";
import { ApiError, EditableSystemSettings, authApi, systemApi } from "@/lib/api";

const DEFAULT_SETTINGS: EditableSystemSettings = {
  system_name: "天机AI 商业决策智能体",
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

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [settings, setSettings] = useState<EditableSystemSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<EditableSystemSettings>(DEFAULT_SETTINGS);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [editing, setEditing] = useState<"profile" | "enterprise" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const showEnterpriseInfo = Boolean(user?.is_super_admin || user?.user_type?.startsWith("enterprise") || user?.tenant_id);

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

  useEffect(() => {
    setDisplayNameDraft(user?.display_name || defaultDisplayName(user?.phone));
  }, [user?.display_name, user?.phone]);

  function updateDraft<K extends keyof EditableSystemSettings>(key: K, value: EditableSystemSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(section: "profile" | "enterprise") {
    setDraft(settings);
    setDisplayNameDraft(user?.display_name || defaultDisplayName(user?.phone));
    setEditing(section);
    setMessage(null);
  }

  function cancelEdit() {
    setDraft(settings);
    setDisplayNameDraft(user?.display_name || defaultDisplayName(user?.phone));
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

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    try {
      await authApi.updateMe({ display_name: displayNameDraft.trim() });
      await refreshUser();
      setEditing(null);
      setMessage("个人信息已保存");
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
          <div className="mt-4 grid max-w-[1080px] gap-5 xl:grid-cols-2">
            <ProfileCard
              displayName={displayNameDraft}
              phone={user?.phone || ""}
              userType={user?.user_type || "individual"}
              editing={editing === "profile"}
              saving={saving}
              onEdit={() => startEdit("profile")}
              onCancel={cancelEdit}
              onSave={saveProfile}
              onChange={setDisplayNameDraft}
            />
            {showEnterpriseInfo && (
              <EnterpriseCard
                draft={draft}
                editing={editing === "enterprise"}
                saving={saving}
                onEdit={() => startEdit("enterprise")}
                onCancel={cancelEdit}
                onSave={() => saveSettings("企业信息已保存")}
                onChange={updateDraft}
              />
            )}
          </div>
          <SettingsFooter />
        </section>
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
          管理个人名称与企业基础信息
        </p>
      </div>
      <div className="flex items-center gap-5">
        <PendingTaskBell className="hover:bg-white" />
        <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
          <Icon name="help-circle" className="h-[19px] w-[19px]" />
        </button>
      </div>
    </header>
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

function defaultDisplayName(phone?: string) {
  const last4 = (phone || "").replace(/\D/g, "").slice(-4) || "用户";
  return `天机${last4}`;
}

function userTypeLabel(userType: string) {
  if (userType === "enterprise_manager") return "企业管理员";
  if (userType === "enterprise_staff") return "企业成员";
  return "个人用户";
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

function ProfileCard({
  displayName,
  phone,
  userType,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
  onChange,
}: {
  displayName: string;
  phone: string;
  userType: string;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <SectionCard
      title="个人信息"
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
        <EditableRow label="用户名称" value={displayName} editing={editing} onChange={onChange} />
        <ReadonlyRow label="登录手机号" value={maskPhone(phone)} />
        <ReadonlyRow label="账号类型" value={userTypeLabel(userType)} />
      </div>
    </SectionCard>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <span className="shrink-0 font-medium text-slate-400">{label}</span>
      <span className="text-right font-bold text-[#172452]">{value}</span>
    </div>
  );
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone || "未绑定";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
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
