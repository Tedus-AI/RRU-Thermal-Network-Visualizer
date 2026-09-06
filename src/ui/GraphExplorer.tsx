import { useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { ThermalNetwork } from '@/thermal/types';
import { focusHiddenNodes, focusLabels, graphPaths } from './graphExplorerModel';
import { GraphPathPreview, type GraphPreviewOptions } from './GraphPathPreview';

const EMPTY = new Set<string>();
type View = 'full' | 'groups' | 'focus';

export function useGraphExplorer(
  network: ThermalNetwork | null | undefined,
  components: readonly { id: string; name: string }[] = [],
  hiddenIds: ReadonlySet<string> = EMPTY,
) {
  const [view, setView] = useState<View>('full');
  const [focusKey, setFocusKey] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(EMPTY);
  const paths = useMemo(() => graphPaths(network), [network]);
  const focused =
    view === 'focus'
      ? paths.find((path) => path.key === focusKey && !hiddenIds.has(path.componentId))
      : undefined;
  const hiddenNodes = useMemo(
    () => (network && focused ? focusHiddenNodes(network, focused) : EMPTY),
    [network, focused],
  );
  const labels = useMemo(() => {
    const name = components.find((c) => c.id === focused?.componentId)?.name;
    return network && focused && name ? focusLabels(network, focused, name) : undefined;
  }, [network, focused, components]);
  return {
    view: view === 'focus' && !focused ? ('full' as const) : view,
    setView,
    paths,
    focused,
    hiddenNodes,
    expanded,
    network,
    labels,
    showFull(action?: () => void) {
      flushSync(() => setView('full'));
      action?.();
    },
    focus(key: string) {
      setFocusKey(key);
      setView('focus');
    },
    toggle(id: string) {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
  };
}

type Explorer = ReturnType<typeof useGraphExplorer>;
/** Existing canvas commands remain real commands, never operate under a hidden overview. */
export function GraphToolbarBridge({
  explorer,
  children,
}: {
  explorer: Explorer;
  children: ReactNode;
}) {
  const reveal = () => {
    if (explorer.view === 'groups') explorer.showFull();
  };
  return (
    <div onClickCapture={reveal} onChangeCapture={reveal}>
      {children}
    </div>
  );
}
type Props = {
  explorer: Explorer;
  components: readonly { id: string; name: string; category?: string }[];
  hiddenIds: ReadonlySet<string>;
};
const watts = (value: number) => `${value.toFixed(1)} W`;
const button =
  'rounded-md border px-3 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';

export function GraphExplorerControls({ explorer: ex, components, hiddenIds }: Props) {
  const name = (id: string) => components.find((c) => c.id === id)?.name ?? id;
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2"
      aria-label="熱網路檢視"
    >
      {(['full', 'groups'] as const).map((view, i) => (
        <button
          key={view}
          type="button"
          className={`${button} ${ex.view === view ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
          aria-pressed={ex.view === view}
          onClick={() => ex.setView(view)}
        >
          {i === 0 ? '完整熱網路' : '群組總覽'}
        </button>
      ))}
      <select
        className="min-w-0 max-w-[32rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        aria-label="聚焦元件路徑"
        value={ex.focused?.key ?? ''}
        onChange={(event) =>
          event.target.value ? ex.focus(event.target.value) : ex.setView('full')
        }
      >
        <option value="">聚焦單一路徑…</option>
        {ex.paths
          .filter((path) => !hiddenIds.has(path.componentId))
          .map((path) => {
            const siblings = ex.paths.filter((other) => other.componentId === path.componentId);
            const badge =
              siblings.length > 1
                ? ` · ${String(siblings.indexOf(path) + 1).padStart(2, '0')}`
                : '';
            return (
              <option key={path.key} value={path.key}>
                {name(path.componentId)}
                {badge} · {watts(path.power)}
              </option>
            );
          })}
      </select>
      <span className="text-[11px] text-slate-500">
        {ex.view === 'focus'
          ? '聚焦含相連共用結構與環境；僅檢視，不修改配置'
          : '僅視覺分組，不合併熱節點或計算'}
      </span>
    </div>
  );
}

export function GraphGroupOverview({
  explorer: ex,
  components,
  hiddenIds,
  ...preview
}: Props & GraphPreviewOptions) {
  if (ex.view !== 'groups') return null;
  const ids = [...new Set(ex.paths.map((path) => path.componentId))];
  return (
    <div
      className="absolute inset-0 z-[5] overflow-auto bg-slate-50 p-5 pb-64"
      aria-label="元件群組總覽"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">元件群組 · 熱路徑導覽</h3>
        <span className="text-xs text-slate-500">展開檢視各路徑；聚焦可查看所有實際分支與熱阻</span>
      </div>
      <div className="grid items-start gap-3">
        {ids
          .filter((id) => !hiddenIds.has(id))
          .map((id) => {
            const paths = ex.paths.filter((path) => path.componentId === id);
            const name = components.find((c) => c.id === id)?.name ?? id;
            const open = ex.expanded.has(id) || paths.length === 1;
            return (
              <section
                key={id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 border-l-4 border-amber-400 px-4 py-4 text-left"
                  aria-expanded={open}
                  onClick={() => (paths.length === 1 ? ex.focus(paths[0].key) : ex.toggle(id))}
                >
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-800">
                    {name}
                    {paths.length > 1 && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                        ×{paths.length}
                      </span>
                    )}
                    <span className="ml-2 whitespace-nowrap font-normal text-amber-700">
                      {watts(paths.reduce((sum, path) => sum + path.power, 0))}
                      {paths.length > 1 ? ' 合計' : ''}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {paths.length === 1 ? '聚焦 →' : open ? '收合 −' : '展開 +'}
                  </span>
                </button>
                <div className="border-t border-slate-100 px-3 py-2">
                  {(open ? paths : paths.slice(0, 1)).map((path, index) => (
                    <div key={path.key}>
                      <button
                        type="button"
                        className="my-1 flex w-full items-center gap-3 rounded-lg bg-slate-50 p-3 text-left hover:bg-blue-50"
                        onClick={() => ex.focus(path.key)}
                        title="查看此實例的完整熱路徑（保留並聯分支）"
                      >
                        {paths.length > 1 && (
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs tabular-nums text-slate-500">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 text-xs text-slate-700">
                          {name} · {watts(path.power)}
                          <span className="mt-1 block text-[11px] text-slate-500">
                            {!open ? '第一實例預覽（其他實例可能不同） · ' : ''}
                            {path.nodeIds.length} 個獨立熱節點 · 聚焦可查看相連共用結構
                          </span>
                        </span>
                        <span className="text-xs text-blue-600">聚焦 →</span>
                      </button>
                      {ex.network && (
                        <GraphPathPreview network={ex.network} path={path} {...preview} />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
      </div>
      {ids.every((id) => hiddenIds.has(id)) && (
        <p className="p-8 text-center text-sm text-slate-500">
          沒有可顯示的元件。請使用原有元件顯示工具開啟元件。
        </p>
      )}
      <p className="mt-4 text-xs text-slate-500">
        此處依元件歸屬分組，不代表各實例的熱阻、分支或結果相同。未歸屬元件的手動節點請於「完整熱網路」檢視。
      </p>
    </div>
  );
}
