// 统一 API 客户端。后端成功返回裸数据 / {items,total}；错误返回 {error:{code,detail}}。
// base url 由 NEXT_PUBLIC_API_BASE 注入（见 .env.local），默认本地 18005。

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:18005";

export class ApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  constructor(code: string, detail: string, status: number, requestId?: string) {
    super(detail);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export const AUTH_TOKEN_KEY = "imc_ipm_auth_token";

function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getStoredAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const requestId = res.headers.get("X-Request-Id") || undefined;

  if (!res.ok) {
    let code = "HTTP_ERROR";
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code ?? code;
        detail = body.error.detail ?? detail;
      }
    } catch {
      /* 非 JSON 错误体，沿用 statusText */
    }
    throw new ApiError(code, detail, res.status, requestId);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// 文件上传（multipart/form-data）。不可走 request()，因为它强制 JSON Content-Type；
// 这里让浏览器自动带 boundary。
async function uploadRequest<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers();
  const token = getStoredAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  const requestId = res.headers.get("X-Request-Id") || undefined;
  if (!res.ok) {
    let code = "HTTP_ERROR";
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code ?? code;
        detail = body.error.detail ?? detail;
      }
    } catch {
      /* 非 JSON */
    }
    throw new ApiError(code, detail, res.status, requestId);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- 异步长任务（process / build-kernel / diagnose 统一走任务轮询）----

export type TaskStatus = "pending" | "running" | "succeeded" | "failed";

// 长任务接口的即时返回
export interface TaskCreated {
  task_id: string;
  status: TaskStatus;
}

// GET /api/tasks/{id} 轮询返回；result 形态随 task_type 而定（泛型）
export interface Task<R = unknown> {
  id: string;
  task_type: string;
  status: TaskStatus;
  progress: number;
  resource_id: string | null;
  result: R | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const tasksApi = {
  get: <R = unknown>(id: string) => api.get<Task<R>>(`/api/tasks/${id}`),
  list: (taskType?: string, limit = 20) => {
    const qs = new URLSearchParams();
    if (taskType) qs.set("task_type", taskType);
    qs.set("limit", String(limit));
    return api.get<Task[]>(`/api/tasks?${qs.toString()}`);
  },
};

/**
 * 轮询一个长任务直至终态（succeeded / failed），返回完整 Task。
 * - 终态为 failed 时抛 ApiError(TASK_FAILED)，调用方可统一捕获展示。
 * - onProgress 回调可用于驱动进度条 / 状态文案。
 */
export async function pollTask<R = unknown>(
  taskId: string,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (task: Task<R>) => void;
    signal?: AbortSignal;
  } = {}
): Promise<Task<R>> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000; // 建图可能很久，默认 10 分钟
  const start = Date.now();

  for (;;) {
    if (opts.signal?.aborted) {
      throw new ApiError("ABORTED", "轮询已取消", 0);
    }
    const task = await tasksApi.get<R>(taskId);
    opts.onProgress?.(task);

    if (task.status === "succeeded") return task;
    if (task.status === "failed") {
      throw new ApiError("TASK_FAILED", task.error || "任务执行失败", 0);
    }
    if (Date.now() - start > timeoutMs) {
      throw new ApiError("TASK_TIMEOUT", "任务轮询超时", 0);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---- 类型（与后端 schema 对齐）----

export interface SystemStatus {
  database: string;
  qdrant: string;
  llm: string;
  embedding: string;
}

export interface DashboardSummary {
  methodology_sources: number;
  expansion_sources: number;
  chunks: number;
  nodes: number;
  edges: number;
  routing_rules: number;
  expansion_items: number;
  pending_reviews: number;
  reports: number;
  system_status: SystemStatus;
}

export interface RecentReport {
  id: string;
  title: string;
  created_at: string | null;
  quality_score: number;
  status: string;
}

export interface RecentReviewTask {
  id: string;
  task_type: string;
  status: string;
  created_at: string | null;
}

// 待处理事项桶（后端只给 key+count，前端映射文案/图标/颜色/跳转）
export interface PendingItem {
  key: string; // review | sources | reports
  count: number;
}

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/api/dashboard/summary"),
  pendingItems: () => api.get<PendingItem[]>("/api/dashboard/pending-items"),
  recentReports: (limit = 8) =>
    api.get<RecentReport[]>(`/api/dashboard/recent-reports?limit=${limit}`),
  recentReviewTasks: (limit = 8) =>
    api.get<RecentReviewTask[]>(`/api/dashboard/recent-review-tasks?limit=${limit}`),
};

// ---- 认证 / 手机验证码登录 ----

export interface AuthUser {
  id: string;
  phone: string;
  display_name: string;
  role: string;
  user_type: string;
  tenant_id: string | null;
  tenant_name: string | null;
  is_super_admin: boolean;
  can_review: boolean;
  created_at: string | null;
  last_login_at: string | null;
}

export interface SendSmsCodeResponse {
  sent: boolean;
  expires_in_seconds: number;
  resend_after_seconds: number;
}

export interface AuthLoginResponse {
  token: string;
  token_type: "Bearer";
  expires_at: string;
  user: AuthUser;
}

export const authApi = {
  sendSmsCode: (phone: string) =>
    api.post<SendSmsCodeResponse>("/api/auth/sms/send", { phone }),
  loginWithSms: (phone: string, code: string) =>
    api.post<AuthLoginResponse>("/api/auth/login/sms", { phone, code }),
  me: () => api.get<AuthUser>("/api/auth/me"),
  updateMe: (payload: { display_name: string }) => api.patch<AuthUser>("/api/auth/me", payload),
  logout: () => api.post<void>("/api/auth/logout"),
};

// ---- 智能助手 ----

export interface AssistantNodeRef {
  id: string;
  name: string;
  category: string | null;
  score: number;
}

export interface AssistantAttachment {
  name: string;
  chars?: number | null;
  file_id?: string | null;
  chunk_count?: number | null;
  status?: string | null;
  deposited_source_id?: string | null;
  item_count?: number | null;
  review_task_count?: number | null;
  truncated?: boolean;
}

export interface AssistantAskResponse {
  conversation_id: string;
  assistant_message_id: string | null;
  answer: string;
  intent: string;
  used_llm: boolean;
  action_label: string | null;
  action_href: string | null;
  node_refs: AssistantNodeRef[];
  suggested_questions: string[];
}

export interface AssistantMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AssistantAttachment[];
  node_refs: AssistantNodeRef[];
  suggested_questions: string[];
  used_llm: boolean;
  action_label: string | null;
  action_href: string | null;
  deposited_source_id?: string | null;
  item_count?: number | null;
  review_task_count?: number | null;
  created_at: string;
}

