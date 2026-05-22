'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type SaveAction = () => Promise<unknown>;

interface Options {
  persistSuccess?: boolean;
}

export function useSaveChart(saveAction: SaveAction, options: Options = {}) {
  const { persistSuccess = true } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      saveInFlightRef.current = false;
    };
  }, []);

  const runSave = useCallback(async () => {
    if (isSaving || saveInFlightRef.current || isSaved) {
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    setError(null);
    setIsSaved(false);

    try {
      const result = await saveAction();
      setIsSaved(true);

      return result;
    } catch (saveError: any) {
      const message = saveError?.response?.data?.message || saveError?.message || 'Unable to save right now.';
      setError(message);
      throw saveError;
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [isSaving, isSaved, saveAction]);

  const reset = useCallback(() => {
    setIsSaved(false);
    setError(null);
    saveInFlightRef.current = false;
  }, []);

  return { runSave, isSaving, isSaved, error, reset };
}