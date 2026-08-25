/**
 * Node Inspector — 05 §26.
 *
 * Tabs: Overview / Thermal Role / Connections / External Mapping.
 *
 * There was a fifth, Source, whose four rows were the origin kind, the template
 * id, the template version and the modified flag — the first three of which the
 * Overview's Origin row already says in one line. Only the modified flag was new,
 * and it belongs beside that origin, since it is what decides whether a rebuild
 * keeps the object.
 *
 * No solved temperature is shown: Screen 05 has no boundary conditions, so it
 * cannot know a node temperature and must not pretend otherwise (05 §22).
 */

import { useState } from 'react';
import { Crosshair, Power, Trash2 } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { BilingualTooltip, FieldLabel } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import { activeRth } from '@/thermal/rth';
import { NODE_TYPES, type NodeType, type ThermalNetwork, type ThermalNode } from '@/thermal/types';
import { LIMIT_TYPES } from '@/domain/component';
import { hasStrayStructuralPower, nodeRoleMode } from './nodeRole';

const TABS = [
  { id: 'overview', label: 'Overview', zh: '總覽' },
  { id: 'role', label: 'Thermal Role', zh: '熱角色' },
  { id: 'connections', label: 'Connections', zh: '連線' },
  { id: 'mapping', label: 'External Mapping', zh: '外部對照' },
] as const;

type Tab = (typeof TABS)[number]['id'];

/**
 * Where this node's heat actually lands on the shared structure.
 *
 * `zone_id` is only ever set on the structure's own zone nodes, so on a
 * component node it was always empty and the row read as missing data. What an
 * engineer means by "which zone is this on" is where the component's chain
 * terminates, which is the port connection — so that is what is followed.
 */
function attachedZone(network: ThermalNetwork, node: ThermalNode): string | null {
  if (node.zone_id) return network.nodes[node.zone_id]?.name ?? node.zone_id;
  if (!node.component_ref) return null;

  for (const candidate of Object.values(network.nodes)) {
    if (candidate.component_ref !== node.component_ref) continue;
    for (const port of candidate.ports ?? []) {
      const target = port.connected_to ? network.nodes[port.connected_to] : null;
      if (target) return target.name;
    }
  }
  return null;
}

function Row({ label, zh, children }: { label: string; zh?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="shrink-0 text-[11px] text-ink-500">
        {label}
        {zh && <span className="ml-1 text-ink-400">/ {zh}</span>}
      </span>
      <span className="min-w-0 text-right text-[11px] font-semibold text-ink-900">{children}</span>
    </div>
  );
}

