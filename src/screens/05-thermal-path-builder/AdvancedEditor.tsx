/**
 * 「進階編修」 in card ① of Screen 05: the hand tools for the topology — a
 * component's template, the shared structure, starting from blank.
 *
 * The network is normally generated from 04 in one click, so these stay
 * folded away; a design with two heat sinks or an unusual shared structure
 * still has every tool it had when they were steps of their own. Opening it
 * also unlocks the canvas tools that add, connect and delete.
 */

import { Button } from '@/ui/primitives';

import type { ThermalNetwork } from '@/thermal/types';

import { ComponentPalette } from './ComponentPalette';
import { TemplatePalette } from './TemplatePalette';
import { SharedStructurePanel } from './SharedStructurePanel';
import { CardDisclosure } from './WorkspaceCard';
import type { ThermalPathBuilder } from './useThermalPathBuilder';

export function AdvancedEditor({
  builder,
  network,
}: {
  builder: ThermalPathBuilder;
  network: ThermalNetwork;
}) {
  const {
    canvasRef,
    components,
    handleAddSpreading,
    handleAddZone,
    handleApplyPreset,
    handleApplyTemplate,
    handlePrefChange,
    hiddenComponentIds,
    modeledIds,
    prefs,
    readOnly,
    selectedComponent,
    selectedComponentId,
    selectedPref,
    setHiddenComponentIds,
    setSelectedComponentId,
    setSelection,
    setStep,
    setStructurePreset,
    structurePreset,
    toggleComponentVisible,
  } = builder;

  return (
    <div className="flex flex-col gap-2" data-advanced-editor>
      <p className="text-[10.5px] leading-relaxed text-ink-400">
        畫布上的「連接埠、新增節點、新增連線、依建議連接」與 Delete 鍵現在可以用。一般專案不必動這裡：
        改 04 之後回到上面按「依 04 重新產生」即可。
      </p>
      <CardDisclosure name="components" title="元件與模板" hint="選一顆元件，換它的散熱架構模板" defaultOpen>
        <ComponentPalette
          components={components}
          prefs={prefs}
          modeledIds={modeledIds}
          selectedId={selectedComponentId}
          hiddenIds={hiddenComponentIds}
          onToggleVisible={toggleComponentVisible}
          onShowAll={() => setHiddenComponentIds(new Set())}
          onSelect={setSelectedComponentId}
        />
        <div className="mt-2 border-t border-line pt-2">
          <TemplatePalette
            component={selectedComponent}
            pref={selectedPref}
            hasSubgraph={Boolean(selectedComponent && modeledIds.has(selectedComponent.id))}
            readOnly={readOnly}
            onPrefChange={(next) => {
              if (!selectedComponent) return;
              handlePrefChange(selectedComponent.id, next);
            }}
            onApply={handleApplyTemplate}
          />
        </div>
      </CardDisclosure>
      <CardDisclosure name="structure" title="共用結構" hint="散熱器底座、分區、擴散">
        <SharedStructurePanel
          network={network}
          preset={structurePreset}
          readOnly={readOnly}
          onPresetChange={setStructurePreset}
          onApplyPreset={handleApplyPreset}
          onAddZone={handleAddZone}
          onAddSpreading={handleAddSpreading}
          onFocusNode={(nodeId) => {
            setSelection({ kind: 'node', id: nodeId });
            canvasRef.current?.center(nodeId);
          }}
        />
      </CardDisclosure>
      <Button
        className="h-8 self-start"
        disabled={readOnly}
        title="只建立共用結構，元件之後再一顆一顆加"
        onClick={() => {
          handleApplyPreset();
          setStep('structure');
        }}
      >
        從空白開始
      </Button>
    </div>
  );
}
