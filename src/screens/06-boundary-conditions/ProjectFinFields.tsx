/**
 * The heat sink's fins on the fin-surface panel, when they are the project's
 * (`thermal/boundary/finSpec.ts`): one casting, the same in every scenario.
 *
 * Three kinds of field:
 *   - the base (L, W) is 01's own field, shown here as a plain reference with
 *     the way to 01 — one place to edit it (UX rule 4);
 *   - the fins (height, count, air gap, thickness, draft, k, process factor)
 *     are edited here, the one place they live. Linked to AI-Thermal, the ones
 *     5G-RRU states are locked with a ✂, like every linked value
 *     (`project/ProjectAiLocked.tsx`);
 *   - the process comes from 01's cooling elements when 01 names one.
 * Editing writes the project; the boundary store copies it into the profile.
 */

import { useNavigate } from 'react-router-dom';

import { FieldLabel } from '@/ui/FieldLabel';
import { NumberInput } from '@/ui/primitives';
import { projectPath } from '@/app/navigation';
import { matKey, projectAiLinkOf, type AiMatField, type RruDesign } from '@/domain/projectAiLink';
import { totalPowerW } from '@/domain/component';
import { sourced } from '@/domain/sourcedValue';
import type { MaterialDefaults } from '@/domain/materials';
import { useProjectStore } from '@/data/projectStore';
import { useComponentStore } from '@/data/componentStore';
import { ProjectAiBox, ProjectAiUnlockedNote, useProjectAiLock } from '@/project/ProjectAiLocked';
import type { BoundaryConditionProfile } from '@/thermal/boundary/types';
import { FIN_GEOMETRY_KEYS } from '@/thermal/boundary/calculations';
import { FIN_BASE_PARAMETERS, FIN_PARAMETER_SOURCE } from '@/thermal/boundary/finSpec';
import type { FinArrayResult } from '@/thermal/boundary/finArray';

import type { FIN_GEOMETRY_FIELDS } from './boundaryInspectorFields';

type FieldDef = (typeof FIN_GEOMETRY_FIELDS)[number];

const LINKABLE = new Set<string>([
  'hsk_fin_height_mm',
  'hsk_fin_count',
  'hsk_fin_gap_mm',
  'hsk_fin_thickness_mm',
  'hsk_fin_draft_deg',
  'hsk_fin_k_W_mK',
]);

