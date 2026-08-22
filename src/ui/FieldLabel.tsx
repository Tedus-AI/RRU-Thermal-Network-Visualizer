/**
 * Bilingual labelling — 02 §3, docs/APP_SHELL_CONTRACT.md.
 *
 * English is primary. Traditional Chinese is shown inline when there is room and
 * through a keyboard-focusable tooltip when there is not. The browser's native
 * `title` attribute is deliberately not relied upon (02 §3.4, §32).
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { positionTooltip, type TooltipAlign, type TooltipPosition } from './tooltipPosition';

function ViewportTooltip({
  anchor,
  id,
  open,
  align,
  children,
}: {
  anchor: RefObject<HTMLElement>;
  id: string;
  open: boolean;
  align: TooltipAlign;
  children: ReactNode;
}) {
  const tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchorElement = anchor.current;
    const tooltipElement = tooltip.current;
    if (!anchorElement || !tooltipElement) return;

    const anchorRect = anchorElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    setPosition(
      positionTooltip(
        {
          left: anchorRect.left,
          right: anchorRect.right,
          top: anchorRect.top,
          bottom: anchorRect.bottom,
          width: anchorRect.width,
        },
        { width: tooltipRect.width, height: tooltipRect.height },
        { width: window.innerWidth, height: window.innerHeight },
        align,
      ),
    );
  }, [align, anchor]);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <span
      ref={tooltip}
      role="tooltip"
      id={id}
      data-placement={position?.placement}
      className="pointer-events-none fixed z-[100] w-60 max-w-[calc(100vw-1rem)] whitespace-pre-line rounded-md bg-shell-800 px-2.5 py-2 text-[12px] leading-relaxed font-normal text-white shadow-lg"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </span>,
    document.body,
  );
}

/**
 * Any piece of UI text, bilingual.
 *
 * The project-wide rule: English and Traditional Chinese side by side wherever
 * they fit; where they do not, English stays and the Chinese moves onto hover /
 * keyboard focus. Nothing is ever dropped — it is only relocated.
 *
 *   <Bi en="Add Zone" zh="新增區域" inline />   → "Add Zone / 新增區域"
 *   <Bi en="Add Zone" zh="新增區域" />          → "Add Zone" + tooltip
 */
export function Bi({
  en,
  zh,
  inline = false,
  className = '',
}: {
  en: string;
  zh: string;
  /** true when there is room for both languages on the same line. */
  inline?: boolean;
  className?: string;
}) {
  if (inline) {
    return (
      <span className={className}>
        {en} <span className="font-normal text-ink-400">/ {zh}</span>
      </span>
    );
  }
  return (
    <BilingualTooltip zh={zh}>
      <span className={className}>{en}</span>
    </BilingualTooltip>
  );
}

/**
 * The same rule for interactive controls. A button already owns focus and a
 * click target, so nesting a focusable tooltip inside it would be wrong — the
 * Chinese rides on the native tooltip and the accessible name instead.
 */
export function biTitle(en: string, zh: string): string {
  return `${en} / ${zh}`;
}

/**
 * Engineering explanation for a compact English-only label — 09 §3.2, §3.3.
 *
 * From Screen 09 the rule tightens: a native `title` attribute is explicitly NOT
 * sufficient for an engineering field (09 §3.3, AC-09-34), and the Traditional
 * Chinese text must explain what the number MEANS rather than translate its
 * name. This renders a visible, keyboard-focusable affordance so the explanation
 * can be reached without a mouse.
 *
 *   <EngineeringInfo zh="第 95 百分位溫度：95% 的納入節點溫度低於此值…" />
 */
export function EngineeringInfo({
  zh,
  label,
  align = 'center',
}: {
  /** Traditional Chinese engineering explanation. Not a literal translation. */
  zh: string;
  /** English label this explains, for the accessible name. */
  label?: string;
  align?: 'left' | 'center';
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const anchor = useRef<HTMLSpanElement>(null);

  return (
    <span ref={anchor} className="relative inline-flex items-center">
      <button
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-label={label ? `${label} — engineering explanation / 工程說明` : '工程說明'}
        className="inline-flex text-ink-400 transition-colors hover:text-accent-600 focus:text-accent-600 focus:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
      >
        <Info size={12} aria-hidden />
      </button>
      <ViewportTooltip anchor={anchor} id={tooltipId} open={open} align={align}>
        {zh}
      </ViewportTooltip>
    </span>
  );
}

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
  const anchor = useRef<HTMLSpanElement>(null);

  return (
    <span ref={anchor} className="relative inline-flex items-center">
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
      <ViewportTooltip anchor={anchor} id={tooltipId} open={open} align={align}>
        {zh}
      </ViewportTooltip>
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
      {zhTooltip ? (
        <BilingualTooltip zh={zhTooltip}>
          {text}
          <Info size={12} className="text-ink-400" aria-hidden />
        </BilingualTooltip>
      ) : (
        text
      )}
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
