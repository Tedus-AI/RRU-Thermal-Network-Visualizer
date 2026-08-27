import type { CanvasTool } from './GraphToolbar';

/**
 * Interaction policy for the merged pointer tool.
 *
 * In the resting Select mode an object drag still moves that object, while a
 * background drag pans the viewport. Cytoscape cannot box-select and pan from
 * the same unmodified background gesture, so the separate Pan mode and
 * box-selection gesture are deliberately replaced by this single,
 * discoverable behaviour.
 */
export function canvasInteractionPolicy(tool: CanvasTool) {
  return {
    userPanning: tool !== 'zoom-box',
    boxSelection: false,
    nodesGrabbable: tool === 'select',
  };
}
