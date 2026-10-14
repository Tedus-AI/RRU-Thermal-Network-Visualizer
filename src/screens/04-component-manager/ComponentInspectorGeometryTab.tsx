/**
 * Component inspector, Geometry tab: the package envelope and the faces and
 * areas the heat path derives from it.
 */

import { Button, NumberInput, Select } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import {
  METAL_BASE_CONTACT_GEOMETRIES,
  METAL_BASE_CONTACT_GEOMETRY_LABELS,
  SOURCE_FACE_LABELS,
} from '@/domain/component';
import { tip } from '@/i18n/componentManagerCopy';
import { DerivedField, GeometryField } from './ComponentInspectorFields';
import type { InspectorTabProps } from './componentInspectorModel';

/** The package envelope and the faces and areas the heat path derives
 * from it — source face, spread face, exposed metal. */
export function GeometryTab({ readOnly, derived }: InspectorTabProps) {
  const {
    SOURCE_ORIGIN,
    envelopeLabels,
    exposedArea,
    heatPath,
    materials,
    metalBase,
    metalBaseModel,
    patchGeometry,
    patchHeatPathParameters,
    rule,
    sourceArea,
    sourceFace,
    spec,
    spreadArea,
    spreadFace,
    spreadOrigin,
    surfaceReferenced,
  } = derived;
  return (
    <>
      {/* The package envelope is the one thing every path needs, and
          two of the four take their heat-leaving face straight from it. */}
      <div className="grid grid-cols-3 gap-2.5">
        <GeometryField
          label={envelopeLabels.L.en}
          zh={envelopeLabels.L.zh}
          field="package_L_mm"
          geometry={spec.geometry}
          readOnly={readOnly}
          onChange={patchGeometry}
        />
        <GeometryField
          label={envelopeLabels.W.en}
          zh={envelopeLabels.W.zh}
          field="package_W_mm"
          geometry={spec.geometry}
          readOnly={readOnly}
          onChange={patchGeometry}
        />
        <GeometryField
          label={envelopeLabels.H.en}
          zh={envelopeLabels.H.zh}
          field="package_H_mm"
          geometry={spec.geometry}
          readOnly={readOnly}
          onChange={patchGeometry}
        />
      </div>

      {spec.package_type === 'Cavity Filter' && surfaceReferenced && (
        <p className="mt-2 rounded-md border border-accent-500/20 bg-accent-100/40 p-2.5 text-[11px] leading-relaxed text-ink-500">
          A cavity filter bolts down across most of the heat sink, so a blank body L and W
          are filled from the HSK Base outline in Screen 01. They stay editable — a filter
          is usually a little smaller than the base.
          <span className="block">
            腔體濾波器幾乎橫跨整片散熱器，所以本體長寬若留空，會以 Screen 01
            的散熱器底座外框預填。這兩欄仍可修改 —— 濾波器通常比底座略小一些。
          </span>
        </p>
      )}

      {metalBase && (
        <>
          <fieldset className="rounded-md border border-line p-3">
            <legend className="px-1 text-[12px] font-semibold text-ink-700">
              Contact Geometry / 接觸幾何
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 flex flex-col gap-1.5">
                <FieldLabel
                  label="Contact Model"
                  zh="接觸面模型"
                  htmlFor="geo-metal-contact-model"
                />
                <Select
                  id="geo-metal-contact-model"
                  items={METAL_BASE_CONTACT_GEOMETRIES.map((geometry) => ({
                    value: geometry,
                    label: `${METAL_BASE_CONTACT_GEOMETRY_LABELS[geometry].en} / ${METAL_BASE_CONTACT_GEOMETRY_LABELS[geometry].zh}`,
                  }))}
                  value={metalBaseModel.contact_geometry}
                  disabled={readOnly}
                  onChange={(event) =>
                    patchHeatPathParameters(
                      { contact_geometry: event.target.value },
                      ['heat_path.parameters.contact_geometry'],
                    )
                  }
                />
              </div>

              {metalBaseModel.contact_geometry === 'FullBase' && (
                <>
                  <DerivedField
                    id="geo-metal-contact-L"
                    label="Base Contact L"
                    zh="底面接觸長"
                    value={spec.geometry.package_L_mm}
                    from={`= ${envelopeLabels.L.en} / 等於${envelopeLabels.L.zh}`}
                  />
                  <DerivedField
                    id="geo-metal-contact-W"
                    label="Base Contact W"
                    zh="底面接觸寬"
                    value={spec.geometry.package_W_mm}
                    from={`= ${envelopeLabels.W.en} / 等於${envelopeLabels.W.zh}`}
                  />
                </>
              )}

              {metalBaseModel.contact_geometry === 'PerimeterFrame' && (
                <div className="col-span-2 flex flex-col gap-1.5">
                  <FieldLabel
                    label="Perimeter Land Width"
                    zh="外圍接觸邊寬"
                    unit="mm"
                    htmlFor="geo-perimeter-land-width"
                  />
                  <NumberInput
                    id="geo-perimeter-land-width"
                    step="0.1"
                    value={metalBaseModel.perimeter_land_width_mm ?? ''}
                    placeholder="—"
                    disabled={readOnly}
                    onChange={(event) =>
                      patchHeatPathParameters(
                        {
                          perimeter_land_width_mm:
                            event.target.value === '' ? null : Number(event.target.value),
                        },
                        ['heat_path.parameters.perimeter_land_width_mm'],
                      )
                    }
                  />
                  <p className="text-[11px] text-ink-400">
                    Effective area = outer base − open centre. / 有效面積＝完整底面－中央開口。
                  </p>
                </div>
              )}

              {metalBaseModel.contact_geometry === 'CustomArea' && (
                <div className="col-span-2 flex flex-col gap-1.5">
                  <FieldLabel
                    label="Custom Effective Area"
                    zh="自訂有效接觸面積"
                    unit="mm²"
                    htmlFor="geo-custom-contact-area"
                  />
                  <NumberInput
                    id="geo-custom-contact-area"
                    step="1"
                    value={metalBaseModel.custom_contact_area_mm2 ?? ''}
                    placeholder="—"
                    disabled={readOnly}
                    onChange={(event) =>
                      patchHeatPathParameters(
                        {
                          custom_contact_area_mm2:
                            event.target.value === '' ? null : Number(event.target.value),
                        },
                        ['heat_path.parameters.custom_contact_area_mm2'],
                      )
                    }
                  />
                  <p className="text-[11px] text-ink-400">
                    Use the actual clamped lands; exclude paint, gaps and uncompressed gasket.
                    <span className="block">只計入實際壓緊區域，扣除噴漆、缺口與未壓縮墊片。</span>
                  </p>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-line p-3">
            <legend className="px-1 text-[12px] font-semibold text-ink-700">
              Additional Exposed Surface / 額外暴露表面
            </legend>
            <label className="flex items-start gap-2 text-[12px] text-ink-700">
              <input
                id="geo-exposed-surface-enabled"
                type="checkbox"
                className="mt-0.5 size-3.5 accent-[var(--color-accent-600)]"
                checked={metalBaseModel.exposed_surface_enabled}
                disabled={readOnly}
                onChange={(event) =>
                  patchHeatPathParameters(
                    { exposed_surface_enabled: event.target.checked },
                    ['heat_path.parameters.exposed_surface_enabled'],
                  )
                }
              />
              <span>
                Generate a convection/radiation boundary opening
                <span className="block text-[11px] text-ink-400">
                  在 Screen 05 產生可供 Screen 06 設定對流／輻射的表面出口
                </span>
              </span>
            </label>

            {metalBaseModel.exposed_surface_enabled && (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <FieldLabel
                    label="Exposed Area Source"
                    zh="暴露面積來源"
                    htmlFor="geo-exposed-area-mode"
                  />
                  <Select
                    id="geo-exposed-area-mode"
                    items={[
                      {
                        value: 'DerivedPackage',
                        label: 'Package top + four sides / 封裝頂面＋四個側面',
                      },
                      { value: 'Custom', label: 'Custom exposed area / 自訂暴露面積' },
                    ]}
                    value={metalBaseModel.exposed_area_mode}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchHeatPathParameters(
                        { exposed_area_mode: event.target.value },
                        ['heat_path.parameters.exposed_area_mode'],
                      )
                    }
                  />
                </div>

                {metalBaseModel.exposed_area_mode === 'Custom' ? (
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <FieldLabel
                      label="Custom Exposed Area"
                      zh="自訂暴露面積"
                      unit="mm²"
                      htmlFor="geo-custom-exposed-area"
                    />
                    <NumberInput
                      id="geo-custom-exposed-area"
                      step="1"
                      value={metalBaseModel.custom_exposed_area_mm2 ?? ''}
                      placeholder="—"
                      disabled={readOnly}
                      onChange={(event) =>
                        patchHeatPathParameters(
                          {
                            custom_exposed_area_mm2:
                              event.target.value === '' ? null : Number(event.target.value),
                          },
                          ['heat_path.parameters.custom_exposed_area_mm2'],
                        )
                      }
                    />
                  </div>
                ) : (
                  <DerivedField
                    id="geo-derived-exposed-area"
                    label="Derived Exposed Area"
                    zh="推導暴露面積"
                    value={exposedArea}
                    from="Top + four sides; base excluded / 頂面加四側，底面不重複計入"
                  />
                )}
              </div>
            )}
          </fieldset>
        </>
      )}

      {/* Source face — asked for only when the path does not already
          determine it (GEOMETRY_RULES). */}
      {!metalBase && <div className="grid grid-cols-2 gap-2.5">
        {rule.source === 'package' ? (
          <>
            <DerivedField
              id="geo-source_L_mm"
              label={`${SOURCE_FACE_LABELS[heatPath].en} L`}
              zh={`${SOURCE_FACE_LABELS[heatPath].zh}長`}
              value={sourceFace.L}
              from={SOURCE_ORIGIN[heatPath as keyof typeof SOURCE_ORIGIN]}
            />
            <DerivedField
              id="geo-source_W_mm"
              label={`${SOURCE_FACE_LABELS[heatPath].en} W`}
              zh={`${SOURCE_FACE_LABELS[heatPath].zh}寬`}
              value={sourceFace.W}
              from=""
            />
          </>
        ) : (
          <>
            <GeometryField
              label={`${SOURCE_FACE_LABELS[heatPath].en} L`}
              zh={`${SOURCE_FACE_LABELS[heatPath].zh}長`}
              field="source_L_mm"
              geometry={spec.geometry}
              readOnly={readOnly}
              onChange={patchGeometry}
            />
            <GeometryField
              label={`${SOURCE_FACE_LABELS[heatPath].en} W`}
              zh={`${SOURCE_FACE_LABELS[heatPath].zh}寬`}
              field="source_W_mm"
              geometry={spec.geometry}
              readOnly={readOnly}
              onChange={patchGeometry}
            />
          </>
        )}
      </div>}

      {/* The one thickness this path conducts through, if any. */}
      {rule.thickness === 'board' && (
        <div className="grid grid-cols-2 gap-2.5">
          <GeometryField
            label="Board Thickness"
            zh="板厚"
            field="board_thickness_mm"
            geometry={spec.geometry}
            readOnly={readOnly}
            onChange={patchGeometry}
          />
        </div>
      )}
      {rule.thickness === 'project_coin' && (
        <div className="grid grid-cols-2 gap-2.5">
          <DerivedField
            id="geo-coin_thickness_mm"
            label="Coin Thickness"
            zh="銅塊厚度"
            value={materials.coin_thickness_mm?.value ?? null}
            from="Screen 01 / 專案設定"
          />
        </div>
      )}

      {/* Spread face — never typed. Every path derives it, so showing
          it read-only is the only way it and the solver can agree. */}
      {!metalBase && <div className="grid grid-cols-2 gap-2.5">
        <DerivedField
          id="geo-spread_L_mm"
          label={rule.spread === 'project_coin' ? 'Coin L' : 'Spread L'}
          zh={rule.spread === 'project_coin' ? '銅塊長' : '擴散面長'}
          value={spreadFace.L}
          from={spreadOrigin}
        />
        <DerivedField
          id="geo-spread_W_mm"
          label={rule.spread === 'project_coin' ? 'Coin W' : 'Spread W'}
          zh={rule.spread === 'project_coin' ? '銅塊寬' : '擴散面寬'}
          value={spreadFace.W}
          from=""
        />
      </div>}

      <div className="rounded-md border border-line bg-surface-muted px-3 py-2">
        <div className="flex items-baseline justify-between">
          <BilingualTooltip zh={tip('Source Area') ?? ''} align="left">
            <span className="text-[12px] text-ink-500">
              {metalBase ? 'Effective Contact Area / 有效接觸面積' : 'Source Area / 熱源面積'}
            </span>
          </BilingualTooltip>
          <span className="tabular text-[13px] font-bold">
            {sourceArea == null ? '—' : `${sourceArea.toFixed(1)} mm²`}
          </span>
        </div>
        {!metalBase && <div className="mt-1.5 flex items-baseline justify-between">
          <BilingualTooltip zh={tip('Spread Area') ?? ''} align="left">
            <span className="text-[12px] text-ink-500">Spread Area / 擴散面積</span>
          </BilingualTooltip>
          <span className="tabular text-[13px] font-bold">
            {spreadArea == null ? '—' : `${spreadArea.toFixed(1)} mm²`}
          </span>
        </div>}
        {metalBase && metalBaseModel.exposed_surface_enabled && (
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-[12px] text-ink-500">
              Exposed Surface Area / 暴露表面積
            </span>
            <span className="tabular text-[13px] font-bold">
              {exposedArea == null ? '—' : `${exposedArea.toFixed(1)} mm²`}
            </span>
          </div>
        )}
      </div>

      {spec.geometry.needs_review && (
        <div className="rounded-md border border-warn-500/30 bg-warn-100/60 p-2.5">
          <p className="text-[11px] leading-relaxed text-warn-600">
            Imported legacy geometry needs review — Thickness / Pad may follow Volume Tool
            semantics.
            <span className="block">
              匯入的舊版幾何資料需人工確認（可能沿用舊工具定義）。
            </span>
          </p>
          {/* The fix is a decision, not a value, so it is one click here. */}
          <Button
            className="mt-2 h-7"
            disabled={readOnly}
            onClick={() => patchGeometry({ needs_review: false })}
          >
            Mark reviewed / 標記為已確認
          </Button>
        </div>
      )}
    </>
  );
}
