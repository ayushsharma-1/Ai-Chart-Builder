'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

type SaveAction = () => Promise<unknown>;

interface Options {
  persistSuccess?: boolean;
}

function logSaveError(scope: string, saveError: unknown) {
  if (axios.isAxiosError(saveError)) {
    console.error(`[useSaveChart] ${scope} failed`, {
      message: saveError.message,
      code: saveError.code,
      status: saveError.response?.status,
      responseData: saveError.response?.data,
      method: saveError.config?.method,
      url: saveError.config?.url,
      timeout: saveError.config?.timeout,
    });
    return;
  }

  console.error(`[useSaveChart] ${scope} failed`, saveError);
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
      logSaveError('runSave', saveError);
      setError('Something went wrong. Please try again.');
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