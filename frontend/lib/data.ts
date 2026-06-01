export type Trend = "up" | "down";

export interface Stat {
  key: string;
  label: string;
  value: string;
  unit: string;
  delta: string;
  trend: Trend;
  icon: string;
  tint: string;
  iconColor: string;
}

export const stats: Stat[] = [
  {
    key: "documents",
    label: "资料总数",
    value: "36,589",
    unit: "份",
    delta: "12.3%",
    trend: "up",
    icon: "folder",
    tint: "bg-indigo-50",
    iconColor: "text-indigo-500",
  },
  {
    key: "nodes",
    label: "知识节点总数",
    value: "12,586",
    unit: "个",
    delta: "8.7%",
    trend: "up",
    icon: "share",
    tint: "bg-rose-50",
    iconColor: "text-rose-500",
  },
  {
    key: "reports",
    label: "诊断报告总数",
    value: "1,248",
    unit: "份",
    delta: "15.6%",
    trend: "up",
    icon: "file",
    tint: "bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    key: "reviews",
    label: "待审核任务",
    value: "23",
    unit: "条",
    delta: "5.2%",
    trend: "down",
    icon: "clipboard",
    tint: "bg-orange-50",
    iconColor: "text-orange-500",
  },
  {
    key: "calls",
    label: "本月调用次数",
    value: "2,568",
    unit: "次",
    delta: "20.1%",
    trend: "up",
    icon: "activity",
    tint: "bg-violet-50",
    iconColor: "text-violet-500",
  },
];

export const suggestionChips = [
  "分析一下这个项目的主要风险",
  "判断价值主张是否成立",
  "生成一份商业画布报告",
  "有些同学笔记需要审核",
  "评估这个方案的可行性",
];

export interface TodoItem {
  icon: string;
  label: string;
  count: number;
  unit: string;
  dot: string;
}

export const pendingItems: TodoItem[] = [
  { icon: "file-text", label: "同学笔记待审核", count: 10, unit: "条", dot: "bg-rose-500" },
  { icon: "folder-plus", label: "资料待补充", count: 6, unit: "条", dot: "bg-orange-400" },
  { icon: "git-merge", label: "节点关系待确认", count: 4, unit: "条", dot: "bg-orange-400" },
  { icon: "clipboard-check", label: "报告待复核", count: 3, unit: "条", dot: "bg-blue-500" },
];

export interface ReportRow {
  title: string;
  time: string;
  grade: "优秀" | "良好" | "中等";
}

export const recentReports: ReportRow[] = [
  { title: "智能硬件产品可行性诊断报告", time: "2025-06-02 14:30", grade: "优秀" },
  { title: "社区电商平台优化诊断报告", time: "2025-06-01 10:25", grade: "良好" },
  { title: "教育SaaS产品商业模式诊断", time: "2025-05-30 16:45", grade: "良好" },
  { title: "新能源充电桩项目评估报告", time: "2025-05-29 09:15", grade: "中等" },
];

export const quickActions = [
  { icon: "folder", label: "资料中心", href: "/data-center" },
  { icon: "list-tree", label: "知识节点库", href: "/knowledge-nodes" },
  { icon: "layout-grid", label: "商业画布诊断", href: "/canvas-diagnosis" },
  { icon: "git-branch", label: "同学笔记进化", href: "/note-evolution" },
  { icon: "users", label: "人工审核台", href: "/review" },
  { icon: "file-bar-chart", label: "诊断报告中心", href: "/reports" },
  { icon: "file-plus", label: "新建报告", href: "/canvas-diagnosis" },
  { icon: "gauge", label: "数据看板", href: "/data-dashboard" },
];

export const assistantSkills = [
  "知识检索与问答",
  "商业画布诊断分析",
  "生成报告与可视化",
  "风险识别与评估",
  "数据分析与洞察",
];

export const assistantPrompts = [
  { icon: "help-circle", label: "这个项目的核心问题是什么？" },
  { icon: "target", label: "价值主张是否匹配客户需求？" },
  { icon: "swords", label: "帮我分析下竞争对手的优势" },
  { icon: "file-text", label: "生成一份商业画布报告" },
];

export const navItems = [
  { key: "home", icon: "home", label: "工作台首页", href: "/" },
  { key: "data-center", icon: "folder", label: "资料中心", href: "/data-center" },
  { key: "knowledge", icon: "list-tree", label: "知识节点库", href: "/knowledge-nodes" },
  { key: "canvas", icon: "layout-grid", label: "商业画布诊断", href: "/canvas-diagnosis" },
  { key: "notes", icon: "git-branch", label: "同学笔记进化", href: "/note-evolution" },
  { key: "review", icon: "users", label: "人工审核台", href: "/review" },
  { key: "reports", icon: "file-bar-chart", label: "诊断报告中心", href: "/reports" },
  { key: "settings", icon: "settings", label: "系统设置", href: "/settings" },
];

