'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';

interface QBSqlPanelProps {
  sql: string;
}

const TOKEN_PATTERN = /(--[^\n]*|'[^']*'|`[^`]+`|\b(?:GROUP\s+BY|ORDER\s+BY|SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|FULL|ON|LIMIT|AS|AND|OR)\b|\b\d+(?:\.\d+)?\b)/gi;

function tokenClass(token: string) {
  if (token.startsWith('--')) return 'text-[var(--text-secondary)]';
  if (token.startsWith("'")) return 'text-[var(--accent)]';
  if (token.startsWith('`')) return 'text-[var(--success)]';
  if (/^\d/.test(token)) return 'text-[var(--destructive)]';
  return 'text-[var(--accent)] font-semibold';
}

function highlightSql(sql: string) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of sql.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(sql.slice(lastIndex, index));
    }

    nodes.push(
      <span key={`${token}-${index}`} className={tokenClass(token)}>
        {token}
      </span>,
    );

    lastIndex = index + token.length;
  }

  if (lastIndex < sql.length) {
    nodes.push(sql.slice(lastIndex));
  }

  return nodes;
}

export default function QBSqlPanel({ sql }: Readonly<QBSqlPanelProps>) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copySql() {
    if (!sql) return;

    await navigator.clipboard.writeText(sql);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="border-b border-white/5 bg-[var(--surface-elevated)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full select-none items-center gap-2 border-b border-white/5 px-6 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        {open ? <ChevronDown size={16} className="text-[var(--text-muted)]" /> : <ChevronRight size={16} className="text-[var(--text-muted)]" />}
        <span className="font-syne text-sm font-semibold text-[var(--accent-foreground)]">SQL</span>
        <span className="flex-1" />
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            void copySql();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              void copySql();
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--accent-foreground)]"
        >
          {copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy'}
        </span>
      </button>

      {open && (
        <div className="px-6 py-4">
          {!sql ? (
            <p className="text-sm text-[var(--text-muted)]">Run a query to see the generated SQL.</p>
          ) : (
            <pre className="max-h-[360px] overflow-auto rounded-lg border border-white/5 bg-[var(--surface-elevated)] p-4 font-mono text-sm leading-6 text-[var(--text-muted)]">
              <code>{highlightSql(sql)}</code>
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
