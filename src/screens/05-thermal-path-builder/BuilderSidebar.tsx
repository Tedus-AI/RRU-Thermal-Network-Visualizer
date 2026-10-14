/**
 * Screen 05 tool column: the component, template and shared-structure palettes,
 * one section open per step.
 */

import { Button } from '@/ui/primitives';
import { ResizableSidebar } from '@/ui/ResizableSidebar';

import type { ThermalNetwork } from '@/thermal/types';

import { ComponentPalette } from './ComponentPalette';
import { TemplatePalette } from './TemplatePalette';
import { SharedStructurePanel } from './SharedStructurePanel';
import { Collapsible } from './builderBlocks';
import type { ThermalPathBuilder } from './useThermalPathBuilder';

interface BuilderSidebarProps {
  builder: ThermalPathBuilder;
  network: ThermalNetwork;
}

export function BuilderSidebar({ builder, network }: BuilderSidebarProps) {
  const {
    canvasRef,
    components,
    enabledComponents,
    handleAddSpreading,
    handleAddZone,
    handleApplyPreset,
    handleApplyTemplate,
    handlePrefChange,
    hiddenComponentIds,
    modeledIds,
    openPanel,
    prefs,
    readOnly,
    selectedComponent,
    selectedComponentId,
    selectedPref,
    setHiddenComponentIds,
    setOpenPanel,
    setSelectedComponentId,
    setSelection,
    setShowGenerate,
    setStep,
    setStructurePreset,
    structurePreset,
    toggleComponentVisible,
  } = builder;
  return (
    <ResizableSidebar
      id="05"
      defaultWidth={304}
      labelEn="component tools"
      labelZh="元件工具"
      shortEn="Tools"
      shortZh="工具"
    >
      <Collapsible
        title="Components"
        zh="元件"
        open={openPanel.components}
        onToggle={() =>
          setOpenPanel({
            ...openPanel,
            components: !openPanel.components,
          })
        }
      >
        <ComponentPalette
          components={components}
          prefs={prefs}
          modeledIds={modeledIds}
          selectedId={selectedComponentId}
          hiddenIds={hiddenComponentIds}
          onToggleVisible={toggleComponentVisible}
          onShowAll={() => setHiddenComponentIds(new Set())}
          onSelect={(componentId) => {
            setSelectedComponentId(componentId);
            setOpenPanel((panels) => ({ ...panels, templates: true }));
          }}
        />
      </Collapsible>

      <Collapsible
        title="Templates"
        zh="架構模板"
        open={openPanel.templates}
        onToggle={() => setOpenPanel({ ...openPanel, templates: !openPanel.templates })}
      >
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
      </Collapsible>

      <Collapsible
        title="Shared Structure"
        zh="共用結構"
        open={openPanel.structure}
        onToggle={() => setOpenPanel({ ...openPanel, structure: !openPanel.structure })}
      >
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
      </Collapsible>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="primary"
          className="h-8 flex-1"
          disabled={readOnly || enabledComponents.length === 0}
          onClick={() => setShowGenerate(true)}
        >
          Generate from Preferences
        </Button>
        <Button
          className="h-8 flex-1"
          disabled={readOnly}
          onClick={() => {
            handleApplyPreset();
            setStep('structure');
          }}
        >
          Start Blank
        </Button>
      </div>
    </ResizableSidebar>
  );
}