export const materialStats = [
  { label: "资料总数", value: "128", unit: "", tone: "text-ink" },
  { label: "已处理完成", value: "78", unit: "", tone: "text-brand" },
  { label: "处理中", value: "18", unit: "", tone: "text-ink" },
  { label: "待审核", value: "12", unit: "", tone: "text-rose-500" },
  { label: "沉淀知识节点", value: "368", unit: "", tone: "text-blue-500" },
];

export const processSteps = [
  { icon: "upload-cloud", title: "上传资料", desc: "选择文件上传" },
  { icon: "file-text", title: "文本解析", desc: "提取文字内容" },
  { icon: "layout-grid", title: "语义分块", desc: "智能切分文本" },
  { icon: "boxes", title: "向量入库", desc: "存入向量数据库" },
  { icon: "target", title: "节点抽取", desc: "提取知识节点" },
  { icon: "users", title: "人工审核", desc: "审核后正式入库" },
];

export const materialFiles = [
  {
    name: "第3课_商业画布核心逻辑.pdf",
    size: "12.4 MB",
    type: "老师课件",
    typeTone: "bg-violet-100 text-violet-600",
    uploader: "张晓明",
    avatar: "male",
    time: "2025-06-02 09:30",
    status: "已入库",
    statusTone: "bg-emerald-50 text-emerald-600",
    nodes: "18",
    fileTone: "bg-red-500",
  },
  {
    name: "课堂转写_第3课.txt",
    size: "8.7 MB",
    type: "课堂转写稿",
    typeTone: "bg-blue-100 text-blue-600",
    uploader: "李同学",
    avatar: "female",
    time: "2025-06-01 16:45",
    status: "抽取完成",
    statusTone: "bg-blue-50 text-blue-600",
    nodes: "24",
    fileTone: "bg-blue-500",
  },
  {
    name: "品牌定位方法论.pptx",
    size: "15.2 MB",
    type: "老师课件",
    typeTone: "bg-violet-100 text-violet-600",
    uploader: "王老师",
    avatar: "male",
    time: "2025-05-31 11:20",
    status: "处理中",
    statusTone: "bg-orange-50 text-orange-500",
    nodes: "-",
    fileTone: "bg-orange-500",
  },
  {
    name: "同学笔记_价值主张.md",
    size: "3.1 MB",
    type: "同学笔记",
    typeTone: "bg-emerald-100 text-emerald-600",
    uploader: "陈同学",
    avatar: "female",
    time: "2025-05-30 14:10",
    status: "待审核",
    statusTone: "bg-violet-50 text-violet-600",
    nodes: "3",
    fileTone: "bg-green-500",
  },
  {
    name: "企业案例_小米生态链.pdf",
    size: "21.8 MB",
    type: "企业案例",
    typeTone: "bg-orange-100 text-orange-600",
    uploader: "系统导入",
    avatar: "male",
    time: "2025-05-29 10:15",
    status: "已入库",
    statusTone: "bg-emerald-50 text-emerald-600",
    nodes: "15",
    fileTone: "bg-red-500",
  },
  {
    name: "商业模式参考资料.txt",
    size: "6.4 MB",
    type: "外部资料",
    typeTone: "bg-slate-100 text-slate-600",
    uploader: "张晓明",
    avatar: "male",
    time: "2025-05-28 15:30",
    status: "处理失败",
    statusTone: "bg-rose-50 text-rose-500",
    nodes: "0",
    fileTone: "bg-slate-400",
  },
  {
    name: "项目管理框架.pptx",
    size: "11.6 MB",
    type: "老师课件",
    typeTone: "bg-violet-100 text-violet-600",
    uploader: "张晓明",
    avatar: "male",
    time: "2025-05-27 09:50",
    status: "未处理",
    statusTone: "bg-slate-100 text-slate-500",
    nodes: "-",
    fileTone: "bg-yellow-500",
  },
];

export const knowledgeCategories = [
  { label: "全部节点", count: 368 },
  { label: "商业画布", count: 9 },
  { label: "品牌营销", count: 86 },
  { label: "项目管理", count: 72 },
  { label: "组织管理", count: 54 },
  { label: "投资决策", count: 47 },
  { label: "通用方法", count: 40 },
];

