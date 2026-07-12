export class SceneTimingEngine {
  constructor({ defaultSceneDurationSeconds = 2, minSceneDurationSeconds = 1, maxSceneDurationSeconds = 300 } = {}) {
    this.defaultSceneDurationSeconds = this.normalizeSeconds(defaultSceneDurationSeconds, 2);
    this.minSceneDurationSeconds = this.normalizeSeconds(minSceneDurationSeconds, 1);
    this.maxSceneDurationSeconds = this.normalizeSeconds(maxSceneDurationSeconds, 30);
  }

  normalizeTimeline({ scenes = [], narrationDurationSeconds = null } = {}) {
    const normalizedScenes = Array.isArray(scenes)
      ? scenes.map((scene, index) => this.normalizeScene(scene, index))
      : [];

    if (normalizedScenes.length === 0) {
      return [];
    }

    const narrationDuration = this.normalizeSeconds(narrationDurationSeconds, null);

    if (narrationDuration === null) {
      return normalizedScenes.map(scene => ({
        ...scene,
        durationSeconds: this.defaultSceneDurationSeconds
      }));
    }

    const weightedTotal = normalizedScenes.reduce((total, scene) => total + (scene.weight ?? 1), 0);

    if (weightedTotal <= 0) {
      return normalizedScenes.map(scene => ({
        ...scene,
        durationSeconds: this.defaultSceneDurationSeconds
      }));
    }

    const rawDurations = normalizedScenes.map(scene => (
      narrationDuration * (scene.weight ?? 1) / weightedTotal
    ));
    const clampedDurations = rawDurations.map(duration => this.clampSeconds(duration));
    const sumClamped = clampedDurations.reduce((total, value) => total + value, 0);

    if (sumClamped <= 0) {
      return normalizedScenes.map(scene => ({
        ...scene,
        durationSeconds: this.defaultSceneDurationSeconds
      }));
    }

    const scale = narrationDuration / sumClamped;

    return normalizedScenes.map((scene, index) => ({
      ...scene,
      durationSeconds: this.clampSeconds(clampedDurations[index] * scale)
    }));
  }

  normalizeScene(scene = {}, index = 0) {
    const order = Number.isInteger(scene.order) ? scene.order : index + 1;

    return {
      sceneId: this.normalizeSceneId(scene.sceneId, order),
      order,
      imageAsset: scene.imageAsset ?? null,
      weight: this.normalizeWeight(scene.weight),
      durationSeconds: this.normalizeSeconds(scene.durationSeconds, null)
    };
  }

  normalizeSceneId(sceneId, order) {
    const normalized = String(sceneId ?? '').trim();

    if (normalized.length > 0) {
      return normalized;
    }

    return `SCENE-${String(order).padStart(3, '0')}`;
  }

  normalizeWeight(weight) {
    const value = Number(weight);

    if (Number.isNaN(value) || value <= 0) {
      return 1;
    }

    return value;
  }

  clampSeconds(value) {
    const rounded = Math.round(Number(value) * 1000) / 1000;

    if (Number.isNaN(rounded)) {
      return this.defaultSceneDurationSeconds;
    }

    return Math.max(this.minSceneDurationSeconds, Math.min(this.maxSceneDurationSeconds, rounded));
  }

  normalizeSeconds(value, fallback) {
    if (value === null || value === undefined) {
      return fallback;
    }

    const seconds = Number(value);

    if (Number.isNaN(seconds) || seconds <= 0) {
      return fallback;
    }

    return seconds;
  }
}