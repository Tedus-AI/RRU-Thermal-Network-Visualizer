/**
 * Step 3 — Shared Structure (05 §13, §14, §15, §42, §43, §44).
 *
 * Builds the system-level structure every component connects to. The boundary
 * rule: this screen may create `FIN_SURFACE → AMBIENT_PLACEHOLDER`, but that
 * edge stays UNRESOLVED. Ambient, h_conv, h_rad, wind and solar are Screen 06.
 */

import { useState } from 'react';
import { Crosshair, Plus, Waypoints } from 'lucide-react';

import { Badge, Button, NumberInput, Select, TextInput } from '@/ui/primitives';
import { Bi, BilingualTooltip, FieldLabel, biTitle } from '@/ui/FieldLabel';
import { TOOLTIPS_ZH } from './tooltips';

import type { Confidence, NodeType, ThermalNetwork } from '@/thermal/types';
import {
  PRESET_LABELS,
  STRUCTURE_PRESETS,
  type StructurePreset,
} from '@/thermal/graph/sharedStructure';

// 'Main Base' was here too, meaning the same thing as 'Heat Sink Base' — the
// name the structure presets had before the HSK rename. Offering both invited
// a project to end up with two names for one part.
const ZONE_TYPES: Array<{ value: NodeType; label: string }> = [
  { value: 'base_zone', label: 'Base Zone' },
  { value: 'small_base', label: 'Small Base' },
  { value: 'housing', label: 'Housing' },
  { value: 'heat_sink_base', label: 'Heat Sink Base' },
  { value: 'custom', label: 'Custom' },
];

const SPREADING_METHODS = [
  { value: 'manual', label: 'Manual' },
  { value: 'correlation', label: 'Correlation' },
  { value: 'unresolved', label: 'Unresolved' },
  { value: 'future_flotherm', label: 'Future FloTHERM (placeholder)' },
];

export interface NewZoneDraft {
  name: string;
  type: NodeType;
  linkedHsk: string;
  notes: string;
}

export interface NewSpreadingDraft {
  from: string;
  to: string;
  method: string;
  rth: number | null;
  source: string;
  confidence: Confidence;
}

