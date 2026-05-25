'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import axios from 'axios';

import api from '@/lib/api';
import { ChatSession, ChartResult, Message } from '@/types';
import { useAccountId } from './useAccountId';

const STORAGE_KEY = 'lens.chat.state.v2';

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 422) {
      return (error.response?.data?.message as string | undefined)
        || 'Please simplify your prompt or query and try again.';
    }

    return (error.response?.data?.message as string | undefined) || error.message || 'Something went wrong. Please try again later.';
  }

  return error instanceof Error ? error.message : 'Something went wrong. Please try again later.';
}

function replaceLoadingMessage(
  session: ChatSession,
  content: string,
  chartResult?: ChartResult,
  status: 'done' | 'error' = 'done',
  type?: Message['type'],
) {
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
        ...(type ? { type } : {}),
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

function applySuccessResponse(
  sessions: ChatSession[],
  activeSessionId: string,
  prompt: string,
  data: any,
) {
  const result: ChartResult = {
    title: data.title,
    chartType: data.chartType,
    renderAs: data.renderAs,
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
    chartOverrideReason: data.chartOverrideReason,
    chartConfidence: data.chartConfidence,
    pieDisabled: data.pieDisabled,
    pieDisabledReason: data.pieDisabledReason,
    fromCache: data.fromCache,
    pipeline: data.pipeline,
  };

  const overrideNote = data.chartOverrideReason
    ? ` _(Chart adjusted: ${data.chartOverrideReason})_`
    : '';
  const successMessage = data.renderAs === 'text'
    ? `Lookup ready: ${data.title}. ${data.rowCount} rows in ${data.executionTimeMs}ms.${overrideNote}`
    : `Chart ready: ${data.title}. ${data.rowCount} rows in ${data.executionTimeMs}ms.${overrideNote}`;

  return sessions.map((session) => (
    session.id === activeSessionId
      ? replaceLoadingMessage(session, successMessage, result, 'done')
      : session
  ));
}

function applyFailureResponse(
  sessions: ChatSession[],
  activeSessionId: string,
  data: { type: string; message?: string },
) {
  const responseMessage = data.type === 'validation_error'
    ? (data.message || 'Please simplify your prompt or query and try again.')
    : (data.message || 'Something went wrong. Please try again later.');

  let nextStatus: 'done' | 'error' = 'done';
  let nextType: Message['type'] | undefined;

  if (data.type === 'error' || data.type === 'rate_limit') {
    nextStatus = 'error';
    nextType = 'error';
  } else if (data.type === 'validation_error') {
    nextType = 'clarification';
  } else if (data.type === 'clarification' || data.type === 'non_analytics') {
    nextType = data.type;
  }

  return sessions.map((session) => (
    session.id === activeSessionId
      ? replaceLoadingMessage(session, responseMessage, undefined, nextStatus, nextType)
      : session
  ));
}

function normalizeStoredMessages(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') {
      return message;
    }

    if (message.status !== 'error') {
      return message;
    }

    if (message.type === 'clarification' || message.type === 'non_analytics' || message.type === 'validation_error') {
      return {
        ...message,
        status: 'done' as const,
      };
    }

    return message;
  });
}

function normalizeStoredSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session): ChatSession => ({
    ...session,
    messages: normalizeStoredMessages(session.messages),
  }));
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
        sessions: normalizeStoredSessions(parsed),
        activeSessionId: parsed[0]?.id || null,
      };
    }

    if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
      return {
        sessions: normalizeStoredSessions(parsed.sessions),
        activeSessionId: parsed.activeSessionId || parsed.sessions[0].id,
      };
    }
  } catch (error) {
    console.error('Failed to restore chat sessions:', error);
  }

  return null;
}

export function useQuery() {
  const { accountId } = useAccountId();
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
    if (!accountId) {
      return;
    }

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
        accountId,
        previousContext: currentChart ? {
          previousPrompt: currentChart.prompt,
          previousTitle: currentChart.title,
          previousSql: currentChart.sql,
          previousChartType: currentChart.chartType,
        } : undefined,
      });

      if (data.success) {
        setSessions((previous) => previous.map((session) => (
          session.id === activeSessionId
            ? applySuccessResponse([session], activeSessionId, prompt, data)[0]
            : session
        )));
      } else {
        setSessions((previous) => previous.map((session) => (
          session.id === activeSessionId
            ? applyFailureResponse([session], activeSessionId, data)[0]
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
  }, [accountId, activeSessionId, currentChart]);

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
