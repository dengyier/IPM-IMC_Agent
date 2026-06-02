"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import { Icon } from "./icon";
import { Card } from "./card";
import { assistantSkills } from "@/lib/data";
import { useAssistant } from "./assistant-context";
import { useAuth } from "./auth-context";
import { cn } from "@/lib/utils";

export function RightPanel() {
  return (
    <div className="sticky top-6 flex h-[calc(100vh-128px)] min-h-0 w-full flex-col">
      <AiAssistant />
    </div>
  );
}

function AiAssistant() {
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
  } = useAssistant();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const { user } = useAuth();
  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );
  const canSend = input.trim().length > 0 && !loading;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, historyLoading]);

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSend) {
      sendQuestion();
    }
  }

  return (
    <>
    <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-line/70 px-6 pb-4 pt-5">
        <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-xl shadow-soft">
          <Icon name="boxes" className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-black text-ink">IMC&IPM 智能助手</span>
            <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet">
              AI
            </span>
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-slate-400">
            基于核心知识节点与 DeepSeek 的商业决策对话
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => createConversation().catch(() => undefined)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:text-brand"
            title="开启新会话"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            新会话
          </button>
          <button
            onClick={() => setFocusOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-slate-500 transition-colors hover:text-brand"
            title="打开专注对话"
          >
            <Icon name="panel" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-line/70 px-6 py-4">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
          你好，{user?.display_name || "用户"} <span>👋</span>
        </div>
        <p className="mt-2 text-[13.5px] leading-6 text-slate-600">
          你可以直接输入企业诉求。我会结合核心知识节点与 DeepSeek，给出基于 IMC&IPM 方法论的解决建议。
        </p>
        {activeConversation && (
          <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-[#f7f5ff] px-2.5 py-1 text-[11px] font-bold text-brand">
            <Icon name="history" className="h-3.5 w-3.5" />
            <span className="truncate">当前会话：{activeConversation.title}</span>
          </div>
        )}
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {assistantSkills.map((s) => (
            <li key={s} className="flex items-center gap-2 text-[12.5px] text-gray-600">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[#fbfcff] px-6 py-5">
        {historyLoading && (
          <div className="mx-auto w-full max-w-[980px] rounded-2xl border border-line bg-white px-4 py-3.5 text-[13px] text-slate-500 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
            正在恢复历史会话...
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="mx-auto w-full max-w-[980px]">
            <div
              className={cn(
                "rounded-2xl px-4 py-3.5 text-[13px] leading-6",
                message.role === "user"
                  ? "ml-auto max-w-[680px] bg-brand text-white shadow-[0_12px_28px_rgba(91,75,255,0.18)]"
                  : "max-w-[920px] border border-line bg-white text-slate-650 shadow-[0_10px_24px_rgba(30,58,138,0.05)]"
              )}
            >
            <div className="whitespace-pre-line">{message.content}</div>
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
                        onClick={() => sendQuestion(question)}
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
            </div>
          </div>
        ))}
        {loading && (
          <div className="mx-auto w-full max-w-[980px]">
            <div className="max-w-[920px] rounded-2xl border border-line bg-white px-4 py-3.5 text-[13px] text-slate-500 shadow-[0_10px_24px_rgba(30,58,138,0.05)]">
              正在检索 IMC&IPM 核心知识节点，并调用 DeepSeek 生成解决方案...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-line/70 bg-white px-6 py-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) {
              sendQuestion();
            }
          }}
          className="relative rounded-[22px] border border-line bg-white py-3 pl-4 pr-[68px] shadow-[0_12px_34px_rgba(30,58,138,0.08)] transition-colors focus-within:border-brand/50"
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            className="block max-h-28 min-h-[44px] w-full resize-none bg-transparent py-2 text-[14px] leading-6 text-ink outline-none placeholder:text-slate-400"
            placeholder="继续提问..."
          />
          <button
            type="submit"
            disabled={!canSend}
            className="brand-gradient absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-soft transition disabled:cursor-not-allowed disabled:opacity-45"
            title={loading ? "正在生成" : "发送"}
          >
            <Icon name={loading ? "refresh" : "send"} className={cn("h-5 w-5", loading && "animate-spin")} />
          </button>
        </form>
      </div>
    </Card>
    {focusOpen && <AssistantFocusMode onClose={() => setFocusOpen(false)} />}
    </>
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
  } = useAssistant();
  const endRef = useRef<HTMLDivElement | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
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
                      onClick={() => sendQuestion(question)}
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
                  <FocusMessage key={message.id} message={message} loading={loading} onAsk={sendQuestion} />
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
  onAsk,
}: {
  message: ReturnType<typeof useAssistant>["messages"][number];
  loading: boolean;
  onAsk: (question?: string) => Promise<void>;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[76%] rounded-[22px] bg-[#f4f4f5] px-5 py-3 text-[14px] leading-7 text-ink">
          {message.content}
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
                  onClick={() => onAsk(question)}
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
      </div>
    </div>
  );
}

function ConversationListItem({
  conversation,
  active,
  onSelect,
  onDelete,
}: {
  conversation: ReturnType<typeof useAssistant>["conversations"][number];
  active: boolean;
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
    if (!window.confirm(`确认删除会话「${conversation.title}」吗？`)) return;
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
      title={conversation.title}
    >
      <Icon name="history" className="h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{conversation.title}</div>
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
