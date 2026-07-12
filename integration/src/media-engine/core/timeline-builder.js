export class TimelineBuilder {
  build({ metadata = {}, timeline = {} } = {}) {
    const explicitScenes = Array.isArray(timeline.scenes) ? timeline.scenes : null;

    if (explicitScenes && explicitScenes.length > 0) {
      return this.normalizeExplicitScenes(explicitScenes, metadata);
    }

    return this.buildAutoScenes(metadata);
  }

  normalizeExplicitScenes(scenes, metadata) {
    return [...scenes]
      .map((scene, index) => ({
        sceneId: this.normalizeSceneId(scene.sceneId, index + 1),
        order: this.normalizeOrder(scene.order, index),
        imageAsset: scene.imageAsset ?? this.resolveImageFromMetadata(index, metadata),
        weight: this.normalizeWeight(scene.weight),
        durationSeconds: this.normalizeDuration(scene.durationSeconds),
        source: 'explicit'
      }))
      .sort((a, b) => a.order - b.order)
      .map((scene, index) => ({
        ...scene,
        order: index + 1
      }));
  }

  buildAutoScenes(metadata) {
    const imageOutputs = Array.isArray(metadata.imageOutputs) ? metadata.imageOutputs : [];

    return imageOutputs.map((imageAsset, index) => ({
      sceneId: this.normalizeSceneId(null, index + 1),
      order: index + 1,
      imageAsset,
      weight: 1,
      durationSeconds: null,
      source: 'auto'
    }));
  }

  resolveImageFromMetadata(index, metadata) {
    const imageOutputs = Array.isArray(metadata.imageOutputs) ? metadata.imageOutputs : [];
    return imageOutputs[index] ?? null;
  }

  normalizeSceneId(sceneId, fallbackOrder) {
    const normalized = String(sceneId ?? '').trim();

    if (normalized.length > 0) {
      return normalized;
    }

    return `SCENE-${String(fallbackOrder).padStart(3, '0')}`;
  }

  normalizeOrder(order, index) {
    return Number.isInteger(order) && order > 0 ? order : index + 1;
  }

  normalizeWeight(weight) {
    const normalized = Number(weight);

    if (Number.isNaN(normalized) || normalized <= 0) {
      return 1;
    }

    return normalized;
  }

  normalizeDuration(durationSeconds) {
    if (durationSeconds === null || durationSeconds === undefined) {
      return null;
    }

    const normalized = Number(durationSeconds);

    if (Number.isNaN(normalized) || normalized <= 0) {
      return null;
    }

    return normalized;
  }
}