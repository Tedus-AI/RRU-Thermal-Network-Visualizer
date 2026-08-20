/**
 * Section C — Default Scenario (01 §8).
 *
 * Screen 01 only authors the Baseline scenario. The full scenario matrix
 * (55°C / Pi mode / Fan off …) belongs to Screen 06 (00 §34).
 */

import { Field, NumberInput, SectionCard, TextInput } from '@/ui/primitives';
import { SCENARIO_LIMITS, type Scenario } from '@/domain/project';
import { useScenarioStore } from '@/data/scenarioStore';
import { useProjectStore } from '@/data/projectStore';
import { useBoundaryStore } from '@/data/boundaryStore';
import { useFormTouch, useSectionAlert, useVisibleError } from './formTouch';

/** The fields this section can fail validation on — see `useSectionAlert`. */
const SCENARIO_FIELDS = [
  'scenario_name',
  'ambient_C',
  'wind_mps',
  'solar_W_m2',
  'power_scale',
] as const;

export function BaselineScenarioForm({
  scenario,
  errors,
  readOnly,
}: {
  scenario: Scenario | null;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const updateScenario = useScenarioStore((s) => s.updateScenario);
  const markDirty = useProjectStore((s) => s.markDirty);
  const touch = useFormTouch((s) => s.touch);
  const visibleError = useVisibleError(errors);
  const alert = useSectionAlert(errors, SCENARIO_FIELDS);

  if (!scenario) {
    return (
      <SectionCard
        step={3}
        title="Default Scenario"
        subtitle="預設情境"
        collapsible
        summary="Created on first save / 首次儲存時建立"
      >
        <p className="text-[13px] text-ink-500">
          A Baseline scenario will be created automatically when this project is first saved.
        </p>
      </SectionCard>
    );
  }

  const patch = (values: Partial<Scenario>) => {
    for (const field of Object.keys(values)) touch(field === 'name' ? 'scenario_name' : field);
    const boundaryValues = {
      ...(Object.hasOwn(values, 'ambient_C') ? { ambient_C: values.ambient_C } : {}),
      ...(Object.hasOwn(values, 'wind_mps') ? { wind_mps: values.wind_mps } : {}),
      ...(Object.hasOwn(values, 'solar_W_m2') ? { solar_W_m2: values.solar_W_m2 } : {}),
    };
    const ownsBoundaryValue = Object.keys(boundaryValues).length > 0;
    const synchronized = ownsBoundaryValue
      ? useBoundaryStore.getState().syncScenarioDefaults(scenario.id, boundaryValues)
      : false;
    updateScenario(
      scenario.id,
      values,
      synchronized ? { skipRevision: true, skipInvalidate: true } : undefined,
    );
    markDirty();
  };

  // Empty input must not silently become 0 — keep NaN so validation can report it.
  const numeric = (value: string) => (value === '' ? Number.NaN : Number(value));

  return (
    <SectionCard
      step={3}
      title="Default Scenario"
      subtitle={`預設情境 — ${scenario.id}`}
      collapsible
      alert={alert}
      summary={
        <>
          {scenario.name} · {scenario.ambient_C} °C · {scenario.wind_mps} m/s ·{' '}
          {scenario.solar_W_m2} W/m² · ×{scenario.power_scale}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
        <Field label="Scenario Name" zh="情境名稱" htmlFor="scenario_name" error={visibleError('scenario_name')}>
          <TextInput
            id="scenario_name"
            value={scenario.name}
            disabled={readOnly}
            invalid={Boolean(visibleError('scenario_name'))}
            placeholder="55C_0mps"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>

        <Field
          label="Ambient Temperature"
          zh="環境溫度"
          htmlFor="ambient_C"
          suffix="°C"
          error={visibleError('ambient_C')}
        >
          <NumberInput
            id="ambient_C"
            value={Number.isNaN(scenario.ambient_C) ? '' : scenario.ambient_C}
            min={SCENARIO_LIMITS.ambient_C.min}
            max={SCENARIO_LIMITS.ambient_C.max}
            step={0.1}
            disabled={readOnly}
            invalid={Boolean(visibleError('ambient_C'))}
            className="pr-10"
            onChange={(event) => patch({ ambient_C: numeric(event.target.value) })}
          />
        </Field>

        <Field label="Wind Speed" zh="風速" htmlFor="wind_mps" suffix="m/s" error={visibleError('wind_mps')}>
          <NumberInput
            id="wind_mps"
            value={Number.isNaN(scenario.wind_mps) ? '' : scenario.wind_mps}
            min={SCENARIO_LIMITS.wind_mps.min}
            max={SCENARIO_LIMITS.wind_mps.max}
            step={0.1}
            disabled={readOnly}
            invalid={Boolean(visibleError('wind_mps'))}
            className="pr-12"
            onChange={(event) => patch({ wind_mps: numeric(event.target.value) })}
          />
        </Field>

        <Field label="Solar Load" zh="日照負荷" htmlFor="solar_W_m2" suffix="W/m²" error={visibleError('solar_W_m2')}>
          <NumberInput
            id="solar_W_m2"
            value={Number.isNaN(scenario.solar_W_m2) ? '' : scenario.solar_W_m2}
            min={SCENARIO_LIMITS.solar_W_m2.min}
            max={SCENARIO_LIMITS.solar_W_m2.max}
            step={10}
            disabled={readOnly}
            invalid={Boolean(visibleError('solar_W_m2'))}
            className="pr-14"
            onChange={(event) => patch({ solar_W_m2: numeric(event.target.value) })}
          />
        </Field>

        <Field
          label="Power Scale"
          zh="功耗倍率"
          htmlFor="power_scale"
          error={visibleError('power_scale')}
          tip="此情境套用於所有元件功耗的倍率。"
        >
          <NumberInput
            id="power_scale"
            value={Number.isNaN(scenario.power_scale) ? '' : scenario.power_scale}
            min={SCENARIO_LIMITS.power_scale.min}
            max={SCENARIO_LIMITS.power_scale.max}
            step={0.05}
            disabled={readOnly}
            invalid={Boolean(visibleError('power_scale'))}
            onChange={(event) => patch({ power_scale: numeric(event.target.value) })}
          />
        </Field>
      </div>
    </SectionCard>
  );
}
