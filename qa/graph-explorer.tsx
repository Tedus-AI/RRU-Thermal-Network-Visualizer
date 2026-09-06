/** Vite-only UI regression fixture. No project folder, store mutations or saved projects. */
import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { demoNetwork } from '@/mock/demoGoldenFlow';
import { demoComponents } from '@/mock/demoProject';
import { GraphExplorerControls, GraphGroupOverview, GraphToolbarBridge, useGraphExplorer } from '@/ui/GraphExplorer';
import {
  ThermalGraphCanvas,
  type CanvasHandle,
} from '@/screens/05-thermal-path-builder/ThermalGraphCanvas';
import {
  SolvedGraphCanvas,
  type SolvedGraphHandle,
} from '@/screens/07-thermal-network/SolvedGraphCanvas';
import { BoundaryGraphToolbar } from '@/screens/06-boundary-conditions/BoundaryGraphToolbar';
import type { CanvasTool } from '@/screens/05-thermal-path-builder/GraphToolbar';

function Fixture() {
  const components = useMemo(demoComponents, []);
  const network = useMemo(() => demoNetwork(components), [components]);
  const ex = useGraphExplorer(network, components);
  const canvas = useRef<CanvasHandle>(null);
  const solved = useRef<SolvedGraphHandle>(null);
  const pending = useRef<string | null>(null);
  const [screen, setScreen] = useState('05/06');
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [layout, setLayout] = useState('Auto');
  const [labels, setLabels] = useState(true);
  const [ports, setPorts] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [writes, setWrites] = useState(0);
  const hidden = useMemo(() => new Set<string>(), []);
  const relayout = (mode: string) => {
    canvas.current?.runLayout(mode);
    solved.current?.relayout(mode);
  };
  return (
    <main className="flex h-screen flex-col bg-slate-100 p-5">
      <header className="mb-3 flex items-center gap-4 text-sm">
        <b>非機密 Golden Demo · 真實 Canvas 元件回歸測試</b>
        <button onClick={() => setScreen(screen === '07' ? '05/06' : '07')}>
          切換 Canvas：{screen}
        </button>
        <span>配置回呼 {writes}</span>
        <button
          onClick={() => {
            const expected = JSON.stringify(network.layout.positions);
            const actual = JSON.stringify(canvas.current?.positions());
            alert(
              expected === actual ? '原始座標保持一致' : '完整圖自動配置（聚焦時應保持原始座標）',
            );
          }}
        >
          檢查座標隔離
        </button>
      </header>
      <section
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white ${fullscreen ? 'fixed inset-0 z-30' : ''}`}
      >
        <GraphToolbarBridge explorer={ex}>
          <BoundaryGraphToolbar
            tool={tool}
            layoutMode={layout}
            zoom={zoom}
            showLabels={labels}
            showPorts={ports}
            fullscreen={fullscreen}
            onTool={setTool}
            onLayoutMode={(mode) => {
              setLayout(mode);
              relayout(mode);
            }}
            onAutoLayout={() => relayout(layout)}
            onFit={() => {
              ex.showFull(() => {
                canvas.current?.fit();
                solved.current?.fit();
              });
            }}
            onZoom={(delta) => {
              canvas.current?.zoomBy(delta);
              solved.current?.zoomBy(delta);
            }}
            onValidate={() => undefined}
            onTogglePorts={() => setPorts(!ports)}
            onToggleLabels={() => setLabels(!labels)}
            onToggleFullscreen={() => setFullscreen(!fullscreen)}
          />
        </GraphToolbarBridge>
        <GraphExplorerControls explorer={ex} components={components} hiddenIds={hidden} />
        <div className="relative min-h-0 flex-1">
          <GraphGroupOverview explorer={ex} components={components} hiddenIds={hidden} />
          {screen === '07' ? (
            <SolvedGraphCanvas
              ref={solved}
              network={network}
              solution={null}
              mode="rth"
              display={{
                showLabels: labels,
                showPower: true,
                showLimits: false,
                showBoundary: true,
              }}
              scenarioId=""
              selectedNodeId={null}
              selectedEdgeId={null}
              tool={tool === 'zoom-box' ? 'zoom-box' : 'select'}
              layoutMode={layout}
              hiddenComponentIds={hidden}
              extraHiddenNodeIds={ex.hiddenNodes}
              nodeLabelOverrides={ex.labels}
              focusKey={ex.focused?.key}
              onSelectNode={() => undefined}
              onSelectEdge={() => undefined}
              onZoomChange={setZoom}
            />
          ) : (
            <ThermalGraphCanvas
              ref={canvas}
              network={network}
              selection={null}
              tool={tool}
              showPorts={ports}
              showLabels={labels}
              layoutMode={layout}
              readOnly
              hiddenComponentIds={hidden}
              extraHiddenNodeIds={ex.hiddenNodes}
              nodeLabelOverrides={ex.labels}
              focusKey={ex.focused?.key}
              onSelect={() => undefined}
              onNodeMoved={() => undefined}
              onConnect={() => undefined}
              onContextMenu={() => undefined}
              onZoomChange={setZoom}
              onLayout={() => setWrites((n) => n + 1)}
              pendingSourceRef={pending}
            />
          )}
        </div>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
