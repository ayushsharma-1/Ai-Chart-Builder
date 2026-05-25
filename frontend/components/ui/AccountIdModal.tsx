'use client';

import { useEffect, useState } from 'react';

import { useAccountId } from '@/hooks/useAccountId';

interface AccountIdModalProps {
  open?: boolean;
  mode?: 'create' | 'edit';
  initialAccountId?: string | null;
  onClose?: () => void;
}

function isValidAccountId(value: string): boolean {
  return /^\d+$/.test(value);
}

export default function AccountIdModal({
  open = true,
  mode = 'create',
  initialAccountId = null,
  onClose,
}: Readonly<AccountIdModalProps>) {
  const { accountId, setAccountId } = useAccountId();
  const [value, setValue] = useState(initialAccountId || accountId || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setValue(initialAccountId || accountId || '');
    setError('');
  }, [accountId, initialAccountId, open]);

  if (!open) {
    return null;
  }

  const title = mode === 'edit' ? 'Update Account ID' : 'Enter your Account ID';

  const handleConfirm = () => {
    const trimmed = value.trim();

    if (!isValidAccountId(trimmed)) {
      setError('Account ID must be a number.');
      return;
    }

    setError('');
    setAccountId(trimmed);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-[#1E1E2E] bg-[#0E0E15] p-6 shadow-2xl shadow-black/40">
        <div className="space-y-2">
          <h2 className="font-syne text-xl font-bold text-[#F0F0FF]">{title}</h2>
          <p className="text-sm leading-relaxed text-[#7B7B9A]">
            Required to query your recruitment data. Contact your admin if you don&apos;t have one.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <label htmlFor="account-id" className="text-xs font-medium uppercase tracking-[0.12em] text-[#7B7B9A]">
            Account ID
          </label>
          <input
            id="account-id"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) {
                setError('');
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleConfirm();
              }
            }}
            placeholder="e.g. 1042"
            className="h-11 w-full rounded-xl border border-[#1E1E2E] bg-[#111118] px-4 text-sm text-[#F0F0FF] outline-none placeholder:text-[#3F3F5C] focus:border-[#6366F1]/50"
          />
          {error && <p className="text-sm text-[#F87171]">{error}</p>}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-xl bg-[#6366F1] text-sm font-medium text-white transition-colors hover:bg-[#5558E8]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
