'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, FlaskConical, Loader2, Save, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestResult } from '@/components/admin/settings-types';

export function RequiredMark() {
  return <span className="text-red-500 ml-0.5" aria-hidden>*</span>;
}

export function FieldLabel({
  children,
  required,
  htmlFor,
  className,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm mb-1.5 font-medium', className)}>
      {children}
      {required ? <RequiredMark /> : null}
    </label>
  );
}

export function FieldHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-xs mt-1.5', className)} style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl glass p-4 sm:p-5 space-y-4', className)}>
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl glass overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-white/40 transition"
      >
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {description ? (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
          style={{ color: 'var(--text-muted)' }}
        />
      </button>
      {open ? <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-4 border-t border-black/5 pt-4">{children}</div> : null}
    </section>
  );
}

export function StatusBanner({
  variant,
  children,
}: {
  variant: 'success' | 'error' | 'warning';
  children: ReactNode;
}) {
  const color =
    variant === 'success'
      ? 'text-green-700'
      : variant === 'warning'
        ? 'text-amber-700'
        : 'text-red-600';
  const Icon = variant === 'success' ? CheckCircle2 : XCircle;
  return (
    <div className={cn('rounded-2xl glass px-4 py-3 text-sm flex items-start gap-2', color)}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function TestResultBanner({ result }: { result: TestResult }) {
  const okMsg =
    result.provider === 'oss'
      ? `OSS 连通正常${result.detail ? ` · ${result.detail}` : result.bucket ? ` · ${result.bucket}` : ''}`
      : result.provider === 's3'
        ? `S3 连通正常${result.detail ? ` · ${result.detail}` : result.bucket ? ` · ${result.bucket}` : ''}`
        : `headBucket 成功${result.bucket ? ` · ${result.bucket}` : ''}${
            result.region ? ` @ ${result.region}` : ''
          }`;

  return (
    <StatusBanner variant={result.ok ? 'success' : 'error'}>
      {result.ok ? okMsg : result.error || '测试失败'}
    </StatusBanner>
  );
}

export type BusyState = 'save' | 'saveTest' | 'test' | 'account' | null;

export function StorageActionsBar({
  busy,
  onSave,
  onSaveAndTest,
  onTestOnly,
  sticky,
}: {
  busy: BusyState;
  onSave: () => void;
  onSaveAndTest: () => void;
  onTestOnly: () => void;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        sticky &&
          'sticky bottom-3 z-10 rounded-2xl glass border border-white/60 px-3 py-3 shadow-lg backdrop-blur-md'
      )}
    >
      <button
        type="submit"
        disabled={Boolean(busy)}
        onClick={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        保存
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={onSaveAndTest}
        className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy === 'saveTest' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FlaskConical className="w-4 h-4" />
        )}
        保存并测试
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={onTestOnly}
        className="btn-ghost text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        {busy === 'test' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <FlaskConical className="w-4 h-4" />
        )}
        仅测试
      </button>
    </div>
  );
}

export function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