export function SharedStructurePanel({
  network,
  preset,
  readOnly,
  onPresetChange,
  onApplyPreset,
  onAddZone,
  onAddSpreading,
  onFocusNode,
}: {
  network: ThermalNetwork | null;
  preset: StructurePreset;
  readOnly: boolean;
  onPresetChange: (preset: StructurePreset) => void;
  onApplyPreset: () => void;
  onAddZone: (draft: NewZoneDraft) => void;
  onAddSpreading: (draft: NewSpreadingDraft) => void;
  onFocusNode: (nodeId: string) => void;
}) {
  const [zoneOpen, setZoneOpen] = useState(false);
  const [spreadOpen, setSpreadOpen] = useState(false);
  const [zone, setZone] = useState<NewZoneDraft>({
    name: '',
    type: 'base_zone',
    linkedHsk: '',
    notes: '',
  });
  const [spreading, setSpreading] = useState<NewSpreadingDraft>({
    from: '',
    to: '',
    method: 'unresolved',
    rth: null,
    source: '',
    confidence: 'low',
  });

  const structureNodes = Object.values(network?.nodes ?? {}).filter(
    (node) => node.origin?.kind === 'shared_structure' || node.origin?.kind === 'manual',
  );
  const zoneNodes = structureNodes.filter(
    (node) => node.type === 'base_zone' || node.type === 'small_base',
  );
  const hskNodes = structureNodes.filter((node) => node.type === 'heat_sink_base');

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <FieldLabel
          label="Preset"
          zh="預設結構"
          htmlFor="structure-preset"
          tooltip={TOOLTIPS_ZH.sharedStructure}
        />
        <div className="mt-1 flex gap-2">
          <Select
            id="structure-preset"
            className="h-8 min-w-0 flex-1 !text-[12px]"
            value={preset}
            disabled={readOnly}
            // A native select truncates rather than wraps, so the option text is
            // English and the Chinese rides on the control's tooltip.
            title={biTitle(PRESET_LABELS[preset].label, PRESET_LABELS[preset].zh)}
            items={STRUCTURE_PRESETS.map((entry) => ({
              value: entry,
              label: PRESET_LABELS[entry].label,
            }))}
            onChange={(event) => onPresetChange(event.target.value as StructurePreset)}
          />
          <Button
            className="h-8 shrink-0"
            disabled={readOnly}
            title={biTitle('Apply preset', '套用預設結構')}
            onClick={onApplyPreset}
            icon={<Waypoints size={13} />}
          >
            Apply
          </Button>
        </div>
      </div>

      <ul className="max-h-40 overflow-auto rounded-md border border-line">
        {structureNodes.length === 0 && (
          <li className="px-2.5 py-3 text-center text-[11px] text-ink-400">
            <Bi en="No shared structure yet." zh="尚未建立共用結構。" inline />
          </li>
        )}
        {structureNodes.map((node) => (
          <li
            key={node.id}
            className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-700">
              {node.name}
            </span>
            {node.boundary_role === 'placeholder' && (
              <BilingualTooltip zh={TOOLTIPS_ZH.boundaryPlaceholder}>
                <Badge tone="warn">Screen 06</Badge>
              </BilingualTooltip>
            )}
            <button
              type="button"
              title={biTitle(`Center "${node.name}"`, '在畫布上置中')}
              aria-label={biTitle(`Center "${node.name}" on the canvas`, '在畫布上置中')}
              onClick={() => onFocusNode(node.id)}
              className="shrink-0 text-ink-400 hover:text-accent-600"
            >
              <Crosshair size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button
          className="h-8 flex-1"
          disabled={readOnly}
          icon={<Plus size={13} />}
          title={biTitle('Add Zone', '新增基座區域')}
          onClick={() => setZoneOpen((open) => !open)}
        >
          Add Zone
        </Button>
        <Button
          className="h-8 flex-1"
          disabled={readOnly}
          icon={<Plus size={13} />}
          title={biTitle('Add Spreading Edge', TOOLTIPS_ZH.spreadingResistance)}
          onClick={() => setSpreadOpen((open) => !open)}
        >
          Spreading
        </Button>
      </div>

      {zoneOpen && (
        <div className="grid gap-2 rounded-md border border-line bg-surface-muted p-2.5">
          <div>
            <FieldLabel label="Zone Name" zh="區域名稱" htmlFor="zone-name" required />
            <TextInput
              id="zone-name"
              className="mt-1 h-8 !text-[12px]"
              value={zone.name}
              onChange={(event) => setZone({ ...zone, name: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel label="Zone Type" zh="區域類型" htmlFor="zone-type" />
            <Select
              id="zone-type"
              className="mt-1 h-8 !text-[12px]"
              value={zone.type}
              items={ZONE_TYPES}
              onChange={(event) => setZone({ ...zone, type: event.target.value as NodeType })}
            />
          </div>
          <div>
            <FieldLabel label="Linked HSK" zh="連結散熱器" htmlFor="zone-hsk" />
            <Select
              id="zone-hsk"
              className="mt-1 h-8 !text-[12px]"
              value={zone.linkedHsk}
              items={[
                { value: '', label: '— None —' },
                ...hskNodes.map((node) => ({ value: node.id, label: node.name })),
              ]}
              onChange={(event) => setZone({ ...zone, linkedHsk: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel label="Notes" zh="備註" htmlFor="zone-notes" />
            <TextInput
              id="zone-notes"
              className="mt-1 h-8 !text-[12px]"
              value={zone.notes}
              onChange={(event) => setZone({ ...zone, notes: event.target.value })}
            />
          </div>
          <div>
            <Button
              variant="primary"
              className="h-8"
              disabled={!zone.name.trim()}
              title={biTitle('Create Zone', '建立區域')}
              onClick={() => {
                onAddZone(zone);
                setZone({ name: '', type: 'base_zone', linkedHsk: '', notes: '' });
                setZoneOpen(false);
              }}
            >
              Create Zone
            </Button>
          </div>
        </div>
      )}

      {spreadOpen && (
        <div className="grid gap-2 rounded-md border border-line bg-surface-muted p-2.5">
          <div>
            <FieldLabel label="From Zone" zh="起始區域" htmlFor="spread-from" required />
            <Select
              id="spread-from"
              className="mt-1 h-8 !text-[12px]"
              value={spreading.from}
              items={[
                { value: '', label: '— Select —' },
                ...zoneNodes.map((node) => ({ value: node.id, label: node.name })),
              ]}
              onChange={(event) => setSpreading({ ...spreading, from: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel label="To Zone" zh="目標區域" htmlFor="spread-to" required />
            <Select
              id="spread-to"
              className="mt-1 h-8 !text-[12px]"
              value={spreading.to}
              items={[
                { value: '', label: '— Select —' },
                ...zoneNodes.map((node) => ({ value: node.id, label: node.name })),
              ]}
              onChange={(event) => setSpreading({ ...spreading, to: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel
              label="Method"
              zh="方法"
              htmlFor="spread-method"
              tooltip={TOOLTIPS_ZH.spreadingResistance}
            />
            <Select
              id="spread-method"
              className="mt-1 h-8 !text-[12px]"
              value={spreading.method}
              items={SPREADING_METHODS}
              onChange={(event) => setSpreading({ ...spreading, method: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel label="Rth" zh="熱阻" unit="°C/W" htmlFor="spread-rth" />
            <NumberInput
              id="spread-rth"
              className="mt-1 h-8 !text-[12px]"
              value={spreading.rth ?? ''}
              disabled={spreading.method !== 'manual' && spreading.method !== 'correlation'}
              onChange={(event) =>
                setSpreading({
                  ...spreading,
                  rth: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </div>
          <div>
            <FieldLabel label="Source" zh="來源" htmlFor="spread-source" />
            <TextInput
              id="spread-source"
              className="mt-1 h-8 !text-[12px]"
              value={spreading.source}
              onChange={(event) => setSpreading({ ...spreading, source: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel label="Confidence" zh="信心度" htmlFor="spread-confidence" />
            <Select
              id="spread-confidence"
              className="mt-1 h-8 !text-[12px]"
              value={spreading.confidence}
              options={['high', 'medium', 'low']}
              onChange={(event) =>
                setSpreading({ ...spreading, confidence: event.target.value as Confidence })
              }
            />
          </div>
          <div>
            <Button
              variant="primary"
              className="h-8"
              disabled={!spreading.from || !spreading.to || spreading.from === spreading.to}
              title={biTitle('Create Edge', '建立連線')}
              onClick={() => {
                onAddSpreading(spreading);
                setSpreading({
                  from: '',
                  to: '',
                  method: 'unresolved',
                  rth: null,
                  source: '',
                  confidence: 'low',
                });
                setSpreadOpen(false);
              }}
            >
              Create Edge
            </Button>
            <p className="mt-1 text-[10px] text-ink-400">
              A zone-to-zone coupling cycle is legal physics and is not treated as an error
              (05 §34). / 區域間耦合形成的迴圈是合法的，不會被判為錯誤。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
