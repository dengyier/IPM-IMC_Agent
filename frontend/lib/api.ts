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

export interface TianjiMetrics {
  days: number;
  reports: number;
  validation_card_count: number;
  validation_generated_rate: number;
  validation_feedback_rate: number;
  report_generation_rate: number;
  project_revisit_rate: number;
  knowledge_node_reference_rate: number;
  multi_path_coverage_rate: number;
  avg_graph_expanded_nodes: number;
  avg_role_count: number;
  roles_degraded_count: number;
  tianji_deposit_count: number;
  tianji_deposit_approval_rate: number;
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
  tianjiMetrics: (days = 30) =>
    api.get<TianjiMetrics>(`/api/dashboard/tianji-metrics?days=${days}`),
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

// ---- 用户反馈 ----

export type FeedbackCategory = "suggestion" | "problem" | "other";

export interface Feedback {
  id: string;
  category: FeedbackCategory;
  content: string;
  contact: string | null;
  page_url: string | null;
  user_agent: string | null;
  status: "open" | "resolved";
  admin_reply: string | null;
  user_name: string | null;
  user_phone: string | null;
  tenant_id: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export const feedbackApi = {
  create: (payload: {
    category: FeedbackCategory;
    content: string;
    contact?: string;
    page_url?: string;
    user_agent?: string;
  }) =>
    api.post<Feedback>("/api/feedback", payload),
  list: (params?: { status?: "open" | "resolved"; category?: FeedbackCategory; keyword?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    if (params?.keyword?.trim()) qs.set("keyword", params.keyword.trim());
    const query = qs.toString();
    return api.get<Feedback[]>(`/api/feedback${query ? `?${query}` : ""}`);
  },
  updateStatus: (id: string, status: "open" | "resolved", adminReply?: string) =>
    api.patch<Feedback>(`/api/feedback/${id}`, { status, admin_reply: adminReply }),
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
  source_status?: string | null;
  truncated?: boolean;
}

export interface TianjiDecisionFrame {
  decision_objective?: string;
  business_context?: string;
  target_customer?: string;
  current_problem?: string;
  constraints?: string[];
  unknown_assumptions?: string[];
  expected_output?: string;
}

export interface TianjiEvidenceRef {
  type: string;
  ref: string;
  node_id?: string | null;
  summary?: string;
  score?: number | null;
}

export interface TianjiDecisionRole {
  role: string;
  lens?: string;
  key_question?: string;
  likely_position?: string;
  evidence_focus?: string[];
}

export interface TianjiScenarioPath {
  name: string;
  path_type?: string;
  description?: string;
  triggers?: string[];
  leading_indicators?: string[];
  decision_implication?: string;
  probability?: string;
}

export interface TianjiCausalChain {
  chain: string;
  explanation?: string;
  affected_modules?: string[];
  leverage_point?: string;
}

export interface TianjiRiskAuditItem {
  risk: string;
  severity?: string;
  probability?: string;
  early_signal?: string;
  mitigation?: string;
}

export interface TianjiValidationStep {
  step: string;
  objective?: string;
  action?: string;
  success_criteria?: string;
  duration?: string;
}

export interface TianjiAssumptionStatus {
  assumption: string;
  status?: string;
  evidence?: string;
}

export interface TianjiDebatePosition {
  role: string;
  updated_position?: string;
  conflicts_with?: string[];
}

export interface TianjiDebateRound {
  round_index: number;
  positions: TianjiDebatePosition[];
  converged?: boolean;
}

export interface TianjiSimulationResult {
  algorithm_version: string;
  mode: string;
  generated_at?: string;
  confidence?: number;
  decision_frame: TianjiDecisionFrame;
  evidence_refs: TianjiEvidenceRef[];
  decision_roles: TianjiDecisionRole[];
  scenario_paths: TianjiScenarioPath[];
  causal_chains: TianjiCausalChain[];
  risk_audit: TianjiRiskAuditItem[];
  validation_plan: TianjiValidationStep[];
  contradictions: string[];
  assumption_status: TianjiAssumptionStatus[];
  roles_degraded: boolean;
  role_similarity_max: number;
  debate_rounds: TianjiDebateRound[];
  consensus: string[];
  disagreements: string[];
  archive_candidates: string[];
  missing_information: string[];
  used_llm: boolean;
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
  tianji_simulation?: TianjiSimulationResult | null;
}

export type AssistantStreamHandlers = {
  onMeta?: (data: { conversation_id: string }) => void;
  onPhase?: (data: { message: string }) => void;
  onDelta?: (data: { text: string }) => void;
  onFinal?: (data: AssistantAskResponse) => void;
};

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
  source_status?: string | null;
  tianji_simulation?: TianjiSimulationResult | null;
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
    attachments?: AssistantAttachment[],
    projectId?: string | null,
    validationCardId?: string | null
  ) =>
    api.post<AssistantAskResponse>("/api/assistant/ask", {
      question,
      company_context: companyContext,
      conversation_id: conversationId || undefined,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      project_id: projectId || undefined,
      validation_card_id: validationCardId || undefined,
    }),
  askStream: async (
    question: string,
    companyContext?: string,
    conversationId?: string | null,
    attachments?: AssistantAttachment[],
    projectId?: string | null,
    validationCardId?: string | null,
    handlers: AssistantStreamHandlers = {}
  ) => {
    const headers = new Headers({ "Content-Type": "application/json", Accept: "text/event-stream" });
    const token = getStoredAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_BASE}/api/assistant/ask/stream`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        question,
        company_context: companyContext,
        conversation_id: conversationId || undefined,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
        project_id: projectId || undefined,
        validation_card_id: validationCardId || undefined,
      }),
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
        /* 非 JSON 错误体 */
      }
      throw new ApiError(code, detail, res.status, requestId);
    }
    if (!res.body) throw new ApiError("STREAM_UNAVAILABLE", "浏览器未返回流式响应", res.status, requestId);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalReceived = false;

    function dispatchBlock(block: string) {
      const lines = block.split(/\r?\n/);
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
      const dataText = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!dataText) return;
      const data = JSON.parse(dataText);
      if (event === "meta") handlers.onMeta?.(data);
      if (event === "phase") handlers.onPhase?.(data);
      if (event === "delta") handlers.onDelta?.(data);
      if (event === "final") {
        finalReceived = true;
        handlers.onFinal?.(data);
      }
      if (event === "error") {
        throw new ApiError("STREAM_ERROR", data.detail || "流式问答失败", res.status, requestId);
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);
        if (block) dispatchBlock(block);
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) dispatchBlock(buffer.trim());
    if (!finalReceived) {
      throw new ApiError("STREAM_INCOMPLETE", "流式问答未返回完整结果", res.status, requestId);
    }
  },
};

// ---- 经营档案 / 项目 ----

export type ProjectTaskPack = "new_project" | "sales_growth" | "ai_acquisition" | "review";
export type ProjectStatus = "idea" | "validating" | "trial" | "growth" | "paused";

export interface Project {
  id: string;
  name: string;
  industry: string | null;
  target_customer: string;
  current_problem: string;
  task_pack: ProjectTaskPack;
  status: ProjectStatus;
  risk_profile: Record<string, unknown>;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
  report_count: number;
  last_diagnosed_at: string | null;
  planned_investment: string | null;
  decision_deadline: string | null;
}

export interface ProjectCreateRequest {
  name: string;
  industry?: string | null;
  target_customer?: string;
  current_problem?: string;
  task_pack?: ProjectTaskPack;
  planned_investment?: string | null;
  decision_deadline?: string | null;
}

export type ProjectUpdateRequest = Partial<
  Pick<Project, "name" | "industry" | "target_customer" | "current_problem" | "status" | "planned_investment" | "decision_deadline">
>;

export const projectApi = {
  list: () => api.get<Project[]>("/api/projects"),
  detail: (id: string) => api.get<Project>(`/api/projects/${id}`),
  create: (payload: ProjectCreateRequest) => api.post<Project>("/api/projects", payload),
  update: (id: string, payload: ProjectUpdateRequest) =>
    api.patch<Project>(`/api/projects/${id}`, payload),
  remove: (id: string) => api.del<void>(`/api/projects/${id}`),
};

// ---- 验证卡（AI 回答 / 诊断结论 → 可执行验证计划）----

export type ValidationStatus = "draft" | "running" | "completed" | "archived";

export interface ValidationEvidenceItem {
  text: string;
  grade?: 'A' | 'B' | 'C' | 'D' | null;
  source_type?:
    | 'user_interview'
    | 'customer_feedback'
    | 'paid_intent'
    | 'channel_quote'
    | 'cost_estimate'
    | 'market_data'
    | 'expert_opinion'
    | 'document'
    | 'other'
    | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at?: string | null;
}

export interface ValidationAction {
  node_id: string;
  parent_id?: string | null;
  node_type: string;
  branch_condition: string;
  title: string;
  objective: string;
  steps: string[];
  success_metric: string;
  grounded_on: string;
  target: string;
  baseline: string;
  owner?: string | null;
  day_range: string;
  day?: number | null;
  status: "todo" | "running" | "done" | "blocked";
  progress: number;
  evidence_count: number;
  evidence_target: number;
  evidence_grade: "A" | "B" | "C" | "D" | string;
  dependencies: string[];
  unlocks: string[];
  failure_branch?: string | null;
  parallelizable: boolean;
  priority_score: number;
  kill_if_failed: boolean;
  evidence_items?: ValidationEvidenceItem[];
  due_at?: string | null;
  completed_at?: string | null;
}

export interface ValidationDecisionCriteria {
  continue_when: string;
  adjust_when: string;
  pause_when: string;
}

export interface ValidationCard {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  project_id: string | null;
  conversation_id: string | null;
  source_message_id: string | null;
  title: string;
  project_summary: string;
  core_judgment: string;
  biggest_uncertainty: string;
  target_customer: string;
  failure_reason: string;
  actions: ValidationAction[];
  decision_criteria: ValidationDecisionCriteria;
  result?: "achieved" | "not_achieved" | "partially_achieved" | null;
  actual_outcome: string;
  learnings: string;
  validated_at?: string | null;
  node_refs: Record<string, unknown>[];
  meta: Record<string, unknown>;
  status: ValidationStatus;
  created_at: string;
  updated_at: string;
}

export interface ValidationCardCreateRequest {
  project_id?: string | null;
  conversation_id?: string | null;
  source_message_id?: string | null;
  title?: string | null;
  project_description?: string | null;
  target_customer?: string | null;
}

export const validationCardApi = {
  list: (params?: { projectId?: string; status?: ValidationStatus }) => {
    const qs = new URLSearchParams();
    if (params?.projectId) qs.set("project_id", params.projectId);
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString();
    return api.get<ValidationCard[]>(`/api/validation-cards${query ? `?${query}` : ""}`);
  },
  detail: (id: string) => api.get<ValidationCard>(`/api/validation-cards/${id}`),
  create: (payload: ValidationCardCreateRequest) =>
    api.post<ValidationCard>("/api/validation-cards", payload),
  update: (
    id: string,
    payload: Partial<
      Pick<
        ValidationCard,
        | "title"
        | "status"
        | "actions"
        | "decision_criteria"
        | "result"
        | "actual_outcome"
        | "learnings"
        | "validated_at"
      >
    >
  ) =>
    api.patch<ValidationCard>(`/api/validation-cards/${id}`, payload),
  updateAction: (
    id: string,
    actionIndex: number,
    payload: Partial<
      Pick<ValidationAction, "status" | "progress" | "evidence_count" | "evidence_target" | "owner" | "due_at" | "completed_at">
    > & { evidence_note?: string; evidence_item?: ValidationEvidenceItem }
  ) => api.patch<ValidationCard>(`/api/validation-cards/${id}/actions/${actionIndex}`, payload),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return uploadRequest<{ url: string; name: string; size: number }>(
      `/api/validation-cards/${id}/attachments`,
      form
    );
  },
  submitReview: (
    id: string,
    payload: {
      final_decision: "continue" | "adjust" | "pause";
      interview_count?: number;
      paid_intent_count?: number;
      rejection_reasons?: string[];
      channel_quotes?: string[];
      estimated_cac?: string;
      actual_outcome?: string;
      learnings?: string;
    }
  ) => api.post<ValidationCard>(`/api/validation-cards/${id}/review`, payload),
};

// ---- 决策病例库 ----

export interface DecisionCase {
  id: string;
  project_id: string | null;
  validation_card_id: string;
  title: string;
  industry: string | null;
  decision: "继续" | "调整" | "暂停" | string;
  evidence_grade: string;
  planned_investment: string;
  saved_investment_estimate: string;
  biggest_uncertainty: string;
  final_outcome: string;
  key_learning: string;
  failure_patterns: string[];
  assets: { label: string; kind: string }[];
  reviewed_at: string | null;
}

export const decisionCaseApi = {
  list: (limit = 20) => api.get<DecisionCase[]>(`/api/decision-cases?limit=${limit}`),
};

// ---- 验证工作台（首页聚合视图）----

export interface WorkbenchProject {
  id: string | null;
  name: string;
  industry: string | null;
  current_problem: string;
  target_customer: string;
  task_pack: ProjectTaskPack;
  status: ProjectStatus;
  planned_investment: string | null;
  decision_deadline: string | null;
  updated_at: string | null;
}

export interface WorkbenchTimelineItem {
  day: number;
  label: string;
  status: "done" | "current" | "pending";
}

export interface WorkbenchAction {
  node_id: string;
  parent_id?: string | null;
  node_type: string;
  branch_condition: string;
  title: string;
  objective: string;
  success_metric: string;
  grounded_on: string;
  target: string;
  baseline: string;
  owner: string | null;
  day_range: string;
  status: "todo" | "running" | "done" | "blocked" | string;
  progress: number;
  evidence_count: number;
  evidence_target: number;
  missing_evidence_count: number;
  evidence_grade: "A" | "B" | "C" | "D" | string;
  dependencies: string[];
  unlocks: string[];
  failure_branch?: string | null;
  parallelizable: boolean;
  priority_score: number;
  kill_if_failed: boolean;
  evidence_items: ValidationEvidenceItem[];
}

export interface WorkbenchColdReview {
  verdict: string;
  confidence: number;
  reasons: string[];
  risk_level: "low" | "medium" | "high" | string;
}

export interface WorkbenchEvidenceStatus {
  existing: number;
  missing: number;
  pending: number;
  grade: string;
}

export interface WorkbenchCaseAsset {
  label: string;
  status: "pending" | "ready" | string;
}

export interface WorkbenchBachHypothesis {
  id: string;
  statement: string;
  dimension: string;
  probability: number;
  impact_weight: number;
  status: string;
}

export interface WorkbenchBachSnapshot {
  verdict: string;
  probability: number;
  kill_criteria: Record<string, unknown>[];
  hypotheses: WorkbenchBachHypothesis[];
  replay_consistent: boolean;
}

export interface WorkbenchWorldModel {
  player_role: string;
  main_quest: string;
  resource_gaps: string[];
  active_rules: string[];
  risk_signals: string[];
  next_quests: string[];
}

export interface WorkbenchSummary {
  has_data: boolean;
  current_project: WorkbenchProject | null;
  current_card_id: string | null;
  current_day: number;
  total_days: number;
  final_decision: string;
  next_action: string;
  evidence_updated_at: string | null;
  timeline: WorkbenchTimelineItem[];
  actions: WorkbenchAction[];
  cold_review: WorkbenchColdReview;
  evidence_status: WorkbenchEvidenceStatus;
  case_assets: WorkbenchCaseAsset[];
  bach: WorkbenchBachSnapshot | null;
  world_model: WorkbenchWorldModel;
}

export const workbenchApi = {
  summary: () => api.get<WorkbenchSummary>("/api/workbench/summary"),
};

// ---- Tianji-BACH v2 审计视图 ----

export interface TianjiBachHypothesis {
  id: string;
  statement: string;
  dimension: string;
  falsified_by: string;
  validated_by: string;
  prior_logodds: number;
  current_logodds: number;
  probability: number;
  impact_weight: number;
  structural_weight: number;
  decisive: boolean;
  status: string;
}

export interface TianjiBachEvidence {
  id: string;
  hypothesis_id: string;
  content: string;
  source_type: string;
  source_ref: string;
  grade: string;
  log_lr_raw: number;
  log_lr_effective: number;
  reviewer_spread: number;
  review_detail: Record<string, unknown>;
  created_at: string | null;
}

export interface TianjiBachPrediction {
  id: string;
  verdict: string;
  probability: number;
  probability_raw: number;
  kill_criteria: Record<string, unknown>[];
  outcome: number | null;
  brier: number | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface TianjiBachCase {
  case_id: string;
  algorithm_version: string;
  adjudication: {
    probability: number;
    verdict: string;
    vetoed_by: string | null;
    reasons: string[];
    kill_criteria: Record<string, unknown>[];
  } | null;
  hypotheses: TianjiBachHypothesis[];
  evidence: TianjiBachEvidence[];
  predictions: TianjiBachPrediction[];
  replay_logodds: Record<string, number>;
  replay_consistent: boolean;
  sandbox: TianjiSandboxResult | null;
}

export interface TianjiSandboxTornadoItem {
  param: string;
  label: string;
  p_at_min: number;
  p_at_max: number;
  swing: number;
}

export interface TianjiSandboxResult {
  available: boolean;
  missing: string[];
  investment: number | null;
  target_months: number | null;
  simulations: number;
  params: Record<string, { label: string; min: number; mode: number; max: number }>;
  p_payback: number | null;
  loss_probability: number | null;
  payback_p50: number | null;
  payback_p90: number | null;
  tornado: TianjiSandboxTornadoItem[];
  generated_at: string | null;
}

export const tianjiBachApi = {
  case: (cardId: string) => api.get<TianjiBachCase>(`/api/tianji-bach/cases/${cardId}`),
  runSandbox: (cardId: string) => api.post<TianjiSandboxResult>(`/api/tianji-bach/cases/${cardId}/sandbox`, {}),
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

// ---- 诊断报告（项目验证诊断产出）----

export interface DiagnosisReport {
  id: string;
  project_id: string | null;
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
  decision_frame: Record<string, unknown>;
  decision_roles: Record<string, unknown>[];
  scenario_paths: Record<string, unknown>[];
  causal_chains: Record<string, unknown>[];
  tianji_risk_audit: Record<string, unknown>[];
  validation_plan: Record<string, unknown>[];
  contradictions?: string[];
  assumption_status?: Record<string, unknown>[];
  roles_degraded?: boolean;
  role_similarity_max?: number;
  debate_rounds?: Record<string, unknown>[];
  consensus?: string[];
  disagreements?: string[];
  archive_candidates: unknown[];
  algorithm_version: string | null;
  tianji_deposited_source_id?: string | null;
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
  project_id?: string | null;
  task_pack?: ProjectTaskPack;
}

export const diagnosisApi = {
  // 长任务：返回 task_id，用 pollTask<DiagnoseResult> 轮询
  create: (req: DiagnoseRequest) => api.post<TaskCreated>("/api/diagnosis/diagnose", req),
};

export interface ReportDepositSimulationResult {
  report_id: string;
  source_id: string;
  title: string;
  status: string;
  item_count: number;
  review_task_count: number;
  message: string;
}

export const reportsApi = {
  list: () => api.get<DiagnosisReport[]>("/api/diagnosis/reports"),
  detail: (id: string) => api.get<DiagnosisReport>(`/api/diagnosis/reports/${id}`),
  quality: (id: string) =>
    api.get<QualityCheck>(`/api/diagnosis/reports/${id}/quality`),
  // 把报告的天机推演资产沉淀为候选资料（进入人工审核，幂等）
  depositSimulation: (id: string) =>
    api.post<ReportDepositSimulationResult>(`/api/diagnosis/reports/${id}/deposit-simulation`, {}),
  // 异步：返回 task_id，用 pollTask<DiagnoseResult> 轮询，结果含新 report
  regenerate: (id: string) =>
    api.post<TaskCreated>(`/api/diagnosis/reports/${id}/regenerate`),
  remove: (id: string) => api.del<void>(`/api/diagnosis/reports/${id}`),
};
