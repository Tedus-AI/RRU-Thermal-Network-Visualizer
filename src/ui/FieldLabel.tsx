/**
 * Bilingual labelling — 02 §3, docs/APP_SHELL_CONTRACT.md.
 *
 * English is primary. Traditional Chinese is shown inline when there is room and
 * through a keyboard-focusable tooltip when there is not. The browser's native
 * `title` attribute is deliberately not relied upon (02 §3.4, §32).
 */

import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export function BilingualTooltip({
  zh,
  children,
  align = 'center',
}: {
  zh: string;
  children: ReactNode;
  align?: 'left' | 'center';
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-flex items-center">
      <span
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex cursor-help items-center gap-1 border-b border-dotted border-ink-400"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={tooltipId}
          className={`absolute bottom-full z-40 mb-1.5 w-60 rounded-md bg-shell-800 px-2.5 py-2 text-[12px] leading-relaxed font-normal text-white shadow-lg ${
            align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          {zh}
        </span>
      )}
    </span>
  );
}

/**
 * A label with an English name, an optional inline Chinese name, an optional unit
 * and an optional explanatory Chinese tooltip.
 */
export function FieldLabel({
  label,
  zh,
  unit,
  tooltip,
  inline = true,
  htmlFor,
  required,
}: {
  label: string;
  zh?: string;
  unit?: string;
  /** Longer Traditional Chinese explanation, shown on hover/focus. */
  tooltip?: string;
  /** false renders English only and moves the Chinese name into the tooltip. */
  inline?: boolean;
  htmlFor?: string;
  required?: boolean;
}) {
  const zhTooltip = tooltip ?? (!inline && zh ? zh : undefined);

  const text = (
    <>
      {label}
      {unit && <span className="ml-1 font-normal text-ink-400">({unit})</span>}
      {inline && zh && <span className="ml-1 font-normal text-ink-400">/ {zh}</span>}
      {required && (
        <span className="ml-0.5 text-danger-500" aria-hidden>
          *
        </span>
      )}
    </>
  );

  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1 text-[12px] font-semibold text-ink-700">
      {zhTooltip ? <BilingualTooltip zh={zhTooltip}>{text}</BilingualTooltip> : text}
      {zhTooltip && <Info size={12} className="text-ink-400" aria-hidden />}
    </label>
  );
}

/**
 * Table header cell. Column headers are tight, so the English name stacks over the
 * Chinese one, with the long explanation on the tooltip.
 */
export function ColumnLabel({
  label,
  zh,
  unit,
  tooltip,
}: {
  label: string;
  zh?: string;
  unit?: string;
  tooltip?: string;
}) {
  const content = (
    <span className="block leading-tight">
      <span className="block whitespace-nowrap">
        {label}
        {unit && <span className="ml-0.5 font-normal text-ink-400">({unit})</span>}
      </span>
      {zh && <span className="block text-[10px] font-normal whitespace-nowrap text-ink-400">{zh}</span>}
    </span>
  );

  return tooltip ? (
    <BilingualTooltip zh={tooltip} align="left">
      {content}
    </BilingualTooltip>
  ) : (
    content
  );
}