export function NodeInspector({
  embedded = false,
  node,
  network,
  readOnly,
  onPatch,
  onFocus,
  onSelectEdge,
  onToggleEdge,
  onDeleteEdge,
  onToggleNode,
  onDeleteNode,
}: {
  /** FloatingPanel already owns the title and scrolling when embedded. */
  embedded?: boolean;
  node: ThermalNode;
  network: ThermalNetwork;
  readOnly: boolean;
  onPatch: (patch: Partial<ThermalNode>) => void;
  onFocus: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onToggleEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onToggleNode: () => void;
  onDeleteNode: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const mode = nodeRoleMode(node);

  const edges = Object.values(network.edges).filter(
    (edge) => edge.from === node.id || edge.to === node.id,
  );
  const component = node.component_ref;

  return (
    <div
      className={`flex min-h-0 flex-col ${embedded ? 'rounded-lg border border-line bg-surface' : ''}`}
    >
      {!embedded && (
        <header className="border-b border-line px-3.5 py-2.5">
          <p className="truncate text-[13px] font-bold text-ink-900">Node: {node.id}</p>
          <p className="truncate text-[11px] text-ink-500">{node.name}</p>
        </header>
      )}

      <nav
        className={`flex gap-0.5 border-b border-line px-2 pt-1.5 ${embedded ? 'flex-wrap' : 'overflow-x-auto'}`}
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`shrink-0 border-b-2 px-2 pb-1.5 text-[11px] font-semibold transition-colors ${
              tab === entry.id
                ? 'border-accent-600 text-accent-700'
                : 'border-transparent text-ink-400 hover:text-ink-700'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className={`min-h-0 flex-1 p-3.5 ${embedded ? '' : 'overflow-auto'}`}>
        {tab === 'overview' && (
          <div>
            <FieldLabel label="Node Name" zh="節點名稱" htmlFor="node-name" />
            <TextInput
              id="node-name"
              className="mt-1 mb-2 h-8 !text-[12px]"
              value={node.name}
              disabled={readOnly}
              onChange={(event) => onPatch({ name: event.target.value })}
            />

            <FieldLabel label="Node Type" zh="節點類型" htmlFor="node-type" />
            <Select
              id="node-type"
              className="mt-1 mb-2 h-8 !text-[12px]"
              value={node.type}
              disabled={readOnly}
              options={NODE_TYPES}
              onChange={(event) => onPatch({ type: event.target.value as NodeType })}
            />

            <Row label="Component" zh="元件">
              {component ?? <span className="text-ink-400">—</span>}
            </Row>
            <Row label="Zone" zh="區域">
              {attachedZone(network, node) ?? (
                <span className="text-ink-400">
                  {node.component_ref ? 'Not connected yet / 尚未連接' : 'n/a'}
                </span>
              )}
            </Row>
            <Row label="Origin" zh="來源">
              {node.origin?.kind === 'template'
                ? `Template ${node.origin.template_id} v${node.origin.template_version}`
                : node.origin?.kind === 'shared_structure'
                  ? 'Shared structure'
                  : 'Manual'}
              {node.origin?.modified && (
                <BilingualTooltip
                  zh="此物件已被手動修改。模板重建時選「僅自動產生」會保留它，選「全部取代」則會一併刪除。"
                  align="left"
                >
                  <span className="ml-1 text-warn-600">· manually modified</span>
                </BilingualTooltip>
              )}
            </Row>
            <Row label="Status" zh="狀態">
              {node.disabled ? (
                <Badge tone="neutral">DISABLED</Badge>
              ) : node.boundary_role === 'placeholder' ? (
                <BilingualTooltip zh={TOOLTIPS_ZH.boundaryPlaceholder}>
                  <Badge tone="warn">BOUNDARY PLACEHOLDER</Badge>
                </BilingualTooltip>
              ) : (
                <Badge tone="ok">ACTIVE</Badge>
              )}
            </Row>

            <div className="mt-3 flex gap-2">
              <Button
                className="h-8"
                icon={<Crosshair size={13} />}
                onClick={() => onFocus(node.id)}
              >
                Center / 置中
              </Button>
              <Button
                className="h-8"
                disabled={readOnly}
                icon={<Power size={13} />}
                onClick={onToggleNode}
              >
                {node.disabled ? 'Enable / 啟用' : 'Disable / 停用'}
              </Button>
              <Button
                variant="danger"
                className="h-8"
                disabled={readOnly}
                icon={<Trash2 size={13} />}
                onClick={onDeleteNode}
              >
                Delete
              </Button>
            </div>
          </div>
        )}

        {tab === 'role' && (
          <div>
            {mode === 'boundary' ? (
              /*
                A boundary is where the model stops. Its temperature comes from
                the Screen 06 scenario and it dissipates nothing, so there is no
                role to author — showing empty Power and Limit boxes here only
                invited someone to fill them.
              */
              <p className="mb-3 rounded-md border border-line bg-surface-muted p-2.5 text-[11px] leading-relaxed text-ink-500">
                This is a boundary node. Its temperature is set by the scenario in Screen 06, and
                nothing dissipates here, so it has neither a source power nor a limit of its own.
                <span className="mt-0.5 block">
                  此為邊界節點。溫度由 Screen 06 的情境設定，本身不發熱，
                  因此沒有節點功耗，也沒有自己的溫度上限。
                </span>
              </p>
            ) : mode === 'structure' ? (
              <div className="mb-3">
                <Row label="Source Power" zh="節點功耗">
                  <span className={node.power_W > 0 ? 'text-danger-600' : 'text-ink-500'}>
                    {node.power_W.toFixed(2)} W
                  </span>
                </Row>
                {hasStrayStructuralPower(node) ? (
                  <p className="mt-2 rounded-md border border-danger-500/40 bg-danger-100 p-2.5 text-[10px] leading-relaxed text-danger-600">
                    This structural node carries power. The solver injects the power of every node,
                    so this is heat entering the network from no component — it raises every
                    temperature downstream and inflates the total the energy balance is checked
                    against. Move it to the component that actually dissipates it. The value is
                    shown rather than silently zeroed because it is your stored data.
                    <span className="mt-0.5 block">
                      此結構節點帶有功耗。求解器會注入每個節點的功耗，
                      等於有一份不屬於任何元件的熱進入網路，會抬高下游所有溫度並灌水能量守恆的總量。
                      請把它移到真正發熱的元件上。此處顯示而非自動歸零，是因為那是你已儲存的資料。
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 rounded-md border border-line bg-surface-muted p-2.5 text-[10px] leading-relaxed text-ink-500">
                    Structure dissipates nothing, so this is fixed at 0 W. Heat is injected at the
                    component that produces it, and reaches here through the connections.
                    <span className="mt-0.5 block">
                      結構本身不發熱，因此固定為 0 W。熱由產生它的元件注入，經由連線傳到這裡。
                    </span>
                  </p>
                )}

                <div className="mt-3">
                  <FieldLabel label="Limit Type" zh="溫度上限類型" htmlFor="node-limit-type" />
                  <Select
                    id="node-limit-type"
                    className="mt-1 mb-2 h-8 !text-[12px]"
                    value={node.limit_type ?? 'Ts'}
                    disabled={readOnly}
                    options={LIMIT_TYPES}
                    onChange={(event) =>
                      onPatch({ limit_type: event.target.value as ThermalNode['limit_type'] })
                    }
                  />
                  <FieldLabel label="Thermal Limit" zh="溫度上限" unit="°C" htmlFor="node-limit" />
                  <NumberInput
                    id="node-limit"
                    className="mt-1 h-8 !text-[12px]"
                    placeholder="Optional / 選填"
                    value={node.limit_C ?? ''}
                    disabled={readOnly}
                    onChange={(event) =>
                      onPatch({
                        limit_C: event.target.value === '' ? null : Number(event.target.value),
                      })
                    }
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-400">
                    Optional. Structure has no datasheet limit, but a surface can still have a
                    design one — touch temperature, or a plastic part bolted against it. Leave it
                    empty and this node simply reports no margin. / 選填。結構沒有規格書上限，
                    但表面仍可能有設計上限（觸摸溫度、貼合的塑膠件）。留空則此節點不計餘裕。
                  </p>
                </div>
              </div>
            ) : mode === 'derived_source' ? (
              <div className="mb-3">
                <p className="mb-2 rounded-md border border-line bg-surface-muted p-2.5 text-[10px] leading-relaxed text-ink-500">
                  These come from the component in Screen 04 and are read-only here — editing them
                  would put a second answer where Screen 04 cannot see it, and the next template
                  rebuild would overwrite it.
                  <span className="mt-0.5 block">
                    以下數值來自 Screen 04 的元件資料，此處唯讀。在這裡改會產生 Screen 04
                    不知道的第二份數值，且下次重建模板時會被覆蓋。請至 Screen 04 修改。
                  </span>
                </p>
                <Row label="Source Power" zh="節點功耗">
                  {node.power_W.toFixed(2)} W
                </Row>
                <Row label="Limit Type" zh="溫度上限類型">
                  {node.limit_type ?? <span className="text-ink-400">—</span>}
                </Row>
                <Row label="Thermal Limit" zh="溫度上限">
                  {node.limit_C == null ? (
                    <span className="text-ink-400">—</span>
                  ) : (
                    `${node.limit_C} °C`
                  )}
                </Row>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
                  Source aggregation only. This is never the heat flow of any edge leaving the node.
                  / 僅為熱源聚合，不代表任何連線的 Heat Flow Q。
                </p>
              </div>
            ) : mode === 'derived_passive' ? (
              /*
                Not a gap to fill. A case, TIM or coin node dissipates nothing
                and has no junction limit of its own, so the fields are hidden
                rather than shown empty — blank inputs here were being read as
                missing input.
              */
              <p className="mb-3 rounded-md border border-line bg-surface-muted p-2.5 text-[11px] leading-relaxed text-ink-500">
                This node carries no source data: it dissipates nothing and has no thermal limit of
                its own. Its resistance lives on the connections, not here.
                <span className="mt-0.5 block">
                  此節點不帶熱源資料 —— 它本身不發熱，也沒有自己的溫度上限。
                  它的熱阻在「連線」分頁上，不在這裡。
                </span>
              </p>
            ) : (
              <>
                <FieldLabel
                  label="Source Power"
                  zh="節點功耗"
                  unit="W"
                  htmlFor="node-power"
                  tooltip={TOOLTIPS_ZH.totalPower}
                />
                <NumberInput
                  id="node-power"
                  className="mt-1 mb-1 h-8 !text-[12px]"
                  value={node.power_W}
                  disabled={readOnly}
                  onChange={(event) => onPatch({ power_W: Number(event.target.value) || 0 })}
                />
                <p className="mb-3 text-[10px] leading-relaxed text-ink-400">
                  Source aggregation only. This is never the heat flow of any edge leaving the node.
                  / 僅為熱源聚合，不代表任何連線的 Heat Flow Q。
                </p>

                <FieldLabel label="Limit Type" zh="溫度上限類型" htmlFor="node-limit-type" />
                <Select
                  id="node-limit-type"
                  className="mt-1 mb-2 h-8 !text-[12px]"
                  value={node.limit_type ?? 'Tj'}
                  disabled={readOnly}
                  options={LIMIT_TYPES}
                  onChange={(event) =>
                    onPatch({
                      limit_type: event.target.value as ThermalNode['limit_type'],
                    })
                  }
                />

                <FieldLabel label="Thermal Limit" zh="溫度上限" unit="°C" htmlFor="node-limit" />
                <NumberInput
                  id="node-limit"
                  className="mt-1 h-8 !text-[12px]"
                  value={node.limit_C ?? ''}
                  disabled={readOnly}
                  onChange={(event) =>
                    onPatch({
                      limit_C: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </>
            )}

            <div className="mt-3 rounded-md border border-line bg-surface-muted p-2.5">
              <p className="text-[11px] font-bold text-ink-700">Temperature results</p>
              <Row label="Analytical">
                <span className="text-ink-400">Not solved (Screen 07)</span>
              </Row>
              <Row label="FloTHERM">
                <span className="text-ink-400">Not imported (Screen 03)</span>
              </Row>
              <Row label="Measurement">
                <span className="text-ink-400">Reserved</span>
              </Row>
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
                Screen 05 defines topology only. Temperatures need boundary conditions from Screen
                06 and a solve in Screen 07. / 05 僅定義拓樸，溫度需 06 邊界條件與 07 求解。
              </p>
            </div>
          </div>
        )}

        {tab === 'connections' && (
          <div>
            {(node.ports ?? []).length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[11px] font-bold text-ink-700">
                  <BilingualTooltip zh={TOOLTIPS_ZH.thermalPort} align="left">
                    <span>Thermal Ports</span>
                  </BilingualTooltip>
                </p>
                <ul className="flex flex-col gap-1">
                  {(node.ports ?? []).map((port) => (
                    <li
                      key={port.kind}
                      className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1"
                    >
                      <span className="text-[11px] font-semibold text-ink-700">{port.kind}</span>
                      {port.connected_to ? (
                        <Badge tone="ok">
                          → {network.nodes[port.connected_to]?.name ?? port.connected_to}
                        </Badge>
                      ) : (
                        <Badge tone={port.required ? 'danger' : 'warn'}>
                          {port.required ? 'Required · unconnected' : 'Unconnected'}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mb-1 text-[11px] font-bold text-ink-700">
              Connected edges / 相連的連線 ({edges.length})
            </p>
            <ul className="flex flex-col gap-1">
              {edges.map((edge) => {
                const other = edge.from === node.id ? edge.to : edge.from;
                const R = activeRth(edge.rth);
                return (
                  <li key={edge.id} className="rounded border border-line px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectEdge(edge.id)}
                        className="min-w-0 truncate text-left text-[11px] font-semibold text-accent-700 hover:underline"
                      >
                        {edge.from === node.id ? '→ ' : '← '}
                        {network.nodes[other]?.name ?? other}
                      </button>
                      <span className="shrink-0 text-[11px] tabular text-ink-500">
                        {R != null ? `${R.toFixed(3)} °C/W` : 'N/A'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-ink-400">{edge.type}</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onToggleEdge(edge.id)}
                        className="ml-auto text-[10px] font-semibold text-ink-500 hover:text-accent-700 disabled:opacity-50"
                      >
                        {edge.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onDeleteEdge(edge.id)}
                        className="text-[10px] font-semibold text-danger-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
              {edges.length === 0 && (
                <li className="rounded border border-dashed border-line-strong px-2 py-3 text-center text-[11px] text-ink-400">
                  No connections yet. / 尚無連線。
                </li>
              )}
            </ul>
          </div>
        )}

        {tab === 'mapping' && (
          <div>
            <p className="mb-2 text-[11px] font-bold text-ink-700">
              <BilingualTooltip zh={TOOLTIPS_ZH.externalMapping} align="left">
                <span>FloTHERM</span>
              </BilingualTooltip>
            </p>
            <Row label="Status" zh="狀態">
              <Badge tone="neutral">
                {node.external_mappings?.flotherm?.mapping_status ?? 'unmapped'}
              </Badge>
            </Row>
            <FieldLabel
              label="Object aliases"
              zh="物件別名"
              htmlFor="node-alias"
              tooltip={TOOLTIPS_ZH.externalMapping}
            />
            <TextInput
              id="node-alias"
              className="mt-1 h-8 !text-[12px]"
              placeholder="e.g. Assembly/PA1/Case"
              disabled={readOnly}
              value={(node.external_mappings?.flotherm?.object_aliases ?? []).join(', ')}
              onChange={(event) => {
                const object_aliases = event.target.value
                  .split(',')
                  .map((alias) => alias.trim())
                  .filter(Boolean);
                onPatch({
                  external_mappings: {
                    ...node.external_mappings,
                    flotherm: {
                      ...node.external_mappings?.flotherm,
                      object_aliases,
                      mapping_status: object_aliases.length > 0 ? 'partial' : 'unmapped',
                    },
                  },
                });
              }}
            />
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">
              Alias text is stored only. Screen 03 is deferred: nothing here parses a FloTHERM file
              or imports a result. / 僅儲存別名文字，Screen 03 尚未實作解析。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
