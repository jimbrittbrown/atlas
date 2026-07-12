export function createTransitionPreset({
  presetId = 'TRANSITION_NONE',
  policy = 'CUT',
  durationSeconds = 0,
  parameters = {}
} = {}) {
  return {
    presetId,
    policy,
    durationSeconds,
    parameters: {
      ...parameters
    }
  };
}
