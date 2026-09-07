/**
 * The studies saved on this scenario — one row per what-if, its segments under it.
 *
 * A study is a record of an assumption (08 §23): it never wrote a resistance
 * back into the network, which is why the table says what was assumed, not what
 * was changed. The real edit goes through 04 / 05 / 06.
 */

import { Trash2 } from 'lucide-react';

import { ColumnLabel, biTitle } from '@/ui/FieldLabel';
import type { ImprovementStudy } from '@/thermal/analysis/analysisTypes';

import { num, rth, signed, timeOf } from './analysisViewModel';

export function StudyTable({
  studies,
  readOnly,
  onSelect,
  onDelete,
}: {
  studies: readonly ImprovementStudy[];
  readOnly: boolean;
  onSelect: (study: ImprovementStudy) => void;
  onDelete: (studyId: string) => void;
}) {
  if (studies.length === 0) {
    return (
      <p className="py-5 text-center text-[11px] text-ink-400">
        No study saved for this scenario yet. Adjust a segment and save it.
        <span className="block">此情境尚未儲存任何調整；調整區段後按儲存。</span>
      </p>
    );
  }

  const ordered = [...studies].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-line text-left align-bottom text-ink-700">
            <th className="py-1 pr-2 font-semibold">
              <ColumnLabel label="Part" zh="元件" />
            </th>
            <th className="py-1 pr-2 font-semibold">
              <ColumnLabel label="Segments assumed" zh="假設調整的區段" />
            </th>
            <th className="py-1 pr-2 text-right font-semibold">
              <ColumnLabel label="Temperature" zh="溫度" unit="°C" />
            </th>
            <th className="py-1 pr-2 text-right font-semibold">
              <ColumnLabel label="Margin" zh="餘裕" unit="°C" />
            </th>
            <th className="py-1 pr-2 text-right font-semibold">
              <ColumnLabel label="Gain" zh="改善" unit="°C" />
            </th>
            <th className="py-1 pr-2 font-semibold">
              <ColumnLabel label="Saved" zh="儲存時間" />
            </th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {ordered.map((study) => {
            const gain = study.projected.margin_C - study.baseline.margin_C;
            return (
              <tr
                key={study.id}
                onClick={() => onSelect(study)}
                title={biTitle('Load this study', '載入此紀錄')}
                className="cursor-pointer border-b border-line/60 align-top hover:bg-surface-muted"
              >
                <td className="py-1.5 pr-2">
                  <span className="block max-w-[12rem] truncate font-semibold text-ink-900">
                    {study.target_node_name}
                  </span>
                  <span className="text-[10px] text-ink-400 tabular">
                    limit {study.limit_C} °C {study.limit_type ?? ''}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  <ul className="grid gap-0.5">
                    {study.segments.map((segment) => (
                      <li key={segment.edge_id} className="text-ink-500">
                        <span className="font-bold tabular text-ink-700">
                          −{segment.reduction_pct}%
                        </span>{' '}
                        <span className="tabular">
                          {rth(segment.rth_before_C_per_W)} → {rth(segment.rth_after_C_per_W)}
                        </span>{' '}
                        <span className="text-ink-400">{segment.label}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                  {num(study.baseline.temperature_C, 1)} → {num(study.projected.temperature_C, 1)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                  {num(study.baseline.margin_C, 1)} → {num(study.projected.margin_C, 1)}
                </td>
                <td
                  className={`py-1.5 pr-2 text-right font-bold tabular ${
                    gain > 0 ? 'text-ok-600' : 'text-ink-500'
                  }`}
                >
                  {signed(gain, 1)}
                </td>
                <td className="py-1.5 pr-2 text-ink-400">{timeOf(study.created_at)}</td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    disabled={readOnly}
                    title={biTitle('Delete this study', '刪除此紀錄')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(study.id);
                    }}
                    className="text-ink-400 hover:text-danger-600 disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
