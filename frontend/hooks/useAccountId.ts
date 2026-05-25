'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'lens_account_id';
const ACCOUNT_ID_CHANGE_EVENT = 'lens-account-id-change';

let cachedAccountId: string | null = null;
let isInitialized = false;

type Listener = () => void;

const listeners = new Set<Listener>();

function isValidAccountId(value: string): boolean {
  return /^\d+$/.test(value);
}

function readAccountIdFromStorage(): string | null {
  if (globalThis.window === undefined) {
    return null;
  }

  try {
    const stored = globalThis.window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidAccountId(stored)) {
      return stored;
    }
  } catch {
    return null;
  }

  return null;
}

function getSnapshot(): string | null {
  if (!isInitialized) {
    cachedAccountId = readAccountIdFromStorage();
    isInitialized = true;
  }

  return cachedAccountId;
}

function updateStoredAccountId(value: string | null) {
  if (globalThis.window !== undefined) {
    try {
      if (value === null) {
        globalThis.window.localStorage.removeItem(STORAGE_KEY);
      } else {
        globalThis.window.localStorage.setItem(STORAGE_KEY, value);
      }
    } catch {
      // Ignore storage failures and keep the in-memory snapshot in sync.
    }

    globalThis.window.dispatchEvent(new Event(ACCOUNT_ID_CHANGE_EVENT));
  }

  cachedAccountId = value;
  isInitialized = true;

  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);

  if (globalThis.window !== undefined) {
    const syncFromStorage = () => {
      cachedAccountId = readAccountIdFromStorage();
      isInitialized = true;
      listener();
    };

    globalThis.window.addEventListener('storage', syncFromStorage);
    globalThis.window.addEventListener(ACCOUNT_ID_CHANGE_EVENT, syncFromStorage);

    return () => {
      listeners.delete(listener);
      globalThis.window.removeEventListener('storage', syncFromStorage);
      globalThis.window.removeEventListener(ACCOUNT_ID_CHANGE_EVENT, syncFromStorage);
    };
  }

  return () => {
    listeners.delete(listener);
  };
}

export function useAccountId() {
  const accountId = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const setAccountId = (id: string) => {
    if (!isValidAccountId(id)) {
      return;
    }

    updateStoredAccountId(id);
  };

  const clearAccountId = () => {
    updateStoredAccountId(null);
  };

  return { accountId, setAccountId, clearAccountId };
}
