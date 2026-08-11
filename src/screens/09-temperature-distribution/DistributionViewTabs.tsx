/**
 * Main visualization mode tabs — 09 §10.
 *
 * Histogram · Component Bars · Margin Bars · Scenario Compare · Network
 * Temperature, with Histogram as the formal default (09 §10).
 */

import { EngineeringInfo, biTitle } from '@/ui/FieldLabel';
import { T09 } from './tooltips';

export const DISTRIBUTION_VIEWS = [
  'histogram',
  'component_bars',
  'margin_bars',
  'scenario_compare',
  'network_temperature',
] as const;
export type DistributionView = (typeof DISTRIBUTION_VIEWS)[number];

export const VIEW_LABELS: Record<
  DistributionView,
  { label: string; zh: string; explanation: string }
> = {
  histogram: { label: 'Histogram', zh: '直方圖', explanation: T09.histogram },
  component_bars: { label: 'Component Bars', zh: '元件長條圖', explanation: T09.componentBars },
  margin_bars: { label: 'Margin Bars', zh: '餘裕長條圖', explanation: T09.marginBars },
  scenario_compare: {
    label: 'Scenario Compare',
    zh: '情境比較',
    explanation: T09.scenarioCompare,
  },
  network_temperature: {
    label: 'Network Temperature',
    zh: '熱網路溫度',
    explanation: T09.networkTemperature,
  },
};

export function DistributionViewTabs({
  view,
  onView,
}: {
  view: DistributionView;
  onView: (view: DistributionView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={biTitle('Distribution view', '分佈檢視模式')}
      className="flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-line px-1"
    >
      {DISTRIBUTION_VIEWS.map((entry) => {
        const meta = VIEW_LABELS[entry];
        const active = view === entry;
        return (
          <span key={entry} className="flex shrink-0 items-center">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onView(entry)}
              className={`-mb-px shrink-0 border-b-2 px-2 py-2 text-[11.5px] font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'border-accent-600 text-accent-700'
                  : 'border-transparent text-ink-500 hover:text-ink-900'
              }`}
            >
              {meta.label}
            </button>
            {active && <EngineeringInfo zh={meta.explanation} label={meta.label} />}
          </span>
        );
      })}
    </div>
  );
}
