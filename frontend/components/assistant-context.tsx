"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  assistantApi,
  type AssistantAttachment,
  type AssistantConversationRecord,
  type AssistantDepositFileResult,
  type AssistantDepositMessageResult,
  type AssistantMessageRecord,
  type AssistantNodeRef,
} from "@/lib/api";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AssistantAttachment[];
  nodeRefs?: AssistantNodeRef[];
  suggestedQuestions?: string[];
  usedLlm?: boolean;
  depositedSourceId?: string | null;
  itemCount?: number | null;
  reviewTaskCount?: number | null;
  sourceStatus?: string | null;
  action?: {
    label: string;
    href: string;
  };
};

type AssistantContextValue = {
  input: string;
  messages: AssistantMessage[];
  conversations: AssistantConversationRecord[];
  activeConversationId: string | null;
  loading: boolean;
  historyLoading: boolean;
  setInput: (value: string) => void;
  sendQuestion: (question?: string, companyContext?: string, attachments?: AssistantAttachment[]) => Promise<void>;
  createConversation: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  depositAttachment: (fileId: string) => Promise<AssistantDepositFileResult>;
  depositMessage: (messageId: string) => Promise<AssistantDepositMessageResult>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const WELCOME_MESSAGE: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是 IMC&IPM 智能助手。你可以直接输入企业诉求，我会结合核心知识节点与 DeepSeek，给出基于 IMC&IPM 方法论的解决建议。",
};

