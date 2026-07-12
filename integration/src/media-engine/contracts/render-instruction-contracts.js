import { createMotionPreset } from './motion-preset-contracts.js';
import { createTransitionPreset } from './transition-preset-contracts.js';
import { createOverlayPlacement } from './overlay-placement-contracts.js';

export function createRenderInstruction({
  instructionId,
  sceneId,
  order,
  imageAsset,
  durationSeconds,
  motionPreset = null,
  transitionPreset = null,
  overlays = []
} = {}) {
  return {
    instructionId,
    sceneId,
    order,
    imageAsset,
    durationSeconds,
    motionPreset: createMotionPreset(motionPreset ?? {}),
    transitionPreset: createTransitionPreset(transitionPreset ?? {}),
    overlays: Array.isArray(overlays)
      ? overlays.map(overlay => createOverlayPlacement(overlay ?? {}))
      : []
  };
}