export const knowledgeNodes = [
  {
    title: "价值主张",
    desc: "企业为解决客户问题而提供的独特价值，是商业模式的核心。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.3.2",
    related: "18",
    source: "课件 + 案例 + 12份笔记",
    people: "24",
    accent: false,
  },
  {
    title: "客户细分",
    desc: "将客户群体按照共同特征进行细分，以更精准地满足其需求。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.2.1",
    related: "16",
    source: "课件 + 案例 + 8份笔记",
    people: "16",
    accent: false,
  },
  {
    title: "渠道通路",
    desc: "企业如何触达客户、传递价值主张并建立客户关系的路径。",
    status: "待审核",
    statusTone: "bg-orange-50 text-orange-500",
    version: "v1.1.0",
    related: "12",
    source: "课件 + 5份笔记",
    people: "8",
    accent: true,
  },
  {
    title: "客户关系",
    desc: "企业与客户建立和维持的关系类型及互动方式。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.2.0",
    related: "14",
    source: "课件 + 案例 + 6份笔记",
    people: "12",
    accent: false,
  },
  {
    title: "收入来源",
    desc: "企业通过为客户创造价值而获得收入的方式。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.2.3",
    related: "15",
    source: "课件 + 案例 + 10份笔记",
    people: "18",
    accent: false,
  },
  {
    title: "核心资源",
    desc: "企业为创造价值所必须拥有的关键资源。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.1.2",
    related: "11",
    source: "课件 + 7份笔记",
    people: "9",
    accent: false,
  },
  {
    title: "关键活动",
    desc: "企业必须执行的核心活动，以确保商业模式运转。",
    status: "待审核",
    statusTone: "bg-orange-50 text-orange-500",
    version: "v1.0.9",
    related: "10",
    source: "课件 + 3份笔记",
    people: "6",
    accent: false,
  },
  {
    title: "重要伙伴",
    desc: "帮助企业优化商业模式、降低风险或获取资源的外部合作者。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.1.1",
    related: "9",
    source: "课件 + 案例 + 4份笔记",
    people: "7",
    accent: false,
  },
  {
    title: "成本结构",
    desc: "企业为运营商业模式所发生的主要成本构成。",
    status: "已发布",
    statusTone: "bg-emerald-50 text-emerald-600",
    version: "v1.2.2",
    related: "13",
    source: "课件 + 案例 + 6份笔记",
    people: "11",
    accent: false,
  },
];

export const knowledgeAssistantPrompts = [
  "如何判断价值主张是否具有差异化？",
  "有哪些同学笔记补充了客户细分？",
  "这个节点的最新案例有哪些？",
  "帮我找出与“最小可行验证”相关的节点",
];

export const knowledgeHistory = [
  { label: "分析一下这个项目的核心风险", time: "10:23" },
  { label: "帮我找一下与价值主张相关的案例", time: "09:45" },
  { label: "客户细分的常见误区有哪些？", time: "09:12" },
];

export interface GraphNode {
  id: string;
  label?: string;
  x: number;
  y: number;
  r: number;
  group: number;
  hollow?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export const graphGroups = [
  { name: "市场与用户", color: "#2563EB" },
  { name: "产品与服务", color: "#7C3AED" },
  { name: "商业模式", color: "#0EA5A4" },
  { name: "运营与管理", color: "#22C55E" },
  { name: "财务与资源", color: "#3B82F6" },
  { name: "风险与合规", color: "#8B5CF6" },
  { name: "合作与生态", color: "#A855F7" },
];

export const graphNodes: GraphNode[] = [
  { id: "n1", label: "市场分析", x: 195, y: 230, r: 13, group: 0 },
  { id: "n2", label: "用户洞察", x: 290, y: 110, r: 9, group: 0, hollow: true },
  { id: "n3", label: "竞争分析", x: 320, y: 300, r: 9, group: 1, hollow: true },
  { id: "n4", label: "商业模式", x: 420, y: 200, r: 14, group: 2 },
  { id: "n5", label: "产品策略", x: 470, y: 95, r: 9, group: 1, hollow: true },
  { id: "n6", label: "运营配置", x: 470, y: 320, r: 11, group: 3 },
  { id: "n7", label: "收入俯瞰", x: 560, y: 300, r: 11, group: 4 },
  { id: "n8", label: "渠道通路", x: 595, y: 180, r: 14, group: 4 },
  { id: "n9", label: "商业模型", x: 680, y: 110, r: 9, group: 5, hollow: true },
  { id: "n10", label: "资产负债", x: 690, y: 280, r: 9, group: 5, hollow: true },
  { id: "n11", label: "成本风险", x: 690, y: 370, r: 11, group: 4 },
  { id: "n12", label: "盈亏平衡", x: 760, y: 230, r: 13, group: 5 },
  { id: "n13", label: "市场分析", x: 150, y: 350, r: 11, group: 4 },
  { id: "n14", label: "预算预估", x: 845, y: 330, r: 11, group: 3 },
  { id: "n15", x: 850, y: 200, r: 9, group: 6, hollow: true },
  { id: "n16", x: 380, y: 60, r: 7, group: 1 },
  { id: "n17", x: 250, y: 380, r: 6, group: 3 },
];

export const graphEdges: GraphEdge[] = [
  { from: "n1", to: "n2" },
  { from: "n1", to: "n3" },
  { from: "n1", to: "n4" },
  { from: "n1", to: "n13" },
  { from: "n2", to: "n4" },
  { from: "n2", to: "n16" },
  { from: "n3", to: "n6" },
  { from: "n4", to: "n5" },
  { from: "n4", to: "n6" },
  { from: "n4", to: "n8" },
  { from: "n5", to: "n9" },
  { from: "n6", to: "n7" },
  { from: "n7", to: "n8" },
  { from: "n7", to: "n11" },
  { from: "n8", to: "n9" },
  { from: "n8", to: "n12" },
  { from: "n9", to: "n12" },
  { from: "n10", to: "n12" },
  { from: "n11", to: "n14" },
  { from: "n12", to: "n14" },
  { from: "n12", to: "n15" },
  { from: "n13", to: "n6" },
  { from: "n6", to: "n17" },
];
