export function createDefaultCompositionPolicy() {
  return {
    motion: {
      mode: 'disabled',
      defaultPresetId: 'MOTION_NONE'
    },
    transitions: {
      mode: 'disabled',
      defaultPresetId: 'TRANSITION_NONE',
      defaultDurationSeconds: 0
    },
    overlays: {
      mode: 'disabled'
    },
    titles: {
      mode: 'disabled'
    },
    subtitles: {
      mode: 'legacy',
      layout: 'legacy'
    },
    music: {
      mode: 'disabled'
    },
    framing: {
      mode: 'legacy-center-frame'
    },
    cropping: {
      mode: 'legacy-fit'
    },
    safeZones: {
      mode: 'legacy-16-9'
    }
  };
}

export function createCompositionPolicy(inputPolicy = {}) {
  const defaults = createDefaultCompositionPolicy();

  return {
    motion: {
      ...defaults.motion,
      ...(inputPolicy.motion ?? {})
    },
    transitions: {
      ...defaults.transitions,
      ...(inputPolicy.transitions ?? {})
    },
    overlays: {
      ...defaults.overlays,
      ...(inputPolicy.overlays ?? {})
    },
    titles: {
      ...defaults.titles,
      ...(inputPolicy.titles ?? {})
    },
    subtitles: {
      ...defaults.subtitles,
      ...(inputPolicy.subtitles ?? {})
    },
    music: {
      ...defaults.music,
      ...(inputPolicy.music ?? {})
    },
    framing: {
      ...defaults.framing,
      ...(inputPolicy.framing ?? {})
    },
    cropping: {
      ...defaults.cropping,
      ...(inputPolicy.cropping ?? {})
    },
    safeZones: {
      ...defaults.safeZones,
      ...(inputPolicy.safeZones ?? {})
    }
  };
}

export function validateCompositionPolicy(policy = {}) {
  const issues = [];
  const requiredCategories = ['motion', 'transitions', 'overlays', 'titles', 'subtitles', 'music', 'framing', 'cropping', 'safeZones'];

  requiredCategories.forEach(category => {
    if (!policy[category] || typeof policy[category] !== 'object') {
      issues.push({ field: category, issue: 'MISSING_POLICY_CATEGORY' });
    }
  });

  if (!isNonEmptyString(policy.motion?.mode)) {
    issues.push({ field: 'motion.mode', issue: 'INVALID_POLICY_FIELD' });
  }

  if (!isNonEmptyString(policy.transitions?.mode)) {
    issues.push({ field: 'transitions.mode', issue: 'INVALID_POLICY_FIELD' });
  }

  if (!isNonEmptyString(policy.subtitles?.mode)) {
    issues.push({ field: 'subtitles.mode', issue: 'INVALID_POLICY_FIELD' });
  }

  if (!isNonEmptyString(policy.cropping?.mode)) {
    issues.push({ field: 'cropping.mode', issue: 'INVALID_POLICY_FIELD' });
  }

  if (!isNonEmptyString(policy.framing?.mode)) {
    issues.push({ field: 'framing.mode', issue: 'INVALID_POLICY_FIELD' });
  }

  if (!isNonEmptyString(policy.safeZones?.mode)) {
    issues.push({ field: 'safeZones.mode', issue: 'INVALID_POLICY_FIELD' });
  }

  const transitionDuration = Number(policy.transitions?.defaultDurationSeconds);
  if (Number.isNaN(transitionDuration) || transitionDuration < 0) {
    issues.push({ field: 'transitions.defaultDurationSeconds', issue: 'INVALID_POLICY_FIELD' });
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
