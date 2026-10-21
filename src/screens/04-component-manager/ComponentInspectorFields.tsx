/**
 * Component inspector: the field controls the tabs share — a provenance-
 * carrying number, a geometry number, a derived (read-only) dimension — plus
 * the via override rows and the data-source options.
 */

import { NumberInput } from '@/ui/primitives';
import { FieldLabel } from '@/ui/FieldLabel';
import type { ComponentGeometry } from '@/domain/component';
import { withValue, type SourcedValue } from '@/domain/sourcedValue';
import { SELECTABLE_DATA_SOURCES, type DataSource } from '@/thermal/types';
import { dataSourceLabelZh } from '@/ui/dataSourceLabels';

/** The five an engineer picks, plus whatever the field already says. */
export function sourceOptions(current: DataSource | undefined) {
  const values: DataSource[] = [...SELECTABLE_DATA_SOURCES];
  if (current && !values.includes(current)) values.unshift(current);
  return values.map((value) => ({
    value,
    label: dataSourceLabelZh(value),
  }));
}

/**
 * A number that carries provenance. The source itself is edited on the Source
 * tab; the only thing said here is when a value is still a shipped guess, which
 * is the one state that changes how much you should trust the number.
 */
export function SourcedNumberField({
  id,
  label,
  zh,
  unit,
  tooltip,
  value,
  placeholder = '—',
  step = 'any',
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  zh: string;
  unit?: string;
  tooltip?: string;
  value: SourcedValue<number> | null;
  placeholder?: string;
  step?: string | number;
  readOnly: boolean;
  onChange: (next: SourcedValue<number> | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} unit={unit} tooltip={tooltip} htmlFor={id} />
      <NumberInput
        id={id}
        step={step}
        value={value?.value ?? ''}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(event) =>
          onChange(withValue(value, event.target.value === '' ? null : Number(event.target.value)))
        }
      />
      {value?.value != null && value.source === 'Assumed' && (
        <p className="text-[11px] text-warn-600">推定值</p>
      )}
    </div>
  );
}

export function GeometryField({
  label,
  zh,
  field,
  geometry,
  readOnly,
  onChange,
}: {
  label: string;
  zh: string;
  field: keyof ComponentGeometry;
  geometry: ComponentGeometry;
  readOnly: boolean;
  onChange: (patch: Partial<ComponentGeometry>) => void;
}) {
  const id = `geo-${String(field)}`;
  const value = geometry[field];
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} htmlFor={id} />
      <NumberInput
        id={id}
        step="any"
        value={typeof value === 'number' ? value : ''}
        placeholder="—"
        disabled={readOnly}
        onChange={(event) =>
          onChange({
            [field]: event.target.value === '' ? null : Number(event.target.value),
          } as Partial<ComponentGeometry>)
        }
      />
    </div>
  );
}

/**
 * The two via numbers a component may state for itself.
 *
 * Both are project constants by default (01 §4) — one via stack-up serves the
 * whole board — and both can be overridden, because a part over a locally
 * denser via field is a real arrangement the project number cannot express.
 *
 * They are the only two inputs the via formula actually reads. Count and inner
 * diameter are deliberately not here: they do not appear in it, and offering
 * them would invite an engineer to tune a number that changes nothing.
 */
export const VIA_OVERRIDES = [
  {
    key: 'via_effective_k_W_mK',
    label: 'Via effective k',
    zh: '導熱孔等效 k',
    unit: 'W/m·K',
    step: '1',
    inheritNote: '取自 01 的專案設定。',
    customNote: '此元件下方導熱孔區的實際值。',
  },
  {
    key: 'via_efficiency',
    label: 'Via efficiency',
    zh: '導熱孔製程係數',
    unit: '—',
    step: '0.01',
    inheritNote: '取自 01 的專案設定。',
    customNote: '此元件的製程折減。',
  },
] as const;

/** A dimension this component does not own: shown, never typed, and said why. */
export function DerivedField({
  id,
  label,
  zh,
  value,
  from,
}: {
  id: string;
  label: string;
  zh: string;
  value: number | null;
  from: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} zh={zh} htmlFor={id} />
      <NumberInput id={id} value={value ?? ''} placeholder="—" disabled readOnly />
      <p className="text-[11px] text-ink-400">{from}</p>
    </div>
  );
}

/** An empty box is "not stated", which is null — never 0 (04 §11). */
export function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
