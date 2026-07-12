export function createMotionPreset({
  presetId = 'MOTION_NONE',
  policy = 'STATIC',
  parameters = {}
} = {}) {
  return {
    presetId,
    policy,
    parameters: {
      ...parameters
    }
  };
}
