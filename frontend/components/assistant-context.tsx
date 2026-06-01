"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  assistantApi,
  type AssistantConversationRecord,
  type AssistantMessageRecord,
  type AssistantNodeRef,
} from "@/lib/api";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  nodeRefs?: AssistantNodeRef[];
  suggestedQuestions?: string[];
  usedLlm?: boolean;
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
  sendQuestion: (question?: string) => Promise<void>;
  createConversation: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const WELCOME_MESSAGE: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是 IMC&IPM 智能助手。你可以直接输入企业诉求，我会结合核心知识节点与 DeepSeek，给出基于 IMC&IPM 方法论的解决建议。",
};

function mapRecordToMessage(record: AssistantMessageRecord): AssistantMessage {
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    usedLlm: record.used_llm,
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
        const rows = await assistantApi.conversations();
        if (cancelled) return;
        setConversations(rows);
        const savedId =
          typeof window !== "undefined"
            ? window.localStorage.getItem("imc_ipm_active_assistant_conversation")
            : null;
        const nextId = savedId && rows.some((row) => row.id === savedId) ? savedId : rows[0]?.id ?? "default";
        setActiveConversationId(nextId);
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
    async (question?: string) => {
      const text = (question ?? input).trim();
      if (!text || loading) return;
      const conversationId = activeConversationId;

      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: "user",
          content: text,
        },
      ]);
      setInput("");
      setLoading(true);
      try {
        const result = await assistantApi.ask(text, undefined, conversationId);
        if (result.conversation_id && result.conversation_id !== activeConversationId) {
          setActiveConversationId(result.conversation_id);
          window.localStorage.setItem("imc_ipm_active_assistant_conversation", result.conversation_id);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
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