/** One field of the panel, when the fins are the project's. */
export function ProjectFinField({
  field,
  profile,
  placeholder,
  readOnly,
  required,
  onClearProfile,
}: {
  field: FieldDef;
  profile: BoundaryConditionProfile;
  placeholder?: string;
  readOnly: boolean;
  required: boolean;
  /** Clearing the project's value also clears the profile's copy. */
  onClearProfile: (key: string) => void;
}) {
  const navigate = useNavigate();
  const draft = useProjectStore((s) => s.draft);
  const materialField = FIN_PARAMETER_SOURCE[field.key as keyof typeof FIN_PARAMETER_SOURCE] as
    | keyof MaterialDefaults
    | undefined;
  const aiKey = materialField && LINKABLE.has(materialField) ? matKey(materialField as AiMatField) : undefined;
  const lock = useProjectAiLock(aiKey);
  const id = `bc-fin-${field.key}`;
  const label = (
    <FieldLabel
      label={field.label}
      zh={field.zh}
      unit={field.unit || undefined}
      htmlFor={id}
      tooltip={field.tip}
      required={required}
    />
  );

  if (!draft || !materialField) return null;

  // What the solve uses: the project's value, else the copy the profile still
  // holds (a read-only session cannot seed the project from it). Not for the
  // k, whose copy is then the process default the placeholder shows.
  const projectValue = (draft.materials[materialField] as { value: number } | null | undefined)?.value;
  const profileValue = profile.parameters[field.key];
  const shown =
    typeof projectValue === 'number'
      ? projectValue
      : field.key !== FIN_GEOMETRY_KEYS.conductivity && typeof profileValue === 'number'
        ? profileValue
        : undefined;

  if (FIN_BASE_PARAMETERS.has(field.key)) {
    const value = shown;
    return (
      <div>
        {label}
        <div
          id={id}
          className="mt-1 flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px]"
          title="散熱器底座的長寬是 01 的欄位，這裡只顯示。到 01 專案資訊 → 材料與製程預設 → 散熱器底座修改。"
        >
          <span className="tabular flex-1 text-ink-900">{value ?? '—'}</span>
          <button
            type="button"
            className="shrink-0 text-[10.5px] font-semibold text-accent-700 hover:underline"
            onClick={() => navigate(projectPath(draft.project_id, 'info'))}
          >
            {value == null ? '到 01 填' : '01'}
          </button>
        </div>
      </div>
    );
  }

  if (lock?.locked && aiKey) {
    return (
      <div>
        {label}
        <div className="mt-1">
          <ProjectAiBox
            aiKey={aiKey}
            lock={lock}
            id={id}
            label={field.zh}
            text={String(profile.parameters[field.key] ?? lock.linked ?? '—')}
            readOnly={readOnly}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {label}
      <NumberInput
        id={id}
        className="mt-1 h-8 !text-[12px]"
        step="any"
        placeholder={placeholder}
        value={shown ?? ''}
        disabled={readOnly}
        onChange={(event) => {
          const raw = event.target.value;
          const value = raw === '' ? null : Number(raw);
          useProjectStore.getState().patchMaterials({
            [materialField]: value == null || !Number.isFinite(value) ? null : sourced(value, 'Manual'),
          } as Partial<MaterialDefaults>);
          if (value == null) onClearProfile(field.key);
        }}
      />
      {aiKey && <ProjectAiUnlockedNote aiKey={aiKey} lock={lock} readOnly={readOnly} compact />}
    </div>
  );
}

const f = (value: number | undefined, digits: number) => (value == null ? '—' : value.toFixed(digits));

/**
 * This tool's coefficients beside 5G-RRU's, for the same heat sink.
 *
 * 5G-RRU's h is its user-calibrated correlation; this tool's comes from its own
 * fin model. Shown side by side, read-only, never used in the solve. The heat
 * load says whether 5G-RRU's fin height still answers today's components: it
 * was sized for the power at its last save.
 */
export function RruDesignCompare({ result }: { result: FinArrayResult | null }) {
  const draft = useProjectStore((s) => s.draft);
  const components = useComponentStore((s) => s.components);
  const design: RruDesign | undefined = projectAiLinkOf(draft)?.rru_design;
  if (!design) return null;
  const heat04 = totalPowerW(components);
  const heatDiffers =
    design.heat_W != null && heat04 > 0 && Math.abs(heat04 - design.heat_W) / design.heat_W > 0.01;
  const date = design.at.slice(0, 10);

  if (!design.ok) {
    return (
      <p className="mt-2 rounded border border-warn-500/40 bg-warn-100/60 px-2 py-1.5 text-[10.5px] leading-relaxed text-warn-600">
        5G-RRU 在 {date} 存檔時沒有算出可用的設計（{design.why ?? '原因未記錄'}），所以鰭片高度與鰭片數沒有連動，請在這裡填。
      </p>
    );
  }

  const rows: [string, string, string][] = [
    ['h 對流', f(result?.h_conv_W_m2K, 2), f(design.h_conv_W_m2K, 2)],
    ['h 輻射', f(result?.h_rad_W_m2K, 2), f(design.h_rad_W_m2K, 2)],
    ['η 鰭片效率', f(result?.eta_fin, 3), f(design.eta_fin, 3)],
    ['製程係數', f(result ? result.effectiveness / result.eta_fin : undefined, 2), f(design.eta_process, 2)],
    ['鰭片數', result ? String(result.fin_count) : '—', design.fin_count != null ? String(design.fin_count) : '—'],
    ['熱負載', `${heat04.toFixed(1)} W（04）`, design.heat_W != null ? `${design.heat_W.toFixed(1)} W` : '—'],
  ];
  return (
    <div className="mt-2 rounded border border-line bg-surface" data-rru-compare>
      <p className="border-b border-line px-2 py-1 text-[10px] font-bold text-ink-600">
        對照 5G-RRU 的設計<span className="ml-1 font-normal text-ink-400">（{date} 存檔，不參與計算）</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr_1fr] gap-x-3 px-2 py-1 text-[11px]">
        <dt className="text-[10px] text-ink-400" />
        <dd className="text-right text-[10px] font-semibold text-ink-400">本工具</dd>
        <dd className="text-right text-[10px] font-semibold text-ink-400">5G-RRU</dd>
        {rows.map(([label, ours, theirs]) => (
          <div key={label} className="contents">
            <dt className="text-ink-400">{label}</dt>
            <dd className="tabular text-right font-semibold text-ink-800">{ours}</dd>
            <dd className="tabular text-right text-ink-700">{theirs}</dd>
          </div>
        ))}
      </dl>
      {heatDiffers && (
        <p className="border-t border-line px-2 py-1 text-[10.5px] leading-relaxed text-warn-600">
          熱負載對不上：5G-RRU 存檔之後元件功耗改過。鰭片高度是依當時的熱負載算的，回 5G-RRU 重算並存檔，再到 01 按「從 AI-Thermal 更新」。
        </p>
      )}
      <p className="border-t border-line px-2 py-1 text-[10px] leading-relaxed text-ink-400">
        製程係數本工具取 1.00：5G-RRU 的值是校正它自己 h 經驗式用的，本工具另外算擴散熱阻，再乘一次會重複計入。
      </p>
    </div>
  );
}
