/**
 * Shared UI primitives for every screen (00 §49, §54 "reuse shared components").
 *
 * Visual language per 01 §39: dark navy chrome, light engineering workspace,
 * blue accent, technical KPI density. No glassmorphism, no gradient decoration,
 * no nested-card explosion.
 */

import { useId, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

// --- Button ----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-600 text-white border-accent-600 hover:bg-accent-700 hover:border-accent-700 disabled:bg-accent-600/40 disabled:border-transparent',
  secondary:
    'bg-surface text-ink-700 border-line-strong hover:bg-surface-muted hover:border-ink-400',
  ghost: 'bg-transparent text-ink-500 border-transparent hover:bg-surface-muted hover:text-ink-900',
  danger: 'bg-surface text-danger-600 border-danger-500/40 hover:bg-danger-100',
};

export function Button({
  variant = 'secondary',
  icon,
  trailingIcon,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_STYLES[variant]} ${className}`}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
}

// --- Section card ----------------------------------------------------------

export function SectionCard({
  step,
  title,
  subtitle,
  children,
  actions,
}: {
  step?: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        {step != null && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-600 text-[12px] font-bold text-white tabular">
            {step}
          </span>
        )}
        <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
        {subtitle && <span className="text-[12px] text-ink-400">{subtitle}</span>}
        <div className="ml-auto">{actions}</div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PanelCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-2.5 text-ink-700">
        {icon}
        <h3 className="text-[13px] font-bold">{title}</h3>
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

// --- Tooltip ---------------------------------------------------------------

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="text-ink-400 hover:text-accent-600"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-1.5 w-64 -translate-x-1/2 rounded-md bg-shell-800 px-2.5 py-2 text-[12px] leading-snug font-normal text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

// --- Form field ------------------------------------------------------------

export function Field({
  label,
  zh,
  htmlFor,
  required,
  hint,
  hintZh,
  error,
  tip,
  suffix,
  children,
}: {
  /** English label — always primary (02 §3, docs/APP_SHELL_CONTRACT.md). */
  label: string;
  /** Traditional Chinese name, shown inline beside the English one. */
  zh?: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  hintZh?: string;
  error?: string;
  tip?: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-[12px] font-semibold text-ink-700"
      >
        {label}
        {zh && <span className="font-normal text-ink-400">/ {zh}</span>}
        {required && (
          <span className="text-danger-500" aria-hidden>
            *
          </span>
        )}
        {tip && <InfoTip text={tip} />}
      </label>
      <div className="relative flex items-center">
        <div className="flex-1">{children}</div>
        {suffix && (
          <span className="pointer-events-none absolute right-3 text-[12px] text-ink-400 tabular">
            {suffix}
          </span>
        )}
      </div>
      {/* Errors are text + icon, never colour alone (01 §31). */}
      {error ? (
        <p className="flex items-start gap-1 text-[12px] font-medium text-danger-600">
          <span aria-hidden>⚠</span>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-400">
          {hint}
          {hintZh && <span className="block">{hintZh}</span>}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  'w-full rounded-md border bg-surface px-3 text-[13px] text-ink-900 transition-colors placeholder:text-ink-400 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-500 focus:border-accent-500 focus:outline-none';

export function TextInput({
  invalid,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`${CONTROL_BASE} h-9 ${invalid ? 'border-danger-500' : 'border-line-strong'} ${className}`}
    />
  );
}

export function NumberInput({
  invalid,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      type="number"
      {...props}
      aria-invalid={invalid || undefined}
      className={`${CONTROL_BASE} tabular h-9 ${invalid ? 'border-danger-500' : 'border-line-strong'} ${className}`}
    />
  );
}

export function Select({
  options,
  invalid,
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly string[];
  invalid?: boolean;
}) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={`${CONTROL_BASE} h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path d="M2 4.5L6 8.5L10 4.5" stroke="%235c6981" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>')] bg-[right_0.75rem_center] bg-no-repeat pr-8 ${invalid ? 'border-danger-500' : 'border-line-strong'} ${className}`}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function TextArea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${CONTROL_BASE} resize-y border-line-strong py-2 leading-relaxed ${className}`}
    />
  );
}

/** Multi-select rendered as toggle chips — 01 §7.5 Main Heat Rejection. */
export function ChipMultiSelect({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const toggle = (option: string) => {
    if (disabled) return;
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            role="checkbox"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => toggle(option)}
            className={`rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? 'border-accent-600 bg-accent-100 text-accent-700'
                : 'border-line-strong bg-surface text-ink-500 hover:border-ink-400'
            }`}
          >
            {selected && <span aria-hidden>✓ </span>}
            {option}
          </button>
        );
      })}
    </div>
  );
}

// --- Modal -----------------------------------------------------------------

export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  width = 'max-w-md',
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  width?: string;
}) {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-shell-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className={`w-full ${width} rounded-lg border border-line bg-surface shadow-2xl`}>
        <header className="border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-[15px] font-bold text-ink-900">
            {title}
          </h2>
          {description && <p className="mt-1 text-[13px] text-ink-500">{description}</p>}
        </header>
        {children && <div className="px-5 py-4">{children}</div>}
        <footer className="flex justify-end gap-2 border-t border-line bg-surface-muted px-5 py-3">
          {footer}
        </footer>
      </div>
    </div>
  );
}

// --- Status dot / badge ----------------------------------------------------

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';

const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-ok-600',
  warn: 'text-warn-600',
  danger: 'text-danger-600',
  neutral: 'text-ink-400',
  accent: 'text-accent-600',
};

const TONE_BG: Record<Tone, string> = {
  ok: 'bg-ok-500',
  warn: 'bg-warn-500',
  danger: 'bg-danger-500',
  neutral: 'bg-ink-400',
  accent: 'bg-accent-500',
};

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${TONE_BG[tone]}`} />;
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const bg: Record<Tone, string> = {
    ok: 'bg-ok-100',
    warn: 'bg-warn-100',
    danger: 'bg-danger-100',
    neutral: 'bg-surface-muted',
    accent: 'bg-accent-100',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold ${bg[tone]} ${TONE_TEXT[tone]}`}
    >
      {children}
    </span>
  );
}

/** Skeleton block for loading states (01 §21). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-line ${className}`} />;
}
