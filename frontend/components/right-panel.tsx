"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "./icon";
import type { AssistantAttachment } from "@/lib/api";
import { ApiError, assistantApi } from "@/lib/api";
import { suggestionChips } from "@/lib/data";
import { useAssistant } from "./assistant-context";
import { useAuth } from "./auth-context";
import { PendingTaskBell } from "./pending-task-bell";
import { cn } from "@/lib/utils";

// 工作台首页对话工作区：左侧全局导航之外的「中·对话主区 + 右·会话列表（可收起）」。

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

export function HomeWorkspace() {
  const [convOpen, setConvOpen] = useState(true);
  return (
    <div className="flex h-screen min-w-0 flex-1 overflow-hidden">
      <ChatMain convOpen={convOpen} onToggleConv={() => setConvOpen((v) => !v)} />
      {convOpen && <ConversationPanel onCollapse={() => setConvOpen(false)} />}
    </div>
  );
}

function ChatMain({
  convOpen,
  onToggleConv,
}: {
  convOpen: boolean;
  onToggleConv: () => void;
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
  const hasConversation = messages.some((message) => message.role === "user");
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
    await sendQuestion(question, undefined, messageAttachments);
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
        <div className="flex h-14 shrink-0 items-center justify-end gap-2 px-8">
          {activeConversation && hasConversation && (
            <span className="mr-auto inline-flex max-w-[50%] items-center gap-1.5 rounded-lg bg-[#f7f5ff] px-2.5 py-1 text-[11px] font-bold text-brand">
              <Icon name="history" className="h-3.5 w-3.5" />
              <span className="truncate">当前会话：{activeConversationTitle}</span>
            </span>
          )}
          <PendingTaskBell />
          <button
            onClick={() => setFocusOpen(true)}
            className="flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-bold text-[#172452] transition-colors hover:bg-white hover:text-brand"
            title="打开专注对话"
          >
            <Icon name="panel" className="h-[18px] w-[18px]" />
            专注
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#172452] transition-colors hover:bg-white hover:text-brand">
            <Icon name="help-circle" className="h-[19px] w-[19px]" />
          </button>
          <button
            onClick={onToggleConv}
            className={cn(
              "flex h-10 items-center gap-2 rounded-full px-3 text-[13px] font-bold transition-colors hover:bg-white hover:text-brand",
              convOpen ? "text-brand" : "text-[#172452]"
            )}
            title={convOpen ? "收起会话列表" : "展开会话列表"}
          >
            <Icon name="history" className="h-[18px] w-[18px]" />
            会话
          </button>
        </div>

        {/* 中部：Hero（空状态）或消息流 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-8">
          {!hasConversation ? (
            <HomeHero
              displayName={user?.display_name || "用户"}
              loading={loading}
              onDraft={fillDraft}
            />
          ) : (
            <div className="mx-auto w-full max-w-[900px] space-y-4 py-6">
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
                />
              ))}
              {loading && (
                <div className="max-w-[820px] rounded-2xl border border-line bg-white px-4 py-3.5 text-[13px] text-slate-500 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
                  正在检索 IMC&IPM 核心知识节点，并调用 DeepSeek 生成解决方案...
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* 底部输入条 */}
        <div className="shrink-0 px-8 pb-6 pt-2">
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
                    <span className="max-w-[260px] truncate">{attachment.name}</span>
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
              className="flex items-end gap-2 rounded-[24px] border border-line bg-white py-3 pl-3 pr-3 shadow-[0_18px_50px_rgba(15,23,42,0.10)] transition-colors focus-within:border-brand/50"
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
                className="block max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-slate-400"
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
              回答由 AI 结合 IMC&IPM 核心知识节点生成，仅供决策参考。
            </p>
          </div>
        </div>
      </main>
      {focusOpen && <AssistantFocusMode onClose={() => setFocusOpen(false)} />}
    </>
  );
}

function HomeHero({
  displayName,
  loading,
  onDraft,
}: {
  displayName: string;
  loading: boolean;
  onDraft: (question: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-[760px] flex-col items-center justify-center py-10 text-center">
      <div className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft ring-8 ring-indigo-50/60">
        <Icon name="boxes" className="h-7 w-7 text-white" />
      </div>
      <h1 className="mt-5 text-[30px] font-black tracking-[-0.03em] text-ink">
        你好，{displayName}
      </h1>
      <p className="mt-3 max-w-[560px] text-[14px] leading-7 text-slate-500">
        输入企业诉求，我会结合 IMC&IPM 核心方法论、知识节点与已沉淀案例，帮你形成可执行的商业判断。
      </p>
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

function MessageBubble({
  message,
  loading,
  onDraft,
  onDeposit,
  depositingFileId,
  onDepositMessage,
  depositingMessageId,
}: {
  message: ReturnType<typeof useAssistant>["messages"][number];
  loading: boolean;
  onDraft: (question: string) => void;
  onDeposit: (fileId: string) => void;
  depositingFileId: string | null;
  onDepositMessage: (messageId: string) => void;
  depositingMessageId: string | null;
}) {
  const messageDeposited = Boolean(message.depositedSourceId);
  const canDepositMessage = message.role === "assistant" && message.id !== "welcome";
  return (
    <div className="w-full">
      <div
        className={cn(
          "rounded-2xl px-4 py-3.5 text-[13px] leading-6",
          message.role === "user"
            ? "ml-auto max-w-[680px] bg-brand text-white shadow-[0_12px_28px_rgba(91,75,255,0.18)]"
            : "max-w-[820px] border border-line bg-white text-slate-650 shadow-[0_10px_24px_rgba(30,58,138,0.05)]"
        )}
      >
        <div className="whitespace-pre-line">{message.content}</div>
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
                    className="w-fit max-w-full rounded-lg bg-[#f7f5ff] px-3 py-2 text-left text-[12.5px] font-semibold leading-5 text-brand transition-colors hover:bg-[#eeeaff] disabled:cursor-not-allowed disabled:opacity-60"
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

  return (
    <aside className="flex h-screen w-[300px] shrink-0 flex-col border-l border-line bg-white/60 backdrop-blur-xl">
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
            onSelect={() => selectConversation(conversation.id)}
            onDelete={() => deleteConversation(conversation.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function AssistantFocusMode({ onClose }: { onClose: () => void }) {
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
      sendQuestion();
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
          <div className="text-[18px] font-black tracking-[-0.02em]">IMC&IPM</div>
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
            <span className="text-[14px] font-black">IMC&IPM 智能助手</span>
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
                  输入具体企业诉求，我会结合港大 IMC&IPM 核心方法论、知识节点和已沉淀案例，帮你形成可执行的商业判断。
                </p>
                <div className="mt-8 grid max-w-[720px] grid-cols-2 gap-3">
                  {[
                    "分析一下这个项目的主要风险",
                    "判断价值主张是否成立",
                    "生成一份商业画布报告",
                    "评估这个方案的可行性",
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
              </div>
            )}

            {hasConversation && (
              <div className="mx-auto max-w-[900px] space-y-7">
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
                  />
                ))}
                {loading && (
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
                  sendQuestion();
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
}: {
  message: ReturnType<typeof useAssistant>["messages"][number];
  loading: boolean;
  onDraft: (question: string) => void;
  onDeposit: (fileId: string) => void;
  depositingFileId: string | null;
  onDepositMessage: (messageId: string) => void;
  depositingMessageId: string | null;
}) {
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
  onSelect: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const handleSelect = () => onSelect().catch(() => undefined);

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
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
        title="删除会话"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
