"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "./icon";
import type { AssistantAttachment, Project, ValidationCard, ValidationEvidenceItem } from "@/lib/api";
import { ApiError, assistantApi, projectApi, validationCardApi } from "@/lib/api";
import { suggestionChips } from "@/lib/data";
import { useAssistant } from "./assistant-context";
import { useAuth } from "./auth-context";
import { cn } from "@/lib/utils";

// AI经营访谈对话工作区：左侧全局导航之外的「中·对话主区 + 右·会话列表（可收起）」。

function titleFromQuestion(question: string): string {
  const title = question.trim().replace(/\s+/g, " ");
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function isPlaceholderTitle(title?: string | null): boolean {
  return !title || ["新会话", "历史会话"].includes(title.trim());
}

function titleFromActiveMessages(messages: ReturnType<typeof useAssistant>["messages"]): string | null {
  const firstUserMessage = messages.find((message) => message.role === "user");
  return firstUserMessage ? titleFromQuestion(firstUserMessage.content) : null;
}

type PendingAttachment = {
  fileId: string;
  name: string;
  chars: number;
  chunkCount: number;
  status: string;
};

function buildProjectCompanyContext(project: Project | null): string | undefined {
  if (!project) return undefined;
  const rows = [
    `项目名称：${project.name}`,
    project.industry ? `行业/场景：${project.industry}` : null,
    project.target_customer ? `目标客户：${project.target_customer}` : null,
    project.current_problem ? `当前核心问题：${project.current_problem}` : null,
    project.task_pack ? `任务包：${project.task_pack}` : null,
    project.status ? `项目状态：${project.status}` : null,
  ].filter(Boolean);
  return `当前经营档案上下文：\n${rows.join("\n")}`;
}

type EvidenceSourceType = NonNullable<ValidationEvidenceItem["source_type"]>;
type EvidenceGrade = NonNullable<ValidationEvidenceItem["grade"]>;

const evidenceSourceOptions: { value: EvidenceSourceType; label: string }[] = [
  { value: "user_interview", label: "经营访谈" },
  { value: "customer_feedback", label: "客户反馈" },
  { value: "paid_intent", label: "付费/预约" },
  { value: "channel_quote", label: "渠道报价" },
  { value: "cost_estimate", label: "成本估算" },
  { value: "market_data", label: "市场数据" },
  { value: "expert_opinion", label: "专家意见" },
  { value: "document", label: "文档材料" },
  { value: "other", label: "其他" },
];

const evidenceGradeOptions: { value: EvidenceGrade; label: string }[] = [
  { value: "A", label: "A 强证据" },
  { value: "B", label: "B 较强" },
  { value: "C", label: "C 一般" },
  { value: "D", label: "D 弱证据" },
];

function compactMessageForEvidence(content: string): string {
  const clean = content.trim().replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return clean.length > 900 ? `${clean.slice(0, 900)}...` : clean;
}

function defaultActionIndex(card: ValidationCard | null): number {
  if (!card?.actions?.length) return 0;
  const missingIndex = card.actions.findIndex((action) => {
    const target = Number(action.evidence_target || 0);
    const count = Number(action.evidence_count || action.evidence_items?.length || 0);
    return action.status !== "done" && target > 0 && count < target;
  });
  if (missingIndex >= 0) return missingIndex;
  const activeIndex = card.actions.findIndex((action) => action.status !== "done");
  return activeIndex >= 0 ? activeIndex : 0;
}

function useActiveValidationCard(validationCardId?: string | null) {
  const [validationCard, setValidationCard] = useState<ValidationCard | null>(null);
  const [validationCardError, setValidationCardError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!validationCardId) {
      setValidationCard(null);
      setValidationCardError(null);
      return;
    }
    setValidationCardError(null);
    validationCardApi
      .detail(validationCardId)
      .then((card) => {
        if (!cancelled) setValidationCard(card);
      })
      .catch((error) => {
        if (!cancelled) {
          setValidationCard(null);
          setValidationCardError(error instanceof ApiError ? error.message : "验证任务读取失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [validationCardId]);

  return { validationCard, setValidationCard, validationCardError };
}

export function HomeWorkspace({
  initialProjectId = null,
  initialValidationCardId = null,
  initialFocus = false,
}: {
  initialProjectId?: string | null;
  initialValidationCardId?: string | null;
  initialFocus?: boolean;
}) {
  const [convOpen, setConvOpen] = useState(false);
  const [projectContext, setProjectContext] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    setConvOpen(desktopQuery.matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!initialProjectId) {
      setProjectContext(null);
      setProjectError(null);
      return;
    }
    setProjectLoading(true);
    setProjectError(null);
    projectApi
      .detail(initialProjectId)
      .then((project) => {
        if (!cancelled) setProjectContext(project);
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectContext(null);
          setProjectError(error instanceof ApiError ? error.message : "经营档案加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProjectId]);

  const projectCompanyContext = useMemo(
    () => buildProjectCompanyContext(projectContext),
    [projectContext]
  );

  return (
    <div className="relative flex h-dvh min-w-0 flex-1 overflow-hidden md:h-screen">
      <ChatMain
        convOpen={convOpen}
        onToggleConv={() => setConvOpen((v) => !v)}
        projectContext={projectContext}
        projectLoading={projectLoading}
        projectError={projectError}
        projectCompanyContext={projectCompanyContext}
        validationCardId={initialValidationCardId}
        initialFocus={initialFocus}
      />
      {convOpen && <ConversationPanel onCollapse={() => setConvOpen(false)} />}
    </div>
  );
}

function ChatMain({
  convOpen,
  onToggleConv,
  projectContext,
  projectLoading,
  projectError,
  projectCompanyContext,
  validationCardId,
  initialFocus,
}: {
  convOpen: boolean;
  onToggleConv: () => void;
  projectContext: Project | null;
  projectLoading: boolean;
  projectError: string | null;
  projectCompanyContext?: string;
  validationCardId?: string | null;
  initialFocus?: boolean;
}) {
  const {
    input,
    messages,
    conversations,
    activeConversationId,
    loading,
    historyLoading,
    setInput,
    sendQuestion,
    ensureActiveConversation,
    depositAttachment,
    depositMessage,
  } = useAssistant();
  const { user } = useAuth();
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [depositingFileId, setDepositingFileId] = useState<string | null>(null);
  const [depositingMessageId, setDepositingMessageId] = useState<string | null>(null);
  const canSend = input.trim().length > 0 && !loading && !attaching;
  const streamingMessageActive = loading && messages[messages.length - 1]?.id.startsWith("a-stream-");
  const hasConversation = messages.some((message) => message.role === "user");
  const {
    validationCard: activeValidationCard,
    setValidationCard: setActiveValidationCard,
    validationCardError,
  } = useActiveValidationCard(validationCardId);
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );
  const activeConversationTitle = useMemo(() => {
    if (!activeConversation) return "";
    if (!isPlaceholderTitle(activeConversation.title)) return activeConversation.title;
    return titleFromActiveMessages(messages) || activeConversation.title;
  }, [activeConversation, messages]);

  useEffect(() => {
    if (initialFocus) setFocusOpen(true);
  }, [initialFocus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, historyLoading]);

  async function handlePickFile(file: File) {
    setAttaching(true);
    setAttachError(null);
    try {
      const conversationId = await ensureActiveConversation();
      const res = await assistantApi.parseFile(file, conversationId);
      if (!res.file_id || res.chunk_count <= 0) {
        setAttachError("未能从该文件解析出可追问内容。");
        return;
      }
      setAttachment({
        fileId: res.file_id,
        name: res.filename || file.name,
        chars: res.chars,
        chunkCount: res.chunk_count,
        status: res.status,
      });
    } catch (e) {
      setAttachError(e instanceof ApiError ? `解析失败：${e.message}` : "文件解析失败");
    } finally {
      setAttaching(false);
    }
  }

  async function submit(question?: string) {
    if (loading || attaching) return;
    const messageAttachments: AssistantAttachment[] | undefined = attachment
      ? [{
          name: attachment.name,
          chars: attachment.chars,
          file_id: attachment.fileId,
          chunk_count: attachment.chunkCount,
          status: attachment.status,
          truncated: false,
        }]
      : undefined;
    await sendQuestion(
      question,
      projectCompanyContext,
      messageAttachments,
      projectContext?.id ?? null,
      validationCardId ?? null
    );
    setAttachment(null);
  }

  function fillDraft(question: string) {
    setInput(question);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function handleDeposit(fileId: string) {
    setDepositingFileId(fileId);
    setAttachError(null);
    try {
      await depositAttachment(fileId);
    } catch (error) {
      setAttachError(error instanceof ApiError ? `沉淀失败：${error.message}` : "沉淀失败，请稍后再试");
    } finally {
      setDepositingFileId(null);
    }
  }

  async function handleDepositMessage(messageId: string) {
    setDepositingMessageId(messageId);
    setAttachError(null);
    try {
      await depositMessage(messageId);
    } catch (error) {
      setAttachError(error instanceof ApiError ? `沉淀失败：${error.message}` : "沉淀失败，请稍后再试");
    } finally {
      setDepositingMessageId(null);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSend) submit();
  }

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* 顶部细条 */}
        <div className="flex h-14 shrink-0 items-center gap-1.5 pl-16 pr-3 md:justify-end md:gap-2 md:px-8">
          {/* 移动端：居中标题 */}
          <div className="min-w-0 flex-1 truncate text-center text-[15px] font-black text-ink md:hidden">
            天机AI 商业决策智能体
          </div>
          {/* 桌面端：当前会话 chip */}
          {activeConversation && hasConversation && (
            <span className="mr-auto hidden max-w-[50%] items-center gap-1.5 rounded-lg bg-[#f7f5ff] px-2.5 py-1 text-[11px] font-bold text-brand md:inline-flex">
              <Icon name="history" className="h-3.5 w-3.5" />
              <span className="truncate">当前会话：{activeConversationTitle}</span>
            </span>
          )}
          <button
            onClick={() => {
              // 新建会话：清空当前对话
              window.location.href = "/chat";
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#172452] transition-colors hover:bg-white hover:text-brand"
            title="新建会话"
          >
            <Icon name="edit" className="h-[19px] w-[19px]" />
          </button>
          <button
            onClick={() => setFocusOpen(true)}
            className="hidden h-10 items-center gap-2 rounded-full px-2.5 text-[13px] font-bold text-[#172452] transition-colors hover:bg-white hover:text-brand md:flex md:px-3"
            title="打开专注对话"
          >
            <Icon name="panel" className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">专注</span>
          </button>
          <button className="hidden h-10 w-10 items-center justify-center rounded-full text-[#172452] transition-colors hover:bg-white hover:text-brand md:flex">
            <Icon name="help-circle" className="h-[19px] w-[19px]" />
          </button>
          <button
            onClick={onToggleConv}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white hover:text-brand md:w-auto md:gap-2 md:px-3",
              convOpen ? "text-brand" : "text-[#172452]"
            )}
            title={convOpen ? "收起会话列表" : "会话列表"}
          >
            <Icon name="history" className="h-[19px] w-[19px] md:h-[18px] md:w-[18px]" />
            <span className="hidden text-[13px] font-bold sm:inline">会话</span>
          </button>
        </div>

        {/* 移动端：当前会话卡（点击打开会话列表） */}
        {hasConversation && activeConversation && (
          <button
            onClick={onToggleConv}
            className="mx-4 mt-1 mb-1 flex shrink-0 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left shadow-[0_10px_24px_rgba(30,58,138,0.05)] md:hidden"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0edff] text-brand">
              <Icon name="history" className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink">{activeConversationTitle}</span>
              <span className="block text-[11px] text-slate-400">
                {messages.filter((m) => m.id !== "welcome").length} 条消息
              </span>
            </span>
            <Icon name="chevron-right" className="h-5 w-5 shrink-0 text-slate-300" />
          </button>
        )}

        {/* 中部：Hero（空状态）或消息流 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-8">
          {!hasConversation ? (
            <HomeHero
              displayName={user?.display_name || "用户"}
              loading={loading}
              onDraft={fillDraft}
              projectContext={projectContext}
              projectLoading={projectLoading}
              projectError={projectError}
              validationCardId={validationCardId}
            />
          ) : (
            <div className="mx-auto w-full max-w-[900px] space-y-3 py-4 md:space-y-4 md:py-6">
              {validationCardId && <ValidationContextStrip validationCardId={validationCardId} />}
              {validationCardError && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-500">
                  验证任务读取失败：{validationCardError}
                </div>
              )}
              {(projectContext || projectLoading || projectError) && (
                <ProjectContextStrip
                  project={projectContext}
                  loading={projectLoading}
                  error={projectError}
                />
              )}
              {historyLoading && (
                <div className="rounded-2xl border border-line bg-white px-4 py-3.5 text-[13px] text-slate-500 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
                  正在恢复历史会话...
                </div>
              )}
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  loading={loading}
                  onDraft={fillDraft}
                  onDeposit={handleDeposit}
                  depositingFileId={depositingFileId}
                  onDepositMessage={handleDepositMessage}
                  depositingMessageId={depositingMessageId}
                  projectId={projectContext?.id ?? null}
                  validationCard={activeValidationCard}
                  onEvidenceBackfilled={setActiveValidationCard}
                />
              ))}
              {loading && !streamingMessageActive && (
                <div className="max-w-[820px] rounded-2xl border border-line bg-white px-4 py-3.5 text-[13px] text-slate-500 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
                  正在检索天机AI核心知识节点，并调用 DeepSeek 生成解决方案...
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* 底部输入条 */}
        {/* 移动端底部留出固定 Tab 栏(/chat)空间，桌面端不受影响(md:pb-6) */}
        <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+74px)] pt-2 md:px-8 md:pb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.pptx,.xlsx"
            className="hidden"
            onChange={(event) => {
              const f = event.target.files?.[0];
              if (f) handlePickFile(f);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <div className="mx-auto w-full max-w-[900px]">
            {(attachment || attaching || attachError) && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {attaching && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f5f3ff] px-3 py-1.5 text-[12px] font-semibold text-brand">
                    <Icon name="refresh" className="h-3.5 w-3.5 animate-spin" />
                    正在解析文件…
                  </span>
                )}
                {attachment && !attaching && (
                  <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-[#172452]">
                    <Icon name="file-text" className="h-3.5 w-3.5 text-brand" />
                    <span className="max-w-[calc(100vw-170px)] truncate md:max-w-[260px]">{attachment.name}</span>
                    <span className="text-[11px] text-emerald-600">
                      已解析全文 · {attachment.chunkCount} 片段
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="text-slate-400 hover:text-rose-500"
                      title="移除附件"
                    >
                      <Icon name="x" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {attachError && (
                  <span className="text-[12px] font-semibold text-rose-500">{attachError}</span>
                )}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canSend) submit();
              }}
              className="flex items-end gap-2 rounded-[22px] border border-line bg-white py-2.5 pl-2.5 pr-2.5 shadow-[0_18px_50px_rgba(15,23,42,0.10)] transition-colors focus-within:border-brand/50 md:rounded-[24px] md:py-3 md:pl-3 md:pr-3"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand disabled:opacity-50"
                title="上传文件（PDF / DOCX / PPTX / XLSX / TXT / MD），解析后随诉求一起发送"
              >
                <Icon name="plus" className="h-5 w-5" />
              </button>
              <textarea
                ref={composerRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                className="block max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-6 text-ink outline-none placeholder:text-slate-400 md:text-[15px]"
                placeholder={attachment ? "针对已上传文件提问，尽管问…" : "输入企业诉求，尽管问…"}
              />
              <button
                type="submit"
                disabled={!canSend}
                className="brand-gradient mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-soft transition disabled:cursor-not-allowed disabled:opacity-45"
                title={loading ? "正在生成" : "发送"}
              >
                <Icon name={loading ? "refresh" : "send"} className={cn("h-5 w-5", loading && "animate-spin")} />
              </button>
            </form>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              回答由 AI 结合天机AI核心知识节点生成，仅供决策参考。
            </p>
          </div>
        </div>
      </main>
      {focusOpen && (
        <AssistantFocusMode
          onClose={() => setFocusOpen(false)}
          projectCompanyContext={projectCompanyContext}
          projectId={projectContext?.id ?? null}
          validationCardId={validationCardId}
        />
      )}
    </>
  );
}

function HomeHero({
  displayName,
  loading,
  onDraft,
  projectContext,
  projectLoading,
  projectError,
  validationCardId,
}: {
  displayName: string;
  loading: boolean;
  onDraft: (question: string) => void;
  projectContext: Project | null;
  projectLoading: boolean;
  projectError: string | null;
  validationCardId?: string | null;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-[760px] flex-col items-center justify-center py-20 text-center md:py-10">
      <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft ring-8 ring-indigo-50/60">
        <Icon name="boxes" className="h-7 w-7 text-white" />
      </div>
      <h1 className="mt-5 text-[26px] font-black text-ink md:text-[30px]">
        你好，{displayName}
      </h1>
      <p className="mt-3 max-w-[560px] text-[13px] leading-7 text-slate-500 md:text-[14px]">
        输入企业诉求，我会结合港大 IMC&IPM 方法论、知识图谱与已沉淀案例，帮你形成可执行的商业判断。
      </p>
      {(projectContext || projectLoading || projectError) && (
        <ProjectContextCard
          project={projectContext}
          loading={projectLoading}
          error={projectError}
        />
      )}
      {validationCardId && <ValidationContextCard validationCardId={validationCardId} />}
      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestionChips.map((question) => (
          <button
            key={question}
            disabled={loading}
            onClick={() => onDraft(question)}
            className="rounded-2xl border border-line bg-white px-4 py-3.5 text-left text-[13px] font-bold text-[#172452] shadow-[0_10px_28px_rgba(30,58,138,0.05)] transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

function projectTaskPackLabel(project: Project) {
  const labels: Record<Project["task_pack"], string> = {
    new_project: "新项目验证",
    sales_growth: "销售增长",
    ai_acquisition: "AI 获客",
    review: "经营复盘",
  };
  return labels[project.task_pack] ?? project.task_pack;
}

function ProjectContextCard({
  project,
  loading,
  error,
}: {
  project: Project | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="mt-6 w-full rounded-2xl border border-line bg-white px-4 py-3 text-left text-[13px] font-semibold text-slate-500 shadow-[0_10px_28px_rgba(30,58,138,0.05)]">
        正在读取经营档案上下文...
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-6 w-full rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-left text-[13px] font-semibold text-rose-500">
        经营档案读取失败：{error}
      </div>
    );
  }
  if (!project) return null;
  return (
    <div className="mt-6 w-full rounded-3xl border border-[#dcd6ff] bg-white px-5 py-4 text-left shadow-[0_14px_36px_rgba(91,75,255,0.08)]">
      <div className="flex items-start gap-3">
        <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-soft">
          <Icon name="archive" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-black text-ink">已关联经营档案：{project.name}</span>
            <span className="rounded-full bg-[#f0edff] px-2.5 py-1 text-[11px] font-bold text-brand">
              {projectTaskPackLabel(project)}
            </span>
          </div>
          <div className="mt-2 grid gap-2 text-[12px] leading-5 text-slate-500 md:grid-cols-2">
            <p className="line-clamp-2">目标客户：{project.target_customer || "尚未定义"}</p>
            <p className="line-clamp-2">当前问题：{project.current_problem || "尚未沉淀"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationContextCard({ validationCardId }: { validationCardId: string }) {
  return (
    <div className="mt-3 w-full rounded-2xl border border-[#dcd6ff] bg-[#fbfaff] px-4 py-3 text-left shadow-[0_10px_28px_rgba(91,75,255,0.06)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0edff] text-brand">
          <Icon name="target" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-black text-[#172452]">已带入当前验证任务</div>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            本轮 AI 经营访谈会读取验证内容、决策树任务、证据状态和 BACH 审判结果，并支持把访谈材料回填到节点证据。
          </p>
          <a
            href={`/validation-cards/${validationCardId}`}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-black text-brand"
          >
            查看验证任务
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function ProjectContextStrip({
  project,
  loading,
  error,
}: {
  project: Project | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-white px-4 py-3 text-[13px] text-slate-500 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
        正在读取经营档案上下文...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-500">
        经营档案读取失败：{error}
      </div>
    );
  }
  if (!project) return null;
  return (
    <div className="rounded-2xl border border-[#dcd6ff] bg-[#fbfaff] px-4 py-3 text-[13px] shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black text-[#172452]">当前项目：{project.name}</span>
        <span className="rounded-full bg-[#f0edff] px-2 py-0.5 text-[11px] font-bold text-brand">
          {projectTaskPackLabel(project)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-slate-500">
        {project.current_problem || project.target_customer || "本轮对话会自动带入该经营档案上下文。"}
      </p>
    </div>
  );
}

function ValidationContextStrip({ validationCardId }: { validationCardId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dcd6ff] bg-[#fbfaff] px-4 py-3 text-[13px] shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f0edff] text-brand">
          <Icon name="target" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="font-black text-[#172452]">已带入验证任务上下文</div>
          <div className="truncate text-[12px] font-semibold text-slate-500">
            AI 会围绕当前验证内容、任务节点、证据和 BACH 审判继续访谈，消息可回填为节点证据。
          </div>
        </div>
      </div>
      <a
        href={`/validation-cards/${validationCardId}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] font-black text-brand hover:bg-[#f7f5ff]"
      >
        任务详情
        <Icon name="chevron-right" className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function AttachmentCard({
  attachment,
  tone = "default",
  onDeposit,
  depositing = false,
}: {
  attachment: AssistantAttachment;
  tone?: "default" | "sent";
  onDeposit?: (fileId: string) => void;
  depositing?: boolean;
}) {
  const isDeposited = Boolean(attachment.deposited_source_id || attachment.status === "deposited");
  const pendingReview = attachment.review_task_count ?? 0;
  const rejected = isDeposited && attachment.source_status === "rejected";
  const reviewed = isDeposited && pendingReview === 0 && !rejected;
  const sizeText =
    isDeposited
      ? rejected
        ? "已沉淀 · 被拒绝"
        : reviewed
          ? "已沉淀 · 已审核"
          : `已沉淀 · 待审核 ${pendingReview} 条`
      : typeof attachment.chunk_count === "number" && attachment.chunk_count > 0
        ? `已解析全文 · ${attachment.chunk_count} 个片段可追问`
        : typeof attachment.chars === "number" && attachment.chars > 0
          ? `${attachment.chars.toLocaleString()} 字 · 可追问`
          : "已随问题发送";
  const fileId = attachment.file_id || "";
  const canDeposit = Boolean(fileId && onDeposit && !isDeposited);
  return (
    <div
      className={cn(
        "flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-left",
        tone === "sent"
          ? "border-white/20 bg-white/15 text-white"
          : "border-line bg-[#f8faff] text-[#172452]"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          tone === "sent" ? "bg-white/15" : "bg-[#f0edff]"
        )}
      >
        <Icon name="file-text" className={cn("h-4 w-4", tone === "sent" ? "text-white" : "text-brand")} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold">{attachment.name}</span>
        <span className={cn("block text-[11px]", tone === "sent" ? "text-white/75" : "text-slate-400")}>
          {sizeText}
        </span>
      </span>
      {canDeposit && (
        <button
          type="button"
          disabled={depositing}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDeposit?.(fileId);
          }}
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
            tone === "sent"
              ? "bg-white/20 text-white hover:bg-white/25"
              : "bg-[#f0edff] text-brand hover:bg-[#e8e4ff]"
          )}
        >
          {depositing ? "沉淀中" : "沉淀为资料"}
        </button>
      )}
      {isDeposited && !reviewed && !rejected && (
        <a
          href="/review"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition",
            tone === "sent"
              ? "bg-white/20 text-white hover:bg-white/25"
              : "bg-amber-50 text-amber-600 hover:bg-amber-100"
          )}
        >
          去审核
        </a>
      )}
      {rejected && fileId && (
        <button
          type="button"
          disabled={depositing}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDeposit?.(fileId);
          }}
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
            tone === "sent" ? "bg-white/20 text-white hover:bg-white/25" : "bg-rose-50 text-rose-600 hover:bg-rose-100"
          )}
        >
          {depositing ? "重新提交中" : "重新提交"}
        </button>
      )}
      {reviewed && (
        <span
          className={cn(
            "shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold",
            tone === "sent" ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
          )}
        >
          已审核
        </span>
      )}
    </div>
  );
}

function ValidationCardPreview({ card }: { card: ValidationCard }) {
  const firstAction = card.actions?.[0];
  return (
    <div className="mt-3 rounded-xl border border-[#dcd6ff] bg-[#fbfaff] p-3 text-left">
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
          <Icon name="target" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[12.5px] font-black text-[#172452]">
              已生成验证卡：{card.title}
            </span>
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
              草稿
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
            {card.biggest_uncertainty || card.core_judgment}
          </p>
          {firstAction && (
            <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[12px] leading-5 text-[#172452]">
              第一步：{firstAction.title} · {firstAction.success_metric}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceBackfillControl({
  message,
  validationCard,
  onBackfilled,
  tone = "default",
  loading = false,
}: {
  message: ReturnType<typeof useAssistant>["messages"][number];
  validationCard?: ValidationCard | null;
  onBackfilled?: (card: ValidationCard) => void;
  tone?: "default" | "sent";
  loading?: boolean;
}) {
  const actions = validationCard?.actions ?? [];
  const [open, setOpen] = useState(false);
  const [actionIndex, setActionIndex] = useState(0);
  const [text, setText] = useState(() => compactMessageForEvidence(message.content));
  const [sourceType, setSourceType] = useState<EvidenceSourceType>("user_interview");
  const [grade, setGrade] = useState<EvidenceGrade>("C");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActionIndex(defaultActionIndex(validationCard ?? null));
  }, [validationCard]);

  useEffect(() => {
    setText(compactMessageForEvidence(message.content));
    setSaved(false);
    setError(null);
  }, [message.id, message.content]);

  if (!validationCard || actions.length === 0 || message.id === "welcome" || !message.content.trim()) {
    return null;
  }

  const activeAction = actions[actionIndex];
  const activeTarget = Number(activeAction?.evidence_target || 0);
  const activeCount = Number(activeAction?.evidence_count || activeAction?.evidence_items?.length || 0);
  const activeMissing = activeTarget > 0 ? Math.max(0, activeTarget - activeCount) : null;

  async function handleSave() {
    if (!validationCard || saving || !text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await validationCardApi.updateAction(validationCard.id, actionIndex, {
        evidence_item: {
          text: text.trim(),
          source_type: sourceType,
          grade,
        },
      });
      setSaved(true);
      setOpen(false);
      onBackfilled?.(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "回填失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={loading || saving}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
          tone === "sent"
            ? "bg-white/15 text-white hover:bg-white/25"
            : saved
              ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              : "bg-[#f0edff] text-brand hover:bg-[#e8e4ff]"
        )}
      >
        <Icon name={saving ? "refresh" : saved ? "check-circle" : "clipboard-check"} className={cn("h-3.5 w-3.5", saving && "animate-spin")} />
        {saving ? "回填中" : saved ? "已回填证据" : open ? "收起回填" : "回填证据"}
      </button>
      {open && (
        <div
          className={cn(
            "mt-2 rounded-xl border p-3 text-left shadow-[0_10px_22px_rgba(15,23,42,0.06)]",
            tone === "sent" ? "border-white/20 bg-white text-[#172452]" : "border-line bg-[#fbfaff]"
          )}
        >
          <div className="grid gap-2 md:grid-cols-[1.4fr_0.9fr_0.8fr]">
            <label className="min-w-0 text-[11.5px] font-bold text-slate-500">
              验证节点
              <select
                value={actionIndex}
                onChange={(event) => setActionIndex(Number(event.target.value))}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-semibold text-[#172452] outline-none focus:border-brand/50"
              >
                {actions.map((action, index) => {
                  const target = Number(action.evidence_target || 0);
                  const count = Number(action.evidence_count || action.evidence_items?.length || 0);
                  const missing = target > 0 ? Math.max(0, target - count) : null;
                  return (
                    <option key={`${action.node_id}-${index}`} value={index}>
                      {action.node_id || index + 1} · {action.title}
                      {missing !== null ? `（缺 ${missing}）` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-[11.5px] font-bold text-slate-500">
              来源
              <select
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as EvidenceSourceType)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-semibold text-[#172452] outline-none focus:border-brand/50"
              >
                {evidenceSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-bold text-slate-500">
              等级
              <select
                value={grade}
                onChange={(event) => setGrade(event.target.value as EvidenceGrade)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-[12px] font-semibold text-[#172452] outline-none focus:border-brand/50"
              >
                {evidenceGradeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          {activeAction && (
            <p className="mt-2 line-clamp-2 text-[11.5px] leading-5 text-slate-500">
              {activeMissing !== null
                ? `当前节点证据 ${activeCount}/${activeTarget}，还缺 ${activeMissing} 条。`
                : `当前节点已有 ${activeCount} 条证据。`}
              {activeAction.success_metric ? ` 成功标准：${activeAction.success_metric}` : ""}
            </p>
          )}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            className="mt-2 w-full resize-y rounded-xl border border-line bg-white px-3 py-2 text-[12.5px] leading-5 text-[#172452] outline-none placeholder:text-slate-400 focus:border-brand/50"
            placeholder="写入客户原话、报价、订金、预约、拒绝理由等可核验证据"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving || !text.trim()}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Icon name={saving ? "refresh" : "check"} className={cn("h-3.5 w-3.5", saving && "animate-spin")} />
              确认回填
            </button>
            {error && <span className="text-[12px] font-semibold text-rose-500">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function TianjiSimulationPanel({
  simulation,
  compact = false,
}: {
  simulation?: ReturnType<typeof useAssistant>["messages"][number]["tianjiSimulation"];
  compact?: boolean;
}) {
  if (!simulation) return null;
  const paths = simulation.scenario_paths?.slice(0, compact ? 2 : 3) ?? [];
  const risks = simulation.risk_audit?.slice(0, compact ? 2 : 3) ?? [];
  const steps = simulation.validation_plan?.slice(0, compact ? 2 : 3) ?? [];
  const contradictions = simulation.contradictions?.slice(0, compact ? 2 : 3) ?? [];
  const assumptionStatus = simulation.assumption_status?.slice(0, compact ? 2 : 3) ?? [];
  const candidates = simulation.archive_candidates?.slice(0, compact ? 2 : 3) ?? [];
  if (
    paths.length === 0 &&
    risks.length === 0 &&
    steps.length === 0 &&
    contradictions.length === 0 &&
    assumptionStatus.length === 0 &&
    candidates.length === 0
  )
    return null;

  return (
    <div className="mt-3 rounded-xl border border-[#dcd6ff] bg-[#fbfaff] p-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
          <Icon name="route" className="h-3.5 w-3.5" />
        </span>
        <div className="text-[12px] font-black text-[#172452]">天机多路径推演</div>
        <span className="rounded-md bg-white px-2 py-0.5 text-[10.5px] font-bold text-slate-400">
          {simulation.algorithm_version}
        </span>
      </div>

      {paths.length > 0 && (
        <div className={cn("mt-3 grid gap-2", compact ? "md:grid-cols-2" : "md:grid-cols-3")}>
          {paths.map((path, index) => (
            <div key={`${path.name}-${index}`} className="rounded-lg bg-white px-3 py-2">
              <div className="truncate text-[12px] font-black text-brand">{path.name}</div>
              <p className="mt-1 line-clamp-3 text-[11.5px] leading-5 text-slate-500">
                {path.decision_implication || path.description || "该路径需要继续用真实业务数据验证。"}
              </p>
            </div>
          ))}
        </div>
      )}

      {(risks.length > 0 || steps.length > 0) && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {risks.length > 0 && (
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-black text-orange-500">
                <Icon name="alert" className="h-3.5 w-3.5" />
                关键风险
              </div>
              <div className="mt-1.5 space-y-1 text-[11.5px] leading-5 text-slate-500">
                {risks.map((risk, index) => (
                  <p key={`${risk.risk}-${index}`} className="line-clamp-2">
                    {risk.risk}
                  </p>
                ))}
              </div>
            </div>
          )}
          {steps.length > 0 && (
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-black text-emerald-600">
                <Icon name="target" className="h-3.5 w-3.5" />
                优先验证
              </div>
              <div className="mt-1.5 space-y-1 text-[11.5px] leading-5 text-slate-500">
                {steps.map((step, index) => (
                  <p key={`${step.step}-${index}`} className="line-clamp-2">
                    {step.step}{step.success_criteria ? ` · ${step.success_criteria}` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(contradictions.length > 0 || assumptionStatus.length > 0) && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {contradictions.length > 0 && (
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-black text-rose-500">
                <Icon name="alert" className="h-3.5 w-3.5" />
                历史矛盾
              </div>
              <div className="mt-1.5 space-y-1 text-[11.5px] leading-5 text-slate-500">
                {contradictions.map((item, index) => (
                  <p key={`${item}-${index}`} className="line-clamp-2">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          )}
          {assumptionStatus.length > 0 && (
            <div className="rounded-lg bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-black text-blue-600">
                <Icon name="clipboard-check" className="h-3.5 w-3.5" />
                假设状态
              </div>
              <div className="mt-1.5 space-y-1 text-[11.5px] leading-5 text-slate-500">
                {assumptionStatus.map((item, index) => (
                  <p key={`${item.assumption}-${index}`} className="line-clamp-2">
                    {item.status ? `${item.status} · ` : ""}
                    {item.assumption}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-3 rounded-lg bg-white px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11.5px] font-black text-brand">
            <Icon name="archive" className="h-3.5 w-3.5" />
            可沉淀资产
          </div>
          <div className="mt-1.5 space-y-1 text-[11.5px] leading-5 text-slate-500">
            {candidates.map((candidate, index) => (
              <p key={`${candidate}-${index}`} className="line-clamp-2">
                {candidate}
              </p>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] font-medium text-slate-400">
            点「沉淀本回答」可将推演资产一并提交人工审核，进入团队知识候选池
          </p>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  loading,
  onDraft,
  onDeposit,
  depositingFileId,
  onDepositMessage,
  depositingMessageId,
  projectId,
  validationCard,
  onEvidenceBackfilled,
}: {
  message: ReturnType<typeof useAssistant>["messages"][number];
  loading: boolean;
  onDraft: (question: string) => void;
  onDeposit: (fileId: string) => void;
  depositingFileId: string | null;
  onDepositMessage: (messageId: string) => void;
  depositingMessageId: string | null;
  projectId?: string | null;
  validationCard?: ValidationCard | null;
  onEvidenceBackfilled?: (card: ValidationCard) => void;
}) {
  const messageDeposited = Boolean(message.depositedSourceId);
  const canDepositMessage = message.role === "assistant" && message.id !== "welcome";
  const isAssistant = message.role !== "user";
  const [createdValidationCard, setCreatedValidationCard] = useState<ValidationCard | null>(null);
  const [creatingValidation, setCreatingValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleCreateValidationCard() {
    if (creatingValidation || createdValidationCard) return;
    setCreatingValidation(true);
    setValidationError(null);
    try {
      const card = await validationCardApi.create({
        source_message_id: message.id,
        project_id: projectId ?? undefined,
      });
      setCreatedValidationCard(card);
    } catch (error) {
      setValidationError(error instanceof ApiError ? error.message : "验证卡生成失败");
    } finally {
      setCreatingValidation(false);
    }
  }

  return (
    <div className={cn("w-full", isAssistant && "flex items-start gap-2.5 md:block")}>
      {isAssistant && (
        <span className="brand-gradient mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white md:hidden">
          <Icon name="boxes" className="h-4 w-4" />
        </span>
      )}
      <div
        className={cn(
          "rounded-2xl px-4 py-3.5 text-[14px] leading-7 md:text-[13px] md:leading-6",
          message.role === "user"
            ? "ml-auto max-w-[88%] bg-brand text-white shadow-[0_12px_28px_rgba(91,75,255,0.18)] md:max-w-[680px]"
            : "min-w-0 flex-1 border border-line bg-white text-slate-650 shadow-[0_10px_24px_rgba(30,58,138,0.05)] md:max-w-[820px] md:flex-none"
        )}
      >
        <div className="whitespace-pre-line">{message.content}</div>
        {message.role === "assistant" && (
          <TianjiSimulationPanel simulation={message.tianjiSimulation} compact />
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.attachments.map((attachment) => (
              <AttachmentCard
                key={`${message.id}-${attachment.name}`}
                attachment={attachment}
                tone={message.role === "user" ? "sent" : "default"}
                onDeposit={onDeposit}
                depositing={Boolean(attachment.file_id && attachment.file_id === depositingFileId)}
              />
            ))}
          </div>
        )}
        <EvidenceBackfillControl
          message={message}
          validationCard={validationCard}
          onBackfilled={onEvidenceBackfilled}
          tone={message.role === "user" ? "sent" : "default"}
          loading={loading}
        />
        {message.nodeRefs && message.nodeRefs.length > 0 && (
          <div className="mt-3 border-t border-line/70 pt-2">
            <div className="text-[11.5px] font-bold text-slate-400">
              引用知识节点{message.usedLlm ? " · DeepSeek 已参与生成" : " · 本地兜底生成"}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.nodeRefs.slice(0, 4).map((node) => (
                <a
                  key={node.id}
                  href={`/knowledge-nodes?q=${encodeURIComponent(node.name)}`}
                  className="rounded-md bg-[#f0edff] px-2 py-1 text-[11px] font-bold text-brand"
                >
                  {node.name}
                </a>
              ))}
            </div>
          </div>
        )}
        {message.role === "assistant" &&
          message.suggestedQuestions &&
          message.suggestedQuestions.length > 0 && (
            <div className="mt-3 border-t border-line/70 pt-2">
              <div className="text-[11.5px] font-bold text-slate-400">建议继续追问</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {message.suggestedQuestions.slice(0, 4).map((question) => (
                  <button
                    key={question}
                    disabled={loading}
                    onClick={() => onDraft(question)}
                    className="w-full max-w-full rounded-lg bg-[#f7f5ff] px-3 py-2 text-left text-[12.5px] font-semibold leading-5 text-brand transition-colors hover:bg-[#eeeaff] disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
        {message.action && (
          <a
            href={message.action.href}
            className={cn(
              "mt-3 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold",
              message.role === "user"
                ? "bg-white/15 text-white"
                : "bg-[#f0edff] text-brand hover:bg-[#e8e4ff]"
            )}
          >
            {message.action.label}
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
        )}
        {canDepositMessage && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2">
            <button
              type="button"
              disabled={loading || creatingValidation || Boolean(createdValidationCard)}
              onClick={handleCreateValidationCard}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#f0edff] px-2.5 py-1.5 text-[12px] font-bold text-brand transition hover:bg-[#e8e4ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon
                name={creatingValidation ? "refresh" : "target"}
                className={cn("h-3.5 w-3.5", creatingValidation && "animate-spin")}
              />
              {createdValidationCard ? "已生成验证卡" : creatingValidation ? "生成中" : "生成验证卡"}
            </button>
            {validationError && (
              <span className="text-[12px] font-semibold text-rose-500">{validationError}</span>
            )}
          </div>
        )}
        {createdValidationCard && <ValidationCardPreview card={createdValidationCard} />}
        {canDepositMessage && (
          <div className="mt-3 border-t border-line/70 pt-2">
            {messageDeposited ? (
              message.reviewTaskCount && message.reviewTaskCount > 0 ? (
                <a
                  href="/review"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-bold text-amber-600 hover:bg-amber-100"
                >
                  <Icon name="clipboard-check" className="h-3.5 w-3.5" />
                  已沉淀 · 去审核 {message.reviewTaskCount} 条
                </a>
              ) : message.sourceStatus === "rejected" ? (
                <button
                  type="button"
                  disabled={loading || depositingMessageId === message.id}
                  onClick={() => onDepositMessage(message.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Icon name={depositingMessageId === message.id ? "refresh" : "refresh"} className={cn("h-3.5 w-3.5", depositingMessageId === message.id && "animate-spin")} />
                  {depositingMessageId === message.id ? "重新提交中" : "已驳回 · 重新提交"}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-600">
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                  已沉淀 · 已审核
                </span>
              )
            ) : (
              <button
                type="button"
                disabled={loading || depositingMessageId === message.id}
                onClick={() => onDepositMessage(message.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#f0edff] px-2.5 py-1.5 text-[12px] font-bold text-brand transition hover:bg-[#e8e4ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name={depositingMessageId === message.id ? "refresh" : "archive"} className={cn("h-3.5 w-3.5", depositingMessageId === message.id && "animate-spin")} />
                {depositingMessageId === message.id ? "沉淀中" : "沉淀为经验"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPanel({ onCollapse }: { onCollapse: () => void }) {
  const {
    messages,
    conversations,
    activeConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
  } = useAssistant();

  function handleSelectConversation(conversationId: string) {
    selectConversation(conversationId)
      .then(() => {
        if (window.matchMedia("(max-width: 767px)").matches) {
          onCollapse();
        }
      })
      .catch(() => undefined);
  }

  return (
    <>
      <button
        type="button"
        aria-label="关闭会话列表"
        onClick={onCollapse}
        className="fixed inset-0 z-40 bg-slate-950/25 md:hidden"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[86vw] max-w-[330px] shrink-0 flex-col border-l border-line bg-white/95 shadow-[-18px_0_56px_rgba(15,23,42,0.18)] backdrop-blur-xl md:static md:z-auto md:h-screen md:w-[300px] md:max-w-none md:bg-white/60 md:shadow-none">
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onCollapse}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-brand"
              title="收起会话列表"
            >
              <Icon name="chevron-right" className="h-4 w-4" />
            </button>
            <div className="text-[15px] font-black text-ink">对话</div>
          </div>
          <button
            onClick={() => createConversation().catch(() => undefined)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:text-brand"
            title="开启新会话"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            新对话
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-1">
          {conversations.length === 0 && (
            <div className="px-2 py-8 text-center text-[12.5px] leading-5 text-slate-400">
              暂无会话，开始提问即可创建。
            </div>
          )}
          {conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              displayTitle={
                conversation.id === activeConversationId && isPlaceholderTitle(conversation.title)
                  ? titleFromActiveMessages(messages) || conversation.title
                  : conversation.title
              }
              onSelect={() => handleSelectConversation(conversation.id)}
              onDelete={() => deleteConversation(conversation.id)}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

function AssistantFocusMode({
  onClose,
  projectCompanyContext,
  projectId,
  validationCardId,
}: {
  onClose: () => void;
  projectCompanyContext?: string;
  projectId?: string | null;
  validationCardId?: string | null;
}) {
  const {
    input,
    messages,
    conversations,
    activeConversationId,
    loading,
    historyLoading,
    setInput,
    sendQuestion,
    createConversation,
    selectConversation,
    deleteConversation,
    depositAttachment,
    depositMessage,
  } = useAssistant();
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [depositingFileId, setDepositingFileId] = useState<string | null>(null);
  const [depositingMessageId, setDepositingMessageId] = useState<string | null>(null);
  const { user } = useAuth();
  const canSend = input.trim().length > 0 && !loading;
  const streamingMessageActive = loading && messages[messages.length - 1]?.id.startsWith("a-stream-");
  const {
    validationCard: activeValidationCard,
    setValidationCard: setActiveValidationCard,
    validationCardError,
  } = useActiveValidationCard(validationCardId);
  const filteredConversations = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(keyword));
  }, [conversations, searchKeyword]);
  const hasConversation = messages.some((message) => message.role === "user");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, historyLoading]);

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSend) {
      sendQuestion(undefined, projectCompanyContext, undefined, projectId ?? null, validationCardId ?? null);
    }
  }

  function fillDraft(question: string) {
    setInput(question);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function handleDeposit(fileId: string) {
    setDepositingFileId(fileId);
    try {
      await depositAttachment(fileId);
    } finally {
      setDepositingFileId(null);
    }
  }

  async function handleDepositMessage(messageId: string) {
    setDepositingMessageId(messageId);
    try {
      await depositMessage(messageId);
    } finally {
      setDepositingMessageId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-white text-ink">
      <aside className="flex w-[268px] shrink-0 flex-col border-r border-[#ececf1] bg-[#f7f7f8]">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="text-[18px] font-black tracking-[-0.02em]">天机AI</div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-brand"
            title="关闭专注对话"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-3">
          <button
            onClick={() => createConversation().catch(() => undefined)}
            className="flex h-10 w-full items-center gap-3 rounded-xl bg-white px-3 text-left text-[13px] font-bold text-[#172452] shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:text-brand"
          >
            <Icon name="plus" className="h-4 w-4 text-brand" />
            新会话
          </button>
          <label className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold text-slate-600 hover:bg-white">
            <Icon name="search" className="h-4 w-4" />
            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
              placeholder="搜索会话"
            />
          </label>
        </div>

        <div className="mt-5 border-t border-[#ececf1] px-3 pt-4">
          <div className="px-2 text-[12px] font-black text-slate-500">会话</div>
          <div className="mt-2 max-h-[calc(100vh-210px)] space-y-1 overflow-y-auto pr-1">
            {filteredConversations.length === 0 && (
              <div className="px-2 py-3 text-[12.5px] leading-5 text-slate-400">
                暂无匹配会话。
              </div>
            )}
            {filteredConversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeConversationId}
                displayTitle={
                  conversation.id === activeConversationId && isPlaceholderTitle(conversation.title)
                    ? titleFromActiveMessages(messages) || conversation.title
                    : conversation.title
                }
                onSelect={() => selectConversation(conversation.id)}
                onDelete={() => deleteConversation(conversation.id)}
              />
            ))}
          </div>
        </div>

        <div className="mt-auto border-t border-[#ececf1] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)]" />
            <div>
              <div className="text-[13px] font-bold">{user?.display_name || "用户"}</div>
              <div className="text-[11px] text-slate-500">{user?.role || "访客"}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black">天机AI商业决策智能体</span>
            <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet">
              DeepSeek
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-slate-500 hover:text-brand"
          >
            <Icon name="x" className="h-4 w-4" />
            返回工作台
          </button>
        </header>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-8 pb-8 pt-4">
            {!hasConversation && (
              <div className="mx-auto flex min-h-[52vh] max-w-[880px] flex-col items-center justify-center text-center">
                <h1 className="text-[30px] font-black tracking-[-0.03em] text-ink">
                  你在忙什么？
                </h1>
                <p className="mt-3 max-w-[620px] text-[14px] leading-7 text-slate-500">
                  输入具体企业诉求，我会结合港大 IMC&IPM 核心方法论、知识图谱和已沉淀案例，帮你形成可执行的商业判断。
                </p>
                <div className="mt-8 grid max-w-[720px] grid-cols-2 gap-3">
                  {[
                    "分析一下这个项目的主要风险",
                    "判断价值主张是否成立",
                    "为这个项目设计 7 天验证计划",
                    "从客户、渠道、成本三方推演一下",
                  ].map((question) => (
                    <button
                      key={question}
                      onClick={() => fillDraft(question)}
                      className="rounded-2xl border border-line bg-white px-4 py-3 text-left text-[13px] font-bold text-[#172452] shadow-[0_10px_28px_rgba(30,58,138,0.05)] hover:border-brand/40 hover:text-brand"
                    >
                      {question}
                    </button>
                  ))}
                </div>
                {validationCardId && <ValidationContextCard validationCardId={validationCardId} />}
              </div>
            )}

            {hasConversation && (
              <div className="mx-auto max-w-[900px] space-y-7">
                {validationCardId && <ValidationContextStrip validationCardId={validationCardId} />}
                {validationCardError && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-500">
                    验证任务读取失败：{validationCardError}
                  </div>
                )}
                {messages.map((message) => (
                  <FocusMessage
                    key={message.id}
                    message={message}
                    loading={loading}
                    onDraft={fillDraft}
                    onDeposit={handleDeposit}
                    depositingFileId={depositingFileId}
                    onDepositMessage={handleDepositMessage}
                    depositingMessageId={depositingMessageId}
                    projectId={projectId}
                    validationCard={activeValidationCard}
                    onEvidenceBackfilled={setActiveValidationCard}
                  />
                ))}
                {loading && !streamingMessageActive && (
                  <div className="flex gap-4">
                    <div className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white">
                      <Icon name="boxes" className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl bg-[#f7f7f8] px-4 py-3 text-[14px] text-slate-500">
                      正在检索知识节点并生成解决方案...
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="px-8 pb-8">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canSend) {
                  sendQuestion(undefined, projectCompanyContext, undefined, projectId ?? null, validationCardId ?? null);
                }
              }}
              className="mx-auto flex max-w-[980px] items-end gap-3 rounded-[24px] border border-line bg-white py-3 pl-4 pr-3 shadow-[0_18px_60px_rgba(15,23,42,0.11)] transition-colors focus-within:border-brand/50"
            >
              <button
                type="button"
                onClick={() => createConversation().catch(() => undefined)}
                className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand"
                title="开启新会话"
              >
                <Icon name="plus" className="h-5 w-5" />
              </button>
              <textarea
                ref={composerRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                className="block max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-slate-400"
                placeholder="输入企业诉求，尽管问"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="brand-gradient mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-soft transition disabled:cursor-not-allowed disabled:opacity-45"
                title={loading ? "正在生成" : "发送"}
              >
                <Icon name={loading ? "refresh" : "send"} className={cn("h-5 w-5", loading && "animate-spin")} />
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

function FocusMessage({
  message,
  loading,
  onDraft,
  onDeposit,
  depositingFileId,
  onDepositMessage,
  depositingMessageId,
  projectId,
  validationCard,
  onEvidenceBackfilled,
}: {
  message: ReturnType<typeof useAssistant>["messages"][number];
  loading: boolean;
  onDraft: (question: string) => void;
  onDeposit: (fileId: string) => void;
  depositingFileId: string | null;
  onDepositMessage: (messageId: string) => void;
  depositingMessageId: string | null;
  projectId?: string | null;
  validationCard?: ValidationCard | null;
  onEvidenceBackfilled?: (card: ValidationCard) => void;
}) {
  const [createdValidationCard, setCreatedValidationCard] = useState<ValidationCard | null>(null);
  const [creatingValidation, setCreatingValidation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleCreateValidationCard() {
    if (creatingValidation || createdValidationCard) return;
    setCreatingValidation(true);
    setValidationError(null);
    try {
      const card = await validationCardApi.create({
        source_message_id: message.id,
        project_id: projectId ?? undefined,
      });
      setCreatedValidationCard(card);
    } catch (error) {
      setValidationError(error instanceof ApiError ? error.message : "验证卡生成失败");
    } finally {
      setCreatingValidation(false);
    }
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[76%] rounded-[22px] bg-[#f4f4f5] px-5 py-3 text-[14px] leading-7 text-ink">
          <div>{message.content}</div>
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((attachment) => (
                <AttachmentCard
                  key={`${message.id}-${attachment.name}`}
                  attachment={attachment}
                  onDeposit={onDeposit}
                  depositing={Boolean(attachment.file_id && attachment.file_id === depositingFileId)}
                />
              ))}
            </div>
          )}
          <EvidenceBackfillControl
            message={message}
            validationCard={validationCard}
            onBackfilled={onEvidenceBackfilled}
            loading={loading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <div className="brand-gradient mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white">
        <Icon name="boxes" className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="whitespace-pre-line text-[14px] leading-7 text-[#172452]">
          {message.content}
        </div>
        <EvidenceBackfillControl
          message={message}
          validationCard={validationCard}
          onBackfilled={onEvidenceBackfilled}
          loading={loading}
        />
        <TianjiSimulationPanel simulation={message.tianjiSimulation} />
        {message.nodeRefs && message.nodeRefs.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="text-[12px] font-bold text-slate-400">
              引用知识节点{message.usedLlm ? " · DeepSeek 已参与生成" : " · 本地兜底生成"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {message.nodeRefs.slice(0, 6).map((node) => (
                <a
                  key={node.id}
                  href={`/knowledge-nodes?q=${encodeURIComponent(node.name)}`}
                  className="rounded-lg bg-[#f0edff] px-3 py-1.5 text-[12px] font-bold text-brand"
                >
                  {node.name}
                </a>
              ))}
            </div>
          </div>
        )}
        {message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <div className="text-[12px] font-bold text-slate-400">建议继续追问</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {message.suggestedQuestions.slice(0, 4).map((question) => (
                <button
                  key={question}
                  disabled={loading}
                  onClick={() => onDraft(question)}
                  className="w-fit max-w-full rounded-xl bg-[#f7f5ff] px-3 py-2.5 text-left text-[12.5px] font-semibold text-brand transition-colors hover:bg-[#eeeaff] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        {message.action && (
          <a
            href={message.action.href}
            className="mt-4 inline-flex items-center gap-1 rounded-xl bg-[#f0edff] px-3 py-2 text-[13px] font-bold text-brand hover:bg-[#e8e4ff]"
          >
            {message.action.label}
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </a>
        )}
        {message.id !== "welcome" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              disabled={loading || creatingValidation || Boolean(createdValidationCard)}
              onClick={handleCreateValidationCard}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#f0edff] px-3 py-2 text-[13px] font-bold text-brand transition hover:bg-[#e8e4ff] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon
                name={creatingValidation ? "refresh" : "target"}
                className={cn("h-3.5 w-3.5", creatingValidation && "animate-spin")}
              />
              {createdValidationCard ? "已生成验证卡" : creatingValidation ? "生成中" : "生成验证卡"}
            </button>
            {validationError && (
              <span className="text-[12px] font-semibold text-rose-500">{validationError}</span>
            )}
          </div>
        )}
        {createdValidationCard && <ValidationCardPreview card={createdValidationCard} />}
        {message.id !== "welcome" && (
          <div className="mt-4 border-t border-line pt-3">
            {message.depositedSourceId ? (
              message.reviewTaskCount && message.reviewTaskCount > 0 ? (
                <a
                  href="/review"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-600 hover:bg-amber-100"
                >
                  <Icon name="clipboard-check" className="h-3.5 w-3.5" />
                  已沉淀 · 去审核 {message.reviewTaskCount} 条
                </a>
              ) : message.sourceStatus === "rejected" ? (
                <button
                  type="button"
                  disabled={loading || depositingMessageId === message.id}
                  onClick={() => onDepositMessage(message.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Icon name="refresh" className={cn("h-3.5 w-3.5", depositingMessageId === message.id && "animate-spin")} />
                  {depositingMessageId === message.id ? "重新提交中" : "已驳回 · 重新提交"}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-600">
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                  已沉淀 · 已审核
                </span>
              )
            ) : (
              <button
                type="button"
                disabled={loading || depositingMessageId === message.id}
                onClick={() => onDepositMessage(message.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#f0edff] px-3 py-2 text-[13px] font-bold text-brand transition hover:bg-[#e8e4ff] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name={depositingMessageId === message.id ? "refresh" : "archive"} className={cn("h-3.5 w-3.5", depositingMessageId === message.id && "animate-spin")} />
                {depositingMessageId === message.id ? "沉淀中" : "沉淀为经验"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationListItem({
  conversation,
  active,
  displayTitle,
  onSelect,
  onDelete,
}: {
  conversation: ReturnType<typeof useAssistant>["conversations"][number];
  active: boolean;
  displayTitle?: string;
  onSelect: () => Promise<void> | void;
  onDelete: () => Promise<void>;
}) {
  const handleSelect = () => Promise.resolve(onSelect()).catch(() => undefined);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleSelect();
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!window.confirm(`确认删除会话「${displayTitle || conversation.title}」吗？`)) return;
    await onDelete();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
        active ? "bg-white text-brand shadow-[0_8px_18px_rgba(15,23,42,0.04)]" : "text-[#172452] hover:bg-white"
      )}
      title={displayTitle || conversation.title}
    >
      <Icon name="history" className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{displayTitle || conversation.title}</div>
        <div className="mt-0.5 text-[10.5px] font-medium text-slate-400">
          {conversation.message_count} 条消息
        </div>
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 opacity-100 transition-opacity hover:bg-rose-50 hover:text-rose-500 md:opacity-0 md:group-hover:opacity-100"
        title="删除会话"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
