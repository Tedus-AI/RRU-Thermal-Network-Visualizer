/**
 * Snapshot PNGs — 12 §15, §16, AC-12-17.
 *
 * §15 is a fence: "Export only already supported views" and "Do not invent new
 * analytical views in 12." This module used to honour the letter of that and
 * break its spirit. It drew two fixed pictures -- the solved network, and a
 * bottleneck overlay -- with a stylesheet of its own, a colour ramp of its own
 * and its own idea of what an edge label says, so the file an engineer opened
 * was a near-miss of the screen it claimed to be a snapshot of.
 *
 * Now there is no drawing code here at all. Each image is Screen 07's own
 * `buildElements` against Screen 07's own `solvedStylesheet`, rendered by the
 * same offscreen renderer the report's figures use, filtered by the same
 * hidden-sets the report's figures are filtered by. What comes out is the
 * picture the engineer has already been looking at, in a file.
 *
 * WHICH pictures is the engineer's choice, from the matrix on Screen 11: a
 * subject down the side, a result view across the top, one PNG per tick.
 */

import { buildElements, resultScales } from '@/screens/07-thermal-network/SolvedGraphCanvas';
import { renderGraphImage } from '@/export/exportNetworkGraph';
import type { ThermalNetwork } from '@/thermal/types';
import type { ThermalSolution } from '@/thermal/solver/solverTypes';

import {
  hiddenNodesFor,
  snapshotFilename,
  snapshotLabel,
  snapshotPairs,
  type SnapshotSelection,
  type SnapshotSubject,
} from './snapshotSelection';
import type { PngScale } from './exportTypes';

export interface SnapshotImage {
  /** File name inside `images/` — 12 §16. */
  name: string;
  label: string;
  blob: Blob;
}

export interface SnapshotInput {
  network: ThermalNetwork;
  solution: ThermalSolution;
  scenario_id: string;
  subjects: readonly SnapshotSubject[];
  selection: SnapshotSelection;
  scale: PngScale;
}

/**
 * Labels, power, limits and the boundary, as Screen 09's network window has it.
 *
 * Not the engineer's own Screen 07 toggles: those are a working state that
 * changes while a question is being asked, and a file exported on Tuesday
 * should not be missing its node names because a checkbox was off at the time.
 */
const DISPLAY = { showLabels: true, showPower: true, showLimits: true, showBoundary: true };

export interface SnapshotResult {
  images: SnapshotImage[];
  /** 12 §31 — "optional image unavailable" is a warning, not a failure. */
  warnings: string[];
}

/**
 * Renders every picture the matrix asks for.
 *
 * One image failing never costs the others: each is attempted independently and
 * a failure becomes a warning line, which is §30's failure isolation applied
 * inside a single artifact.
 *
 * The colour ramps are built ONCE, from the whole solution, and handed to every
 * render. Rescaled per picture, the RF chain would be painted from its own
 * hottest node down and the power chain from its own -- two files, both with a
 * red node, meaning different temperatures by it.
 */
export async function exportPngSnapshots(input: SnapshotInput): Promise<SnapshotResult> {
  const images: SnapshotImage[] = [];
  const warnings: string[] = [];

  const pairs = snapshotPairs(input.subjects, input.selection);
  if (pairs.length === 0) {
    return { images, warnings: ['No snapshot is ticked in the matrix, so none was rendered.'] };
  }

  const scales = resultScales(input.solution);
  const pixelScale = input.scale === '2x' ? 2 : 1;
  const taken = new Set<string>();

  for (const { subject, mode, policy } of pairs) {
    const label = snapshotLabel(subject, mode);
    try {
      const elements = buildElements(
        input.network,
        input.solution,
        mode,
        DISPLAY,
        input.scenario_id,
        'Auto',
        scales,
        subject.hidden_component_ids,
        hiddenNodesFor(subject, policy),
        undefined,
        // A part's numbered segments, where Screen 08 saved a study for it, so
        // the PNG carries the same ① ② the report and Screen 08 both show.
        subject.tuned_edges,
      );
      if (elements.length === 0) {
        warnings.push(`${label} has nothing left to draw and was skipped.`);
        continue;
      }

      const image = await renderGraphImage(elements, 'Auto', {
        format: 'png',
        scale: pixelScale,
      });
      const name = unique(snapshotFilename(subject, mode, policy), taken);
      images.push({ name, label, blob: dataUrlToBlob(image.dataUrl) });
    } catch (error) {
      warnings.push(`${label} could not be rendered: ${message(error)}`);
    }
  }

  return { images, warnings };
}

/** Two subjects can slugify the same way; the second gets a suffix, not a clobber. */
function unique(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot < 0 ? name : name.slice(0, dot);
  const extension = dot < 0 ? '' : name.slice(dot);
  let index = 2;
  while (taken.has(`${stem}_${index}${extension}`)) index += 1;
  const next = `${stem}_${index}${extension}`;
  taken.add(next);
  return next;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