function titleFromQuestion(question: string): string {
  const title = question.trim().replace(/\s+/g, " ");
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function isPlaceholderTitle(title?: string | null): boolean {
  return !title || ["新会话", "历史会话"].includes(title.trim());
}

function mapRecordToMessage(record: AssistantMessageRecord): AssistantMessage {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    attachments: record.attachments || [],
    usedLlm: record.used_llm,
    depositedSourceId: record.deposited_source_id,
    itemCount: record.item_count,
    reviewTaskCount: record.review_task_count,
    sourceStatus: record.source_status,
    nodeRefs: record.node_refs,
    suggestedQuestions: record.suggested_questions,
    action:
      record.action_label && record.action_href
        ? { label: record.action_label, href: record.action_href }
        : undefined,
  };
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [messages, setMessages] = useState<AssistantMessage[]>([WELCOME_MESSAGE]);
  const [conversations, setConversations] = useState<AssistantConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const loadMessages = useCallback(async (conversationId: string | null) => {
    setHistoryLoading(true);
    try {
      const records = await assistantApi.messages(conversationId || undefined);
      setMessages(records.length > 0 ? records.map(mapRecordToMessage) : [WELCOME_MESSAGE]);
    } catch {
      setMessages([WELCOME_MESSAGE]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const rows = await assistantApi.conversations();
    setConversations(rows);
    return rows;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        let rows = await assistantApi.conversations();
        if (cancelled) return;
        // 首次进入：若没有任何会话，默认建一个，保证右侧列表始终有一条对话。
        if (rows.length === 0) {
          await assistantApi.createConversation("新会话").catch(() => undefined);
          rows = await assistantApi.conversations();
          if (cancelled) return;
        }
        setConversations(rows);
        const savedId =
          typeof window !== "undefined"
            ? window.localStorage.getItem("imc_ipm_active_assistant_conversation")
            : null;
        const nextId = savedId && rows.some((row) => row.id === savedId) ? savedId : rows[0]?.id ?? "default";
        setActiveConversationId(nextId);
        if (nextId && typeof window !== "undefined") {
          window.localStorage.setItem("imc_ipm_active_assistant_conversation", nextId);
        }
        const records = await assistantApi.messages(nextId);
        if (!cancelled) {
          setMessages(records.length > 0 ? records.map(mapRecordToMessage) : [WELCOME_MESSAGE]);
        }
      } catch {
        if (!cancelled) setMessages([WELCOME_MESSAGE]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendQuestion = useCallback(
    async (question?: string, companyContext?: string, attachments?: AssistantAttachment[]) => {
      const text = (question ?? input).trim();
      if (!text || loading) return;
      const conversationId = activeConversationId;

      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          content: text,
          attachments,
        },
      ]);
      setInput("");
      setLoading(true);
      try {
        const result = await assistantApi.ask(text, companyContext, conversationId, attachments);
        const nextConversationId = result.conversation_id || conversationId;
        if (result.conversation_id && result.conversation_id !== activeConversationId) {
          setActiveConversationId(result.conversation_id);
          window.localStorage.setItem("imc_ipm_active_assistant_conversation", result.conversation_id);
        }
        if (nextConversationId) {
          const nextTitle = titleFromQuestion(text);
          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === nextConversationId && isPlaceholderTitle(conversation.title)
                ? { ...conversation, title: nextTitle }
                : conversation
            )
          );
        }
        setMessages((prev) => [
          ...prev,
          {
            id: result.assistant_message_id || `a-${Date.now()}`,
            role: "assistant",
            content: result.answer,
            usedLlm: result.used_llm,
            nodeRefs: result.node_refs,
            suggestedQuestions: result.suggested_questions,
            action:
              result.action_label && result.action_href
                ? { label: result.action_label, href: result.action_href }
                : undefined,
          },
        ]);
        refreshConversations().catch(() => undefined);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content:
              error instanceof Error
                ? `助手服务暂时不可用：${error.message}`
                : "助手服务暂时不可用，请稍后再试。",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [activeConversationId, input, loading, refreshConversations]
  );

  const createConversation = useCallback(async () => {
    const conversation = await assistantApi.createConversation("新会话");
    setConversations((prev) => [conversation, ...prev]);
    setActiveConversationId(conversation.id);
    window.localStorage.setItem("imc_ipm_active_assistant_conversation", conversation.id);
    setMessages([WELCOME_MESSAGE]);
    setInput("");
  }, []);

  const selectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      window.localStorage.setItem("imc_ipm_active_assistant_conversation", id);
      await loadMessages(id);
    },
    [loadMessages]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await assistantApi.deleteConversation(id);
      const rows = await refreshConversations();
      const nextId = rows[0]?.id ?? null;
      setActiveConversationId(nextId);
      if (nextId) {
        window.localStorage.setItem("imc_ipm_active_assistant_conversation", nextId);
        await loadMessages(nextId);
      } else {
        window.localStorage.removeItem("imc_ipm_active_assistant_conversation");
        setMessages([WELCOME_MESSAGE]);
      }
    },
    [loadMessages, refreshConversations]
  );

  const depositAttachment = useCallback(
    async (fileId: string) => {
      const result = await assistantApi.depositFile(fileId);
      // 原地更新该附件状态，避免全量重载触发滚动到底部
      setMessages((prev) =>
        prev.map((message) => {
          if (!message.attachments?.some((att) => att.file_id === fileId)) return message;
          return {
            ...message,
            attachments: message.attachments.map((att) =>
              att.file_id === fileId
                ? {
                    ...att,
                    status: "deposited",
                    deposited_source_id: result.source_id,
                    item_count: result.item_count,
                    review_task_count: result.review_task_count,
                    source_status: result.status,
                  }
                : att
            ),
          };
        })
      );
      refreshConversations().catch(() => undefined);
      return result;
    },
    [refreshConversations]
  );

  const depositMessage = useCallback(
    async (messageId: string) => {
      const result = await assistantApi.depositMessage(messageId);
      // 原地更新该消息状态，避免全量重载触发滚动到底部
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                depositedSourceId: result.source_id,
                itemCount: result.item_count,
                reviewTaskCount: result.review_task_count,
                sourceStatus: result.status,
              }
            : message
        )
      );
      refreshConversations().catch(() => undefined);
      return result;
    },
    [refreshConversations]
  );

  const value = useMemo(
    () => ({
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
    }),
    [
      input,
      messages,
      conversations,
      activeConversationId,
      loading,
      historyLoading,
      sendQuestion,
      createConversation,
      selectConversation,
      deleteConversation,
      depositAttachment,
      depositMessage,
    ]
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) {
    throw new Error("useAssistant must be used inside AssistantProvider");
  }
  return value;
}
