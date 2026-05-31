// 展示映射层：后端只给语义枚举/数值，这里把它们映射成 CSS class / 文案 / 图标。
// 后端永远不返回这些样式串。

// 系统组件状态 → 文案 + 圆点色（系统设置 / Dashboard 用）
export const systemStatusTone: Record<string, { label: string; dot: string; text: string }> = {
  ok: { label: "正常", dot: "bg-emerald-500", text: "text-emerald-600" },
  offline_fallback: { label: "降级", dot: "bg-orange-400", text: "text-orange-500" },
  warning: { label: "告警", dot: "bg-amber-400", text: "text-amber-500" },
  error: { label: "异常", dot: "bg-rose-500", text: "text-rose-500" },
  offline: { label: "离线", dot: "bg-slate-400", text: "text-slate-500" },
};

// 资料处理状态 → 中文 + 徽标样式（资料中心用）
export const sourceStatusTone: Record<string, { label: string; tone: string }> = {
  uploaded: { label: "未处理", tone: "bg-slate-100 text-slate-500" },
  processing: { label: "处理中", tone: "bg-orange-50 text-orange-500" },
  processed: { label: "已入库", tone: "bg-blue-50 text-blue-600" },
  kernel_built: { label: "已建底座", tone: "bg-emerald-50 text-emerald-600" },
  absorbed: { label: "已吸收", tone: "bg-emerald-50 text-emerald-600" },
  failed: { label: "处理失败", tone: "bg-rose-50 text-rose-500" },
};

// 节点状态（知识节点库用）
export const nodeStatusTone: Record<string, { label: string; tone: string }> = {
  active: { label: "已发布", tone: "bg-emerald-50 text-emerald-600" },
  pending: { label: "待审核", tone: "bg-orange-50 text-orange-500" },
  archived: { label: "已归档", tone: "bg-slate-100 text-slate-500" },
};

// 审核状态（审核台用）
export const reviewStatusTone: Record<string, { label: string; tone: string }> = {
  pending: { label: "待审核", tone: "bg-orange-50 text-orange-500" },
  approved: { label: "已通过", tone: "bg-emerald-50 text-emerald-600" },
  rejected: { label: "已驳回", tone: "bg-rose-50 text-rose-500" },
  revise_required: { label: "需修订", tone: "bg-violet-50 text-violet-600" },
};

// 审核任务类型 → 中文（审核台用）
export const reviewTaskTypeLabels: Record<string, string> = {
  expansion_review: "扩展条目审核",
  node_review: "新知识节点审核",
  version_review: "版本升级审核",
};
export const reviewTaskTypeLabel = (t: string) => reviewTaskTypeLabels[t] ?? t;

// 扩展条目类型 → 中文（审核台 / 笔记进化用）
export const extensionTypeLabels: Record<string, string> = {
  customer_context_extensions: "客户情境扩展",
  case_extensions: "案例扩展",
  scenario_extensions: "场景扩展",
  external_view_extensions: "外部观点扩展",
  different_views: "差异观点",
  practice_feedback: "实践反馈",
};
export const extensionTypeLabel = (t: string) => extensionTypeLabels[t] ?? t;

// 来源类型 → 中文（资料中心 / 审核台用）
export const sourceTypeLabels: Record<string, string> = {
  classmate_note: "同学笔记",
  teacher_courseware: "老师课件",
  courseware: "老师课件",
  class_transcript: "课堂转写",
  enterprise_case: "企业案例",
  external_doc: "外部资料",
};
export const sourceTypeLabel = (t: string) => sourceTypeLabels[t] ?? t;

// 诊断报告状态（报告中心用）。后端实际写入 draft / checked；并兼容契约枚举。
export const reportStatusTone: Record<string, { label: string; tone: string; dot: string }> = {
  draft: { label: "草稿", tone: "bg-orange-50 text-orange-500", dot: "bg-orange-400" },
  checked: { label: "已质检", tone: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  generating: { label: "生成中", tone: "bg-blue-50 text-blue-600", dot: "bg-blue-500" },
  generated: { label: "已生成", tone: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500" },
  approved: { label: "已采纳", tone: "bg-violet-50 text-violet-600", dot: "bg-violet-500" },
  failed: { label: "失败", tone: "bg-rose-50 text-rose-500", dot: "bg-rose-500" },
};

// 商业模式画布 9 模块 → 中文标签（诊断报告 / 画布诊断用）
export const canvasModuleLabels: Record<string, string> = {
  customer_segments: "客户细分",
  value_propositions: "价值主张",
  channels: "渠道通路",
  customer_relationships: "客户关系",
  revenue_streams: "收入来源",
  key_resources: "核心资源",
  key_activities: "关键业务",
  key_partners: "重要合作",
  cost_structure: "成本结构",
};

// module_findings 的 key 可能是单数（如 value_proposition），补充别名
export const canvasModuleAliases: Record<string, string> = {
  customer_segment: "客户细分",
  value_proposition: "价值主张",
  channel: "渠道通路",
  customer_relationship: "客户关系",
  revenue_stream: "收入来源",
  key_resource: "核心资源",
  key_activity: "关键业务",
  key_partner: "重要合作",
};

// 取画布模块中文名（兼容单复数；否则原样返回）
export function moduleLabel(key: string): string {
  return canvasModuleLabels[key] ?? canvasModuleAliases[key] ?? key;
}

// 质检 7 维度 → 中文
export const dimensionLabels: Record<string, string> = {
  canvas_completeness: "画布完整度",
  methodology_alignment: "方法论契合",
  assumption: "关键假设",
  risk: "风险识别",
  actionability: "可执行性",
  evidence: "证据支撑",
  safety: "安全合规",
};

export const CANVAS_MODULE_ORDER = [
  "customer_segments",
  "value_propositions",
  "channels",
  "customer_relationships",
  "revenue_streams",
  "key_resources",
  "key_activities",
  "key_partners",
  "cost_structure",
];

// 质检评分 → 文案 + 徽标（综合评分环用）
export function scoreBand(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: "良好", tone: "bg-emerald-50 text-emerald-600" };
  if (score >= 60) return { label: "中等", tone: "bg-orange-50 text-orange-500" };
  return { label: "待完善", tone: "bg-rose-50 text-rose-500" };
}

// 诊断报告质量分（0~1）→ 评级标签 + 徽标样式（工作台「最近诊断报告」用）
export function reportGrade(score: number): { label: string; tone: string } {
  const s = score ?? 0;
  if (s >= 0.85) return { label: "优秀", tone: "bg-emerald-50 text-emerald-600" };
  if (s >= 0.7) return { label: "良好", tone: "bg-blue-50 text-blue-600" };
  return { label: "中等", tone: "bg-orange-50 text-orange-500" };
}

// 工作台「待处理事项」桶 → 文案 / 图标 / 圆点色 / 跳转路由（后端只给 key+count）
export const pendingItemMeta: Record<
  string,
  { label: string; icon: string; dot: string; route: string }
> = {
  review: { label: "待审核条目", icon: "clipboard-check", dot: "bg-rose-500", route: "/review" },
  sources: { label: "资料待处理", icon: "folder-plus", dot: "bg-orange-400", route: "/data-center" },
  reports: { label: "报告待复核", icon: "file-text", dot: "bg-violet-500", route: "/reports" },
};

// 千分位
export const fmtNum = (n: number) => n.toLocaleString("en-US");
