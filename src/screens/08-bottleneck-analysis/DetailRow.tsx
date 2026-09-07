/**
 * One label / value line in the inspector.
 *
 * It used to live in `SensitivityPanel.tsx` and be imported from there by the
 * inspector. That panel is gone — the Improvement Preview showed the same ten
 * numbers in a better shape — so the row it happened to share a file with now
 * has its own.
 */

export function DetailRow({
  label,
  zh,
  value,
  tone = '',
  tooltip,
}: {
  label: string;
  zh: string;
  value: string;
  tone?: string;
  tooltip?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0"
      title={tooltip ? `${label} / ${zh} — ${tooltip}` : `${label} / ${zh}`}
    >
      <span className="min-w-0 text-[11px] font-semibold text-ink-700">
        {label}
        <span className="ml-1 font-normal text-ink-400">/ {zh}</span>
      </span>
      <span className={`shrink-0 text-[12px] font-bold tabular ${tone || 'text-ink-900'}`}>
        {value}
      </span>
    </div>
  );
}
