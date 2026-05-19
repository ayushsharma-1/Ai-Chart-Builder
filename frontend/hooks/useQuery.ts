'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import axios from 'axios';

import api from '@/lib/api';
import { ChatSession, ChartResult, Message } from '@/types';

const STORAGE_KEY = 'lens.chat.state.v2';

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 422) {
      return (error.response?.data?.message as string | undefined)
        || 'I generated a query that our security system blocked. Please try rephrasing your question.';
    }

    return (error.response?.data?.message as string | undefined) || error.message || 'Something went wrong. Please try again later.';
  }

  return error instanceof Error ? error.message : 'Something went wrong. Please try again later.';
}

function replaceLoadingMessage(session: ChatSession, content: string, chartResult?: ChartResult, status: 'done' | 'error' = 'done') {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    messages: session.messages.map((message) => {
      if (message.status !== 'loading') {
        return message;
      }

      return {
        ...message,
        content,
        status,
        ...(chartResult ? { chartResult } : {}),
      };
    }),
  };
}

interface StoredChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
}

function createSession(title = 'New chat'): ChatSession {
  const now = new Date().toISOString();

  return {
    id: uuid(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createLoadingMessage(): Message {
  return {
    id: uuid(),
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    status: 'loading',
  };
}

function getChartFromMessages(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.chartResult) {
      return message.chartResult;
    }
  }

  return null;
}

function createDefaultState(): StoredChatState {
  const session = createSession();

  return {
    sessions: [session],
    activeSessionId: session.id,
  };
}

function readStoredState(): StoredChatState | null {
  if (globalThis.window === undefined) {
    return null;
  }

  try {
    const stored = globalThis.window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as StoredChatState | ChatSession[];

    if (Array.isArray(parsed)) {
      return {
        sessions: parsed,
        activeSessionId: parsed[0]?.id || null,
      };
    }

    if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
      return {
        sessions: parsed.sessions,
        activeSessionId: parsed.activeSessionId || parsed.sessions[0].id,
      };
    }
  } catch (error) {
    console.error('Failed to restore chat sessions:', error);
  }

  return null;
}

export function useQuery() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedState = readStoredState() || createDefaultState();

    setSessions(storedState.sessions);
    setActiveSessionId(storedState.activeSessionId || storedState.sessions[0].id);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    globalThis.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessions, activeSessionId } satisfies StoredChatState),
    );
  }, [activeSessionId, isHydrated, sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || null,
    [activeSessionId, sessions],
  );

  const messages = activeSession?.messages || [];
  const currentChart = getChartFromMessages(messages);

  const newChat = useCallback(() => {
    const nextSession = createSession();
    setSessions((previous) => [nextSession, ...previous]);
    setActiveSessionId(nextSession.id);
    setIsLoading(false);
  }, []);

  const selectChat = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsLoading(false);
  }, []);

  const deleteChat = useCallback((sessionId: string) => {
    setSessions((previous) => {
      const remaining = previous.filter((session) => session.id !== sessionId);

      if (remaining.length === 0) {
        const fresh = createSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }

      setActiveSessionId((currentActiveSessionId) => {
        if (currentActiveSessionId === sessionId) {
          return remaining[0].id;
        }

        return currentActiveSessionId;
      });

      return remaining;
    });
  }, []);

  const sendPrompt = useCallback(async (prompt: string) => {
    const userMsg: Message = {
      id: uuid(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
      status: 'done',
    };

    const loadingMsg = createLoadingMessage();

    setSessions((previous) => previous.map((session) => {
      if (session.id !== activeSessionId) {
        return session;
      }

      const nextTitle = session.title === 'New chat' ? prompt.slice(0, 48) : session.title;

      return {
        ...session,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        messages: [...session.messages, userMsg, loadingMsg],
      };
    }));
    setIsLoading(true);

    try {
      const { data } = await api.post('/api/query', {
        prompt,
        context: currentChart ? {
          previousPrompt: currentChart.prompt,
          previousTitle: currentChart.title,
          previousSql: currentChart.sql,
          previousChartType: currentChart.chartType,
        } : undefined,
      });

      if (data.success) {
        const result: ChartResult = {
          title: data.title,
          chartType: data.chartType,
          chartConfig: data.chartConfig,
          data: data.data,
          rowCount: data.rowCount,
          executionTimeMs: data.executionTimeMs,
          sql: data.sql,
          reasoning: data.reasoning,
          aiExplanation: data.aiExplanation,
          queryConfidence: data.queryConfidence,
          metricLineage: data.metricLineage,
          prompt,
          executionMetadata: data.executionMetadata,
        };

        setSessions((previous) => previous.map((session) => (
          session.id === activeSessionId
            ? replaceLoadingMessage(session, `Chart ready: ${data.title}. ${data.rowCount} rows in ${data.executionTimeMs}ms.`, result, 'done')
            : session
        )));
      } else {
        setSessions((previous) => previous.map((session) => (
          session.id === activeSessionId
            ? replaceLoadingMessage(session, data.message, undefined, 'error')
            : session
        )));
      }
    } catch (error) {
      const fallbackMessage = getErrorMessage(error);

      setSessions((previous) => previous.map((session) => (
        session.id === activeSessionId
          ? replaceLoadingMessage(session, fallbackMessage, undefined, 'error')
          : session
      )));
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, currentChart]);

  return {
    sessions,
    activeSession,
    activeSessionId,
    messages,
    currentChart,
    isLoading,
    sendPrompt,
    newChat,
    selectChat,
    deleteChat,
  };
}
