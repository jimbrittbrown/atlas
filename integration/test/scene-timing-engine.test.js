import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneTimingEngine } from '../src/media-engine/core/scene-timing-engine.js';

test('scene timing engine applies fixed deterministic fallback when narration timing absent', () => {
  const engine = new SceneTimingEngine({ defaultSceneDurationSeconds: 2 });

  const normalizedScenes = engine.normalizeTimeline({
    scenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', weight: 1 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', weight: 1 }
    ]
  });

  assert.equal(normalizedScenes[0].durationSeconds, 2);
  assert.equal(normalizedScenes[1].durationSeconds, 2);
});

test('scene timing engine distributes narration duration by scene weight', () => {
  const engine = new SceneTimingEngine({ defaultSceneDurationSeconds: 2 });

  const normalizedScenes = engine.normalizeTimeline({
    narrationDurationSeconds: 9,
    scenes: [
      { sceneId: 'SCENE-001', order: 1, imageAsset: 'image-01.png', weight: 1 },
      { sceneId: 'SCENE-002', order: 2, imageAsset: 'image-02.png', weight: 2 }
    ]
  });

  assert.equal(normalizedScenes.length, 2);
  assert.equal(normalizedScenes[0].durationSeconds, 3);
  assert.equal(normalizedScenes[1].durationSeconds, 6);
});

test('scene timing engine normalizes missing ids and orders deterministically', () => {
  const engine = new SceneTimingEngine();

  const normalizedScenes = engine.normalizeTimeline({
    scenes: [
      { imageAsset: 'image-01.png', weight: 1 },
      { imageAsset: 'image-02.png', weight: 1 }
    ]
  });

  assert.equal(normalizedScenes[0].sceneId, 'SCENE-001');
  assert.equal(normalizedScenes[1].sceneId, 'SCENE-002');
  assert.equal(normalizedScenes[0].order, 1);
  assert.equal(normalizedScenes[1].order, 2);
});