export interface AssistantConversationRecord {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  created_at: string;
}

export interface AssistantParseFileResult {
  file_id: string;
  conversation_id: string;
  filename: string;
  chars: number;
  chunk_count: number;
  status: string;
  truncated: boolean;
  text: string;
}

export interface AssistantDepositFileResult {
  file_id: string;
  source_id: string;
  title: string;
  status: string;
  chunk_count: number;
  embedded_count: number;
  item_count: number;
  review_task_count: number;
  vector_backend: string | null;
  message: string;
}

export interface AssistantDepositMessageResult {
  message_id: string;
  source_id: string;
  title: string;
  status: string;
  chunk_count: number;
  embedded_count: number;
  item_count: number;
  review_task_count: number;
  vector_backend: string | null;
  message: string;
}

export const assistantApi = {
  conversations: () =>
    api.get<AssistantConversationRecord[]>("/api/assistant/conversations"),
  parseFile: (file: File, conversationId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (conversationId) form.append("conversation_id", conversationId);
    return uploadRequest<AssistantParseFileResult>("/api/assistant/parse-file", form);
  },
  createConversation: (title?: string) =>
    api.post<AssistantConversationRecord>("/api/assistant/conversations", { title }),
  deleteConversation: (id: string) =>
    api.del<void>(`/api/assistant/conversations/${id}`),
  depositFile: (fileId: string, payload?: { title?: string; source_type?: string; visibility?: string }) =>
    api.post<AssistantDepositFileResult>(`/api/assistant/files/${fileId}/deposit`, payload || {}),
  depositMessage: (messageId: string, payload?: { title?: string; source_type?: string; visibility?: string }) =>
    api.post<AssistantDepositMessageResult>(`/api/assistant/messages/${messageId}/deposit`, payload || {}),
  messages: (conversationId?: string) =>
    api.get<AssistantMessageRecord[]>(
      `/api/assistant/messages${conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : ""}`
    ),
  ask: (
    question: string,
    companyContext?: string,
    conversationId?: string | null,
    attachments?: AssistantAttachment[]
  ) =>
    api.post<AssistantAskResponse>("/api/assistant/ask", {
      question,
      company_context: companyContext,
      conversation_id: conversationId || undefined,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    }),
};

// ---- 系统健康 / 连接测试 / 只读配置 ----

