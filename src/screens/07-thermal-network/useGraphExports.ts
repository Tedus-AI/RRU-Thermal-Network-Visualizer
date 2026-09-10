/**
 * The two graph exports, as a hook.
 *
 * Lifted out of `ThermalNetworkView` when Screen 10's network window grew the
 * same toolbar. Exporting the picture you are looking at is the point of
 * looking at it on either screen, and the PDF in particular — the whole network
 * then one page per component — is ninety lines of layout work that must not
 * exist twice and diverge.
 */

import { useCallback, useState } from 'react';

import { toast } from '@/ui/toast';
import { triggerDownload } from '@/export/download';
import {
  buildGraphPdf,
  exportFilename,
  measureImage,
  renderGraphImage,
  type PdfPageSource,
} from '@/export/exportNetworkGraph';
import { componentGraphPages, pageTitle } from '@/export/networkGraphPages';
import type { Component } from '@/domain/component';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import {
  buildElements,
  resultScales,
  type GraphDisplayOptions,
  type SolvedGraphHandle,
} from './SolvedGraphCanvas';
import { modeFilenamePart, type ResultMode } from './resultViewModel';

export interface GraphExportInput {
  canvasRef: React.RefObject<SolvedGraphHandle | null>;
  /** The topology the pictures are drawn from — projected limits included. */
  graphNetwork: ThermalNetwork | null;
  components: readonly Component[];
  solution: ThermalSolution | null;
  stale: boolean;
  mode: ResultMode;
  display: GraphDisplayOptions;
  layoutMode: string;
  scenarioId: string;
  scenarioName: string;
  projectName: string;
  nodeCount: number;
  edgeCount: number;
}

export function useGraphExports({
  canvasRef,
  graphNetwork,
  components,
  solution,
  stale,
  mode,
  display,
  layoutMode,
  scenarioId,
  scenarioName,
  projectName,
  nodeCount,
  edgeCount,
}: GraphExportInput) {
  const [exporting, setExporting] = useState<'jpg' | 'pdf' | null>(null);

  /**
   * The WHOLE graph as a measured image, regardless of the zoom on screen, at
   * model scale. Everything downstream measures the returned image rather than
   * assuming a size, because Cytoscape scales a render down when it meets a
   * canvas limit and says nothing.
   */
  const wholeGraphImage = useCallback(async () => {
    const dataUrl = canvasRef.current?.exportJpg() ?? null;
    if (!dataUrl) throw new Error('The graph has nothing to export yet.');
    return measureImage(dataUrl);
  }, [canvasRef]);

  const exportJpg = useCallback(async () => {
    setExporting('jpg');
    try {
      const image = await wholeGraphImage();
      triggerDownload(
        image.dataUrl,
        exportFilename(projectName, 'jpg', { mode: modeFilenamePart(mode) }),
      );
      toast.success(
        `Graph exported at ${image.width} × ${image.height} px / 已輸出熱網路圖（100% 尺寸）`,
      );
    } catch (error) {
      toast.error(
        `Export failed: ${error instanceof Error ? error.message : 'unknown error'} / 輸出失敗`,
      );
    } finally {
      setExporting(null);
    }
  }, [mode, projectName, wholeGraphImage]);

  /**
   * The whole graph, then one page per component — see `componentGraphPages`
   * for why a ×4 part is one page and not four.
   *
   * Each component page is rendered on its own offscreen instance so the part
   * is laid out alone rather than cropped out of a 113-node picture, and so the
   * engineer's own view is never disturbed. The colour ramps stay those of the
   * WHOLE network: rescaled per page, every page would show a red node and mean
   * something different by it.
   */
  const exportPdf = useCallback(async () => {
    // The button is only reachable once the callers' guards have passed, so
    // this is the type system catching up with the screen rather than a real
    // case.
    if (!graphNetwork) return;
    setExporting('pdf');
    try {
      const scales = resultScales(stale ? null : solution);
      const sources: PdfPageSource[] = [
        {
          title: `${projectName || 'Thermal network'} — full network`,
          subtitle: `${nodeCount} nodes · ${edgeCount} edges · ${scenarioName}`.trim(),
          image: await wholeGraphImage(),
        },
      ];

      for (const page of componentGraphPages(graphNetwork, components)) {
        const elements = buildElements(
          graphNetwork,
          stale ? null : solution,
          mode,
          display,
          scenarioId,
          layoutMode,
          scales,
          page.hidden_component_ids,
          page.hidden_node_ids,
        );
        // A part whose every node was filtered out has nothing to draw; skip it
        // rather than adding a blank sheet.
        if (elements.length === 0) continue;
        sources.push({
          title: pageTitle(page),
          subtitle: `${page.component_id} · heat path to ambient`,
          image: await renderGraphImage(elements, layoutMode),
        });
      }

      const blob = await buildGraphPdf(sources);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, exportFilename(projectName, 'pdf', { mode: modeFilenamePart(mode) }));
      // Revoked on the next tick: revoking synchronously races the download in
      // Chromium and yields a zero-byte file.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`PDF exported — ${sources.length} pages / 已輸出 PDF，共 ${sources.length} 頁`);
    } catch (error) {
      toast.error(
        `Export failed: ${error instanceof Error ? error.message : 'unknown error'} / 輸出失敗`,
      );
    } finally {
      setExporting(null);
    }
  }, [
    components,
    display,
    edgeCount,
    graphNetwork,
    layoutMode,
    mode,
    nodeCount,
    projectName,
    scenarioId,
    scenarioName,
    solution,
    stale,
    wholeGraphImage,
  ]);

  return { exporting, exportJpg, exportPdf };
}
