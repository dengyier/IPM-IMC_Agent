"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  assistantApi,
  type AssistantAttachment,
  type AssistantAskResponse,
  type AssistantConversationRecord,
  type AssistantDepositFileResult,
  type AssistantDepositMessageResult,
  type AssistantMessageRecord,
  type AssistantNodeRef,
  type TianjiSimulationResult,
} from "@/lib/api";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AssistantAttachment[];
  nodeRefs?: AssistantNodeRef[];
  suggestedQuestions?: string[];
  tianjiSimulation?: TianjiSimulationResult | null;
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
  conversations: AssistantConversation[];
  activeConversationId: string | null;
  loading: boolean;
  historyLoading: boolean;
  setInput: (value: string) => void;
  sendQuestion: (
    question?: string,
    companyContext?: string,
    attachments?: AssistantAttachment[],
    projectId?: string | null,
    validationCardId?: string | null
  ) => Promise<void>;
  createConversation: () => Promise<void>;
  ensureActiveConversation: () => Promise<string | null>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  depositAttachment: (fileId: string) => Promise<AssistantDepositFileResult>;
  depositMessage: (messageId: string) => Promise<AssistantDepositMessageResult>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);
const ACTIVE_CONVERSATION_KEY = "imc_ipm_active_assistant_conversation";
const DRAFT_CONVERSATION_PREFIX = "local-draft-";

export type AssistantConversation = AssistantConversationRecord & {
  isLocalDraft?: boolean;
};

const WELCOME_MESSAGE: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是天机AI商业决策智能体。你可以直接输入企业诉求，我会结合港大 IMC&IPM 核心方法论、知识图谱与 DeepSeek，给出可执行的商业判断、风险审计和验证计划。",
};

