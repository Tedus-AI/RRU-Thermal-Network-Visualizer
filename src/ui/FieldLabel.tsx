/**
 * UI labelling — docs/APP_SHELL_CONTRACT.md.
 *
 * Traditional Chinese is the UI language. Every helper here still takes the
 * English name, because the call sites were written bilingual and some labels
 * have no Chinese yet: the Chinese is shown when it exists, and the English is
 * only the fallback. Industry terms engineers use in English (TIM, BLT, HSK,
 * Rjc …) are written into the Chinese string itself, not appended here.
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
 * Any piece of UI text: the Chinese, or the English when there is no Chinese.
 *
 *   <Bi en="Add Zone" zh="新增區域" />   → "新增區域"
 *
 * `inline` is kept so the bilingual call sites need no edit; it no longer
 * changes anything, since there is only one language to place.
 */
export function Bi({
  en,
  zh,
  className = '',
}: {
  en: string;
  zh: string;
  /** Unused since the UI went Chinese-only; kept for the existing call sites. */
  inline?: boolean;
  className?: string;
}) {
  return <span className={className}>{zh || en}</span>;
}

/**
 * The same rule for a control's native tooltip and accessible name.
 */
export function biTitle(en: string, zh: string): string {
  return zh || en;
}

/**
 * Engineering explanation for a compact English-only label — 09 §3.2, §3.3.
 *
 * From 09 §3.3 onward the rule tightens: a native `title` attribute is explicitly NOT
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
        aria-label={label ? `${label}：說明` : '說明'}
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
 * A label: the Chinese name (English when there is none), an optional unit and
 * an optional explanatory tooltip.
 */
export function FieldLabel({
  label,
  zh,
  unit,
  tooltip,
  htmlFor,
  required,
}: {
  label: string;
  zh?: string;
  unit?: string;
  /** Longer Traditional Chinese explanation, shown on hover/focus. */
  tooltip?: string;
  /** Unused since the UI went Chinese-only; kept for the existing call sites. */
  inline?: boolean;
  htmlFor?: string;
  required?: boolean;
}) {
  const zhTooltip = tooltip;

  const text = (
    <>
      {zh || label}
      {unit && <span className="ml-1 font-normal text-ink-400">({unit})</span>}
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
 * Table header cell: the Chinese name and unit on one line, with the long
 * explanation on the tooltip.
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
    <span className="block leading-tight whitespace-nowrap">
      {zh || label}
      {unit && <span className="ml-0.5 font-normal text-ink-400">({unit})</span>}
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
