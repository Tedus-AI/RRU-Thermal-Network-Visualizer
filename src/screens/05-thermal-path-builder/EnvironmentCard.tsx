/**
 * Card ③ 環境: the scenarios, as 01 states them.
 *
 * Read-only: ambient, power (basis and scale), wind and sun are 01's fields. The table is
 * here so the conditions being set up are visible next to the surfaces they
 * act on, and a row switches which scenario the page is showing — the heat
 * sink's fins are the same in every one; the surface conditions are not.
 */

import { ArrowUpRight } from 'lucide-react';

import { Button } from '@/ui/primitives';
import type { Scenario } from '@/domain/project';
import { powerBasisOf } from '@/domain/powerBasis';
import { WIND_NOT_APPLIED, windRecordedOnly } from '@/thermal/boundary/wind';

import { WorkspaceCard } from './WorkspaceCard';

const fmt = (value: number, digits = 0) =>
  Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$/, '') : '—';

export function EnvironmentCard({
  scenarios,
  activeScenarioId,
  open,
  onToggle,
  onSelectScenario,
  onEditScenarios,
}: {
  scenarios: Scenario[];
  activeScenarioId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelectScenario: (scenarioId: string) => void;
  onEditScenarios: () => void;
}) {
  const active = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null;
  const windNote = scenarios.some((scenario) => windRecordedOnly(scenario.wind_mps));

  return (
    <WorkspaceCard
      id="card-environment"
      index={3}
      title="環境"
      subtitle="跟著 01 的情境（唯讀）"
      status={
        active
          ? `${active.name}・${fmt(active.ambient_C, 1)} °C${powerBasisOf(active) === 'rt' ? '・常溫 Pd' : ''}`
          : '沒有情境'
      }
      tone={active ? 'neutral' : 'warn'}
      open={open}
      onToggle={onToggle}
    >
      {scenarios.length === 0 ? (
        <p className="text-[11.5px] text-ink-500">還沒有情境。到 01 專案資訊建立一個。</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-[11px]" data-scenario-table>
              <thead className="bg-surface-muted text-[10px] text-ink-500">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">情境</th>
                  <th className="px-2 py-1 text-right font-semibold">環溫 °C</th>
                  <th
                    className="px-2 py-1 text-right font-semibold"
                    title="每顆元件用高溫 Pd 還是常溫 Pd（Pd@25°C），再乘上功耗倍率"
                  >
                    功耗
                  </th>
                  <th className="px-2 py-1 text-right font-semibold">風速 m/s</th>
                  <th className="px-2 py-1 text-right font-semibold">日照 W/m²</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => {
                  const isActive = scenario.id === activeScenarioId;
                  return (
                    <tr
                      key={scenario.id}
                      aria-selected={isActive}
                      className={`cursor-pointer border-t border-line ${
                        isActive ? 'bg-accent-100/70 font-semibold text-accent-700' : 'text-ink-700 hover:bg-surface-muted'
                      }`}
                      onClick={() => !isActive && onSelectScenario(scenario.id)}
                    >
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          className="text-left"
                          aria-pressed={isActive}
                          title={isActive ? '目前顯示的情境' : '切換到這個情境'}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isActive) onSelectScenario(scenario.id);
                          }}
                        >
                          {isActive ? '● ' : '○ '}
                          {scenario.name}
                        </button>
                      </td>
                      <td className="tabular px-2 py-1 text-right">{fmt(scenario.ambient_C, 1)}</td>
                      <td className="tabular whitespace-nowrap px-2 py-1 text-right">
                        {powerBasisOf(scenario) === 'rt' ? '常溫' : '高溫'} ×{fmt(scenario.power_scale, 2)}
                      </td>
                      <td className="tabular px-2 py-1 text-right">
                        {fmt(scenario.wind_mps, 1)}
                        {windRecordedOnly(scenario.wind_mps) && <span className="text-warn-600">※</span>}
                      </td>
                      <td className="tabular px-2 py-1 text-right">{fmt(scenario.solar_W_m2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {windNote && <p className="text-[10.5px] text-warn-600">※ 風速{WIND_NOT_APPLIED.zh}。</p>}
          <p className="text-[10.5px] leading-relaxed text-ink-400">
            點一列切換情境：散熱器的鰭片每個情境都一樣，表面的對流、輻射、日照條件跟著情境。
          </p>
          <Button className="h-8 self-start" trailingIcon={<ArrowUpRight size={13} aria-hidden />} onClick={onEditScenarios}>
            到 01 修改情境
          </Button>
        </div>
      )}
    </WorkspaceCard>
  );
}