function titleFromQuestion(question: string): string {
  const title = question.trim().replace(/\s+/g, " ");
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function isPlaceholderTitle(title?: string | null): boolean {
  return !title || ["新会话", "历史会话"].includes(title.trim());
}

function isLocalDraftConversation(conversation?: AssistantConversation | null): boolean {
  return Boolean(conversation?.isLocalDraft || conversation?.id.startsWith(DRAFT_CONVERSATION_PREFIX));
}

function createLocalDraftConversation(): AssistantConversation {
  const now = new Date().toISOString();
  return {
    id: `${DRAFT_CONVERSATION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "新会话",
    message_count: 0,
    created_at: now,
    updated_at: now,
    isLocalDraft: true,
  };
}

function countConversationMessages(messages: AssistantMessage[]): number {
  return messages.filter((message) => message.id !== WELCOME_MESSAGE.id).length;
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
    tianjiSimulation: record.tianji_simulation ?? null,
    action:
      record.action_label && record.action_href
        ? { label: record.action_label, href: record.action_href }
        : undefined,
  };
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [input, setInput] = useState("");
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [messages, setMessages] = useState<AssistantMessage[]>([WELCOME_MESSAGE]);
  const [messageCache, setMessageCache] = useState<Record<string, AssistantMessage[]>>({});
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<AssistantConversation[]>([]);
  const messageCacheRef = useRef<Record<string, AssistantMessage[]>>({});

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messageCacheRef.current = messageCache;
  }, [messageCache]);

  const loading = loadingConversationId === activeConversationId;

  const rememberInput = useCallback((value: string, conversationId?: string | null) => {
    const key = conversationId ?? activeConversationIdRef.current;
    if (!key) return;
    setInputDrafts((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setInputForActive = useCallback(
    (value: string) => {
      setInput(value);
      rememberInput(value);
    },
    [rememberInput]
  );

  const setActiveConversation = useCallback((conversationId: string | null) => {
    setActiveConversationId(conversationId);
    activeConversationIdRef.current = conversationId;
    if (typeof window === "undefined") return;
    if (conversationId) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
    } else {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string | null) => {
    setHistoryLoading(true);
    try {
      if (!conversationId) {
        setMessages([WELCOME_MESSAGE]);
        return;
      }

      const cached = messageCacheRef.current[conversationId];
      if (cached && activeConversationIdRef.current === conversationId) {
        setMessages(cached);
      }

      const conversation = conversationsRef.current.find((row) => row.id === conversationId);
      if (isLocalDraftConversation(conversation)) {
        setMessages(cached || [WELCOME_MESSAGE]);
        return;
      }

      const records = await assistantApi.messages(conversationId);
      const nextMessages = records.length > 0 ? records.map(mapRecordToMessage) : [WELCOME_MESSAGE];
      setMessageCache((prev) => ({ ...prev, [conversationId]: nextMessages }));
      if (activeConversationIdRef.current === conversationId) {
        setMessages(nextMessages);
      }
    } catch {
      if (conversationId && messageCacheRef.current[conversationId]) return;
      if (activeConversationIdRef.current === conversationId) {
        setMessages([WELCOME_MESSAGE]);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const rows = await assistantApi.conversations();
    setConversations((prev) => {
      const drafts = prev.filter((conversation) => isLocalDraftConversation(conversation));
      const draftIds = new Set(drafts.map((conversation) => conversation.id));
      const next = [...drafts, ...rows.filter((row) => !draftIds.has(row.id))];
      conversationsRef.current = next;
      return next;
    });
    return rows;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        let rows = await assistantApi.conversations();
        if (cancelled) return;
        // 首次进入只创建本地草稿，等用户真正发送问题后再落库，避免历史里出现空会话。
        if (rows.length === 0) {
          const draft = createLocalDraftConversation();
          const nextMessages = [WELCOME_MESSAGE];
          setConversations([draft]);
          conversationsRef.current = [draft];
          setActiveConversation(draft.id);
          setMessageCache({ [draft.id]: nextMessages });
          setMessages(nextMessages);
          return;
        }
        setConversations(rows);
        conversationsRef.current = rows;
        const savedId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(ACTIVE_CONVERSATION_KEY)
            : null;
        const nextId = savedId && rows.some((row) => row.id === savedId) ? savedId : rows[0]?.id ?? null;
        setActiveConversation(nextId);
        const records = nextId ? await assistantApi.messages(nextId) : [];
        if (!cancelled) {
          const nextMessages = records.length > 0 ? records.map(mapRecordToMessage) : [WELCOME_MESSAGE];
          setMessages(nextMessages);
          if (nextId) setMessageCache((prev) => ({ ...prev, [nextId]: nextMessages }));
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
  }, [setActiveConversation]);

  const replaceDraftConversation = useCallback(
    (draftId: string, realConversation: AssistantConversationRecord, title?: string) => {
      const realTitle = title || realConversation.title;
      setConversations((prev) => {
        const next = prev.map((conversation) =>
          conversation.id === draftId
            ? {
                ...realConversation,
                title: isPlaceholderTitle(realConversation.title) ? realTitle : realConversation.title,
                isLocalDraft: false,
              }
            : conversation
        );
        conversationsRef.current = next;
        return next;
      });
      setInputDrafts((prev) => {
        const next = { ...prev };
        next[realConversation.id] = next[draftId] || "";
        delete next[draftId];
        return next;
      });
      setMessageCache((prev) => {
        if (!prev[draftId]) return prev;
        const next = { ...prev, [realConversation.id]: prev[draftId] };
        delete next[draftId];
        return next;
      });
      if (activeConversationIdRef.current === draftId) {
        setActiveConversation(realConversation.id);
      }
    },
    [setActiveConversation]
  );

  const ensureActiveConversation = useCallback(async () => {
    const currentId = activeConversationIdRef.current;
    const current = conversationsRef.current.find((conversation) => conversation.id === currentId);
    if (current && !isLocalDraftConversation(current)) return current.id;

    const conversation = await assistantApi.createConversation("新会话");
    if (currentId && current && isLocalDraftConversation(current)) {
      replaceDraftConversation(currentId, conversation);
    } else {
      setConversations((prev) => {
        const next = [conversation, ...prev];
        conversationsRef.current = next;
        return next;
      });
      setActiveConversation(conversation.id);
    }
    return conversation.id;
  }, [replaceDraftConversation, setActiveConversation]);

  const sendQuestion = useCallback(
    async (
      question?: string,
      companyContext?: string,
      attachments?: AssistantAttachment[],
      projectId?: string | null,
      validationCardId?: string | null
    ) => {
      const text = (question ?? input).trim();
      if (!text || loadingConversationId) return;
      const now = new Date().toISOString();
      const nextTitle = titleFromQuestion(text);
      let conversationId = activeConversationIdRef.current;
      let conversation = conversationsRef.current.find((row) => row.id === conversationId);

      if (!conversationId || !conversation) {
        const draft = createLocalDraftConversation();
        conversationId = draft.id;
        conversation = draft;
        const nextConversations = [draft, ...conversationsRef.current];
        conversationsRef.current = nextConversations;
        setConversations(nextConversations);
        setActiveConversation(draft.id);
      }

      const apiConversationId = isLocalDraftConversation(conversation) ? null : conversationId;
      const optimisticUserMessage: AssistantMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        attachments,
      };
      const streamMessageId = `a-stream-${Date.now()}`;
      const optimisticAssistantMessage: AssistantMessage = {
        id: streamMessageId,
        role: "assistant",
        content: "正在读取会话上下文...",
      };
      const baseMessages = messageCacheRef.current[conversationId] || messages;
      const optimisticMessages = [...baseMessages, optimisticUserMessage, optimisticAssistantMessage];

      setConversations((prev) => {
        const next = prev.map((row) =>
          row.id === conversationId
            ? {
                ...row,
                title: isPlaceholderTitle(row.title) ? nextTitle : row.title,
                message_count: Math.max(row.message_count, countConversationMessages(optimisticMessages)),
                updated_at: now,
              }
            : row
        );
        conversationsRef.current = next;
        return next;
      });
      setMessageCache((prev) => ({ ...prev, [conversationId]: optimisticMessages }));
      if (activeConversationIdRef.current === conversationId) {
        setMessages(optimisticMessages);
      }
      setInput("");
      rememberInput("", conversationId);
      setLoadingConversationId(conversationId);
      try {
        let result: AssistantAskResponse | null = null;
        let streamedAnswer = "";
        let streamConversationId: string | null = null;
        const updateStreamMessage = (updater: (message: AssistantMessage) => AssistantMessage) => {
          const currentMessages = messageCacheRef.current[conversationId] || optimisticMessages;
          const nextMessages = currentMessages.map((message) =>
            message.id === streamMessageId ? updater(message) : message
          );
          const nextCache = { ...messageCacheRef.current, [conversationId]: nextMessages };
          messageCacheRef.current = nextCache;
          setMessageCache(nextCache);
          if (activeConversationIdRef.current === conversationId) {
            setMessages(nextMessages);
          }
        };

        await assistantApi.askStream(text, companyContext, apiConversationId, attachments, projectId, validationCardId, {
          onMeta: (data) => {
            streamConversationId = data.conversation_id || null;
          },
          onPhase: (data) => {
            if (streamedAnswer) return;
            updateStreamMessage((message) => ({ ...message, content: data.message || message.content }));
          },
          onDelta: (data) => {
            streamedAnswer += data.text || "";
            updateStreamMessage((message) => ({ ...message, content: streamedAnswer }));
          },
          onFinal: (data) => {
            result = data;
          },
        });
        const finalResult = result as AssistantAskResponse | null;
        if (!finalResult) throw new Error("流式问答未返回完整结果");
        const nextConversationId = finalResult.conversation_id || conversationId;
        const assistantMessage: AssistantMessage = {
          id: finalResult.assistant_message_id || `a-${Date.now()}`,
          role: "assistant",
          content: finalResult.answer,
          usedLlm: finalResult.used_llm,
          nodeRefs: finalResult.node_refs,
          suggestedQuestions: finalResult.suggested_questions,
          tianjiSimulation: finalResult.tianji_simulation ?? null,
          action:
            finalResult.action_label && finalResult.action_href
              ? { label: finalResult.action_label, href: finalResult.action_href }
              : undefined,
        };
        const cachedMessages = messageCacheRef.current[conversationId] || optimisticMessages;
        const nextMessages = cachedMessages.map((message) =>
          message.id === streamMessageId ? assistantMessage : message
        );

        if ((streamConversationId || nextConversationId) !== conversationId) {
          const realConversationId = streamConversationId || nextConversationId;
          setConversations((prev) => {
            let replaced = false;
            const next = prev.map((row) => {
              if (row.id !== conversationId) return row;
              replaced = true;
              return {
                id: realConversationId,
                title: nextTitle,
                message_count: countConversationMessages(nextMessages),
                created_at: row.created_at || now,
                updated_at: new Date().toISOString(),
                isLocalDraft: false,
              };
            });
            const finalRows = replaced
              ? next
              : [
                  {
                    id: realConversationId,
                    title: nextTitle,
                    message_count: countConversationMessages(nextMessages),
                    created_at: now,
                    updated_at: new Date().toISOString(),
                    isLocalDraft: false,
                  },
                  ...next,
                ];
            conversationsRef.current = finalRows;
            return finalRows;
          });
          setMessageCache((prev) => {
            const next = { ...prev, [realConversationId]: nextMessages };
            delete next[conversationId];
            messageCacheRef.current = next;
            return next;
          });
          setInputDrafts((prev) => {
            const next = { ...prev, [realConversationId]: "" };
            delete next[conversationId];
            return next;
          });
          if (activeConversationIdRef.current === conversationId) {
            setActiveConversation(realConversationId);
            setMessages(nextMessages);
          }
        } else {
          setMessageCache((prev) => ({ ...prev, [nextConversationId]: nextMessages }));
          if (activeConversationIdRef.current === nextConversationId) {
            setMessages(nextMessages);
          }
        }
        if (nextConversationId) {
          setConversations((prev) => {
            const next = prev.map((conversation) =>
              conversation.id === nextConversationId
                ? {
                    ...conversation,
                    title: isPlaceholderTitle(conversation.title) ? nextTitle : conversation.title,
                    message_count: Math.max(conversation.message_count, countConversationMessages(nextMessages)),
                    updated_at: new Date().toISOString(),
                  }
                : conversation
            );
            conversationsRef.current = next;
            return next;
          });
        }
        refreshConversations().catch(() => undefined);
      } catch (error) {
        const errorMessage: AssistantMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content:
            error instanceof Error
              ? `助手服务暂时不可用：${error.message}`
              : "助手服务暂时不可用，请稍后再试。",
        };
        const currentMessages = messageCacheRef.current[conversationId] || optimisticMessages;
        const hasStreamMessage = currentMessages.some((message) => message.id === streamMessageId);
        const nextMessages = hasStreamMessage
          ? currentMessages.map((message) => (message.id === streamMessageId ? errorMessage : message))
          : [...currentMessages, errorMessage];
        setMessageCache((prev) => ({ ...prev, [conversationId]: nextMessages }));
        if (activeConversationIdRef.current === conversationId) {
          setMessages(nextMessages);
        }
      } finally {
        setLoadingConversationId((current) => (current === conversationId ? null : current));
      }
    },
    [input, loadingConversationId, messages, refreshConversations, rememberInput, setActiveConversation]
  );

  const createConversation = useCallback(async () => {
    const conversation = createLocalDraftConversation();
    setConversations((prev) => {
      const next = [conversation, ...prev];
      conversationsRef.current = next;
      return next;
    });
    setActiveConversation(conversation.id);
    setMessageCache((prev) => ({ ...prev, [conversation.id]: [WELCOME_MESSAGE] }));
    setMessages([WELCOME_MESSAGE]);
    setInput("");
    rememberInput("", conversation.id);
  }, [rememberInput, setActiveConversation]);

  const selectConversation = useCallback(
    async (id: string) => {
      setActiveConversation(id);
      setInput(inputDrafts[id] || "");
      const conversation = conversationsRef.current.find((row) => row.id === id);
      const cached = messageCacheRef.current[id];
      if (cached) {
        setMessages(cached);
      }
      if (isLocalDraftConversation(conversation)) {
        setMessages(cached || [WELCOME_MESSAGE]);
        setHistoryLoading(false);
        return;
      }
      await loadMessages(id);
    },
    [inputDrafts, loadMessages, setActiveConversation]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const conversation = conversationsRef.current.find((row) => row.id === id);
      if (isLocalDraftConversation(conversation)) {
        const remaining = conversationsRef.current.filter((row) => row.id !== id);
        conversationsRef.current = remaining;
        setConversations(remaining);
        setMessageCache((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setInputDrafts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        const nextId = activeConversationIdRef.current === id ? remaining[0]?.id ?? null : activeConversationIdRef.current;
        setActiveConversation(nextId);
        if (activeConversationIdRef.current === nextId && nextId) {
          await selectConversation(nextId);
        } else if (!nextId) {
          setMessages([WELCOME_MESSAGE]);
          setInput("");
        }
        return;
      }

      await assistantApi.deleteConversation(id);
      const rows = await refreshConversations();
      const localDrafts = conversationsRef.current.filter((row) => row.id !== id && isLocalDraftConversation(row));
      const nextId = [...localDrafts, ...rows][0]?.id ?? null;
      setActiveConversation(nextId);
      if (nextId) {
        await loadMessages(nextId);
      } else {
        setMessages([WELCOME_MESSAGE]);
        setInput("");
      }
    },
    [loadMessages, refreshConversations, selectConversation, setActiveConversation]
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
      setInput: setInputForActive,
      sendQuestion,
      createConversation,
      ensureActiveConversation,
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
      ensureActiveConversation,
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