export type ComponentStatus = "ok" | "offline_fallback" | "error" | "offline";

export interface ComponentHealth {
  key: string; // database / qdrant / llm / embedding
  label: string;
  status: ComponentStatus;
  detail: string;
  meta: Record<string, unknown>;
}

export interface SystemHealth {
  status: ComponentStatus; // 总体（取最差）
  app_name: string;
  environment: string;
  version: string;
  components: ComponentHealth[];
}

export interface LLMTestResult {
  ok: boolean;
  model: string;
  latency_ms: number | null;
  detail: string;
}

export interface VectorStoreTestResult {
  ok: boolean;
  backend: string; // qdrant / memory
  collection: string;
  vector_size: number;
  point_count: number | null;
  latency_ms: number | null;
  detail: string;
}

export interface SettingsView {
  app_name: string;
  environment: string;
  database_backend: string;
  qdrant_url: string;
  vector_backend: string;
  methodology_core_collection: string;
  expansion_collection: string;
  deepseek_base_url: string;
  deepseek_model: string;
  deepseek_api_key_masked: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_dim: number;
  embedding_api_key_masked: string;
}

export interface EditableSystemSettings {
  system_name: string;
  system_short_name: string;
  system_version: string;
  deployment_environment: string;
  deployed_at: string;
  timezone: string;
  company_name: string;
  company_short_name: string;
  company_website: string;
  language: string;
  date_format: string;
  time_format: string;
  number_format: string;
  currency: string;
  theme_mode: string;
  accent_color: string;
  nav_density: string;
  allow_registration: boolean;
  require_2fa: boolean;
  require_email_verification: boolean;
  audit_log_enabled: boolean;
  auto_backup_enabled: boolean;
  backup_retention_days: number;
  updated_at: string | null;
}

export type EditableSystemSettingsUpdate = Partial<
  Omit<EditableSystemSettings, "updated_at">
>;

export const systemApi = {
  health: () => api.get<SystemHealth>("/api/system/health"),
  testLlm: () => api.post<LLMTestResult>("/api/system/test-llm"),
  testVectorStore: () =>
    api.post<VectorStoreTestResult>("/api/system/test-vector-store"),
  settings: () => api.get<SettingsView>("/api/system/settings"),
  editableSettings: () =>
    api.get<EditableSystemSettings>("/api/system/editable-settings"),
  updateEditableSettings: (payload: EditableSystemSettingsUpdate) =>
    api.put<EditableSystemSettings>("/api/system/editable-settings", payload),
};

// ---- 知识节点库 ----

export interface NodeCard {
  id: string;
  node_name: string;
  node_category: string | null;
  definition: string;
  status: string;
  version: string;
  edge_count: number;
  expansion_count: number;
  source_chunk_count: number;
  source_types: string[];
}

export interface PaginatedNodes {
  items: NodeCard[];
  total: number;
  page: number;
  page_size: number;
}

export interface NodeCategory {
  label: string;
  count: number;
}

export interface NodeFilterOption {
  label: string;
  value: string;
  count: number;
}

export interface NodeFilterOptions {
  statuses: NodeFilterOption[];
  source_types: NodeFilterOption[];
  scenarios: NodeFilterOption[];
  versions: NodeFilterOption[];
}

export interface NodeDetail extends NodeCard {
  core_principle: string;
  core_thinking: string;
  decision_logic: string[];
  key_questions: string[];
  common_mistakes: string[];
  applicable_scenarios: string[];
  source_chunk_ids: string[];
  visibility: string;
  authority_level: number;
  created_at: string;
  updated_at: string;
}

export interface NodeEdge {
  id: string;
  relation_type: string;
  relation_description: string | null;
  weight: number;
  direction: "outgoing" | "incoming";
  neighbor_id: string;
  neighbor_name: string;
}

export interface NodeVersion {
  id: string;
  version: string;
  change_type: string;
  change_summary: string;
  supplementary_context: string;
  incorporated_item_ids: string[];
  status: string;
  created_at: string;
}

export interface NodeExpansion {
  id: string;
  extension_type: string;
  title: string;
  summary: string;
  alignment_score: number;
  review_status: string;
  created_at: string;
}

export interface MethodologyGraphNode {
  id: string;
  node_name: string;
  node_category: string | null;
  degree: number;
}

export interface MethodologyGraphEdge {
  source: string;
  target: string;
  relation_type: string;
}

export interface MethodologyGraph {
  nodes: MethodologyGraphNode[];
  edges: MethodologyGraphEdge[];
  total_nodes: number;
  total_edges: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export const nodesApi = {
  list: (
    params: {
      category?: string;
      q?: string;
      status?: string;
      sourceType?: string;
      scenario?: string;
      version?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.sourceType) qs.set("source_type", params.sourceType);
    if (params.scenario) qs.set("scenario", params.scenario);
    if (params.version) qs.set("version", params.version);
    qs.set("page", String(params.page ?? 1));
    qs.set("page_size", String(params.pageSize ?? 20));
    return api.get<PaginatedNodes>(`/api/methodology/nodes?${qs.toString()}`);
  },
  categories: (top = 8) =>
    api.get<NodeCategory[]>(`/api/methodology/nodes/categories?top=${top}`),
  filterOptions: () => api.get<NodeFilterOptions>("/api/methodology/nodes/filter-options"),
  detail: (id: string) => api.get<NodeDetail>(`/api/methodology/nodes/${id}`),
  edges: (id: string) => api.get<NodeEdge[]>(`/api/methodology/nodes/${id}/edges`),
  versions: (id: string) =>
    api.get<NodeVersion[]>(`/api/methodology/nodes/${id}/versions`),
  expansions: (id: string) =>
    api.get<NodeExpansion[]>(`/api/methodology/nodes/${id}/expansions`),
  graph: (limit = 40, offset = 0) =>
    api.get<MethodologyGraph>(`/api/methodology/graph?limit=${limit}&offset=${offset}`),
};

// ---- 扩展条目 / 人工审核（外部信息进化）----

export interface ExpansionItem {
  id: string;
  source_id: string;
  chunk_id: string | null;
  extension_type: string;
  title: string;
  content: string;
  summary: string;
  key_points: string[];
  aligned_node_id: string | null;
  alignment_score: number;
  review_status: string;
  visibility: string;
  created_at: string;
}

export interface ExpansionSourceBrief {
  id: string;
  title: string;
  source_type: string;
  submitted_by: string | null;
  visibility: string;
  created_at: string;
}

export interface AlignedNodeBrief {
  id: string;
  node_name: string;
  node_category: string | null;
  version: string;
}

// 扩展条目详情 = 列表字段 + 内联来源 + 对齐节点
export interface ExpansionItemDetail extends ExpansionItem {
  source: ExpansionSourceBrief | null;
  aligned_node: AlignedNodeBrief | null;
}

export interface ReviewTask {
  id: string;
  item_id: string;
  task_type: string;
  status: string;
  reviewer: string | null;
  decision_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// 审核任务详情 = 任务字段 + 完整扩展条目详情
export interface ReviewTaskDetail extends ReviewTask {
  item: ExpansionItemDetail | null;
}

export type ReviewDecision = "approved" | "rejected" | "revise_required";

export interface ReviewDecisionResult {
  task_id: string;
  item_id: string;
  status: string;
  node_version_id: string | null;
  message: string;
}

export interface BulkReviewDecisionResult {
  decision: string;
  requested_count: number;
  updated_count: number;
  skipped_count: number;
  node_version_ids: string[];
  message: string;
}

export const expansionApi = {
  items: (params: { reviewStatus?: string; alignedNodeId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.reviewStatus) qs.set("review_status", params.reviewStatus);
    if (params.alignedNodeId) qs.set("aligned_node_id", params.alignedNodeId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<ExpansionItem[]>(`/api/expansion/items${suffix}`);
  },
  item: (id: string) => api.get<ExpansionItemDetail>(`/api/expansion/items/${id}`),
  sources: () => api.get<ExpansionSource[]>("/api/expansion/sources"),
  uploadSource: (file: File, meta: { title?: string; source_type?: string; submitted_by?: string; visibility?: string } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (meta.title) form.append("title", meta.title);
    if (meta.source_type) form.append("source_type", meta.source_type);
    if (meta.submitted_by) form.append("submitted_by", meta.submitted_by);
    if (meta.visibility) form.append("visibility", meta.visibility);
    return uploadRequest<UploadSourceResult>("/api/expansion/sources/upload", form);
  },
  absorb: (id: string) =>
    api.post<AbsorbResult>(`/api/expansion/sources/${id}/absorb`),
};

// ---- 资料中心：核心方法论资料 + 外部扩展资料 ----

export interface MethodologySource {
  id: string;
  title: string;
  source_type: string;
  course_session: string | null;
  source_layer: string;
  visibility: string;
  authority_level: number;
  status: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ExpansionSource {
  id: string;
  title: string;
  source_type: string;
  url: string | null;
  submitted_by: string | null;
  source_layer: string;
  visibility: string;
  authority_level: number;
  status: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface UploadSourceResult {
  source_id: string;
  title: string;
  status: string;
  message: string;
}

export interface AbsorbResult {
  source_id: string;
  status: string;
  chunk_count: number;
  embedded_count: number;
  item_count: number;
  review_task_count: number;
  vector_backend: string;
  trace: string[];
}

export const methodologyApi = {
  sources: () => api.get<MethodologySource[]>("/api/methodology/sources"),
  uploadSource: (file: File, meta: { title?: string; source_type?: string; course_session?: string } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (meta.title) form.append("title", meta.title);
    if (meta.source_type) form.append("source_type", meta.source_type);
    if (meta.course_session) form.append("course_session", meta.course_session);
    return uploadRequest<UploadSourceResult>("/api/methodology/sources/upload", form);
  },
  process: (id: string) =>
    api.post<TaskCreated>(`/api/methodology/sources/${id}/process`),
  buildKernel: (id: string) =>
    api.post<TaskCreated>(`/api/methodology/sources/${id}/build-kernel`),
};

export const reviewApi = {
  tasks: (status = "pending") =>
    api.get<ReviewTask[]>(`/api/review/tasks?status=${status}`),
  task: (id: string) => api.get<ReviewTaskDetail>(`/api/review/tasks/${id}`),
  decide: (
    id: string,
    payload: {
      decision: ReviewDecision;
      reviewer?: string;
      comment?: string;
      evolve_on_approve?: boolean;
    }
  ) => api.post<ReviewDecisionResult>(`/api/review/tasks/${id}/decide`, payload),
  bulkDecide: (payload: {
    decision: Exclude<ReviewDecision, "revise_required">;
    task_ids: string[];
    reviewer?: string;
    comment?: string;
    evolve_on_approve?: boolean;
  }) => api.post<BulkReviewDecisionResult>("/api/review/tasks/bulk-decide", payload),
};

// ---- 诊断报告（商业画布诊断产出）----

export interface DiagnosisReport {
  id: string;
  title: string;
  company_name: string | null;
  question: string;
  intent: string | null;
  report_depth: string;
  canvas_input: Record<string, string>;
  module_findings: Record<string, unknown>;
  executive_summary: Record<string, unknown>;
  core_tensions: Record<string, unknown>[];
  cross_canvas_logic: Record<string, unknown>[];
  unit_economics: Record<string, unknown>;
  risk_matrix: Record<string, unknown>[];
  mvp_validation_path: Record<string, unknown>[];
  ninety_day_plan: Record<string, unknown>;
  final_recommendation: Record<string, unknown>;
  key_assumptions: string[];
  risks: string[];
  recommended_actions: string[];
  evidence_refs: unknown[];
  methodology_node_ids: string[];
  overall_summary: string;
  quality_score: number;
  status: string;
  used_llm: boolean;
  created_at: string;
  updated_at: string;
}

export interface QualityCheck {
  id: string;
  report_id: string;
  overall_score: number;
  dimension_scores: Record<string, number>;
  passed: boolean;
  issues: string[];
  suggestions: string[];
  created_at: string;
}

// diagnose / regenerate 的异步结果（pollTask 的 R 形态）
export interface DiagnoseResult {
  report: DiagnosisReport;
  quality: QualityCheck;
  used_llm: boolean;
  trace: string[];
}

export interface DiagnoseRequest {
  title: string;
  question?: string;
  company_name?: string | null;
  report_depth?: "basic" | "standard" | "consulting";
  canvas: Record<string, string>;
}

export const diagnosisApi = {
  // 长任务：返回 task_id，用 pollTask<DiagnoseResult> 轮询
  create: (req: DiagnoseRequest) => api.post<TaskCreated>("/api/diagnosis/diagnose", req),
};

export const reportsApi = {
  list: () => api.get<DiagnosisReport[]>("/api/diagnosis/reports"),
  detail: (id: string) => api.get<DiagnosisReport>(`/api/diagnosis/reports/${id}`),
  quality: (id: string) =>
    api.get<QualityCheck>(`/api/diagnosis/reports/${id}/quality`),
  // 异步：返回 task_id，用 pollTask<DiagnoseResult> 轮询，结果含新 report
  regenerate: (id: string) =>
    api.post<TaskCreated>(`/api/diagnosis/reports/${id}/regenerate`),
  remove: (id: string) => api.del<void>(`/api/diagnosis/reports/${id}`),
};
