import test from 'node:test';
import assert from 'node:assert/strict';
import { TimelineBuilder } from '../src/media-engine/core/timeline-builder.js';

test('timeline builder auto-generates scenes from image outputs', () => {
  const builder = new TimelineBuilder();

  const scenes = builder.build({
    metadata: {
      imageOutputs: ['image-01.png', 'image-02.png']
    }
  });

  assert.deepEqual(scenes, [
    {
      sceneId: 'SCENE-001',
      order: 1,
      imageAsset: 'image-01.png',
      weight: 1,
      durationSeconds: null,
      source: 'auto'
    },
    {
      sceneId: 'SCENE-002',
      order: 2,
      imageAsset: 'image-02.png',
      weight: 1,
      durationSeconds: null,
      source: 'auto'
    }
  ]);
});

test('timeline builder respects explicit scenes and deterministic order', () => {
  const builder = new TimelineBuilder();

  const scenes = builder.build({
    metadata: {
      imageOutputs: ['fallback-01.png', 'fallback-02.png']
    },
    timeline: {
      scenes: [
        { sceneId: 'SCENE-B', order: 2, imageAsset: 'explicit-02.png', weight: 1.5 },
        { sceneId: 'SCENE-A', order: 1, imageAsset: 'explicit-01.png', weight: 2 }
      ]
    }
  });

  assert.deepEqual(scenes, [
    {
      sceneId: 'SCENE-A',
      order: 1,
      imageAsset: 'explicit-01.png',
      weight: 2,
      durationSeconds: null,
      source: 'explicit'
    },
    {
      sceneId: 'SCENE-B',
      order: 2,
      imageAsset: 'explicit-02.png',
      weight: 1.5,
      durationSeconds: null,
      source: 'explicit'
    }
  ]);
});

test('timeline builder uses metadata fallback image for explicit scene without imageAsset', () => {
  const builder = new TimelineBuilder();

  const scenes = builder.build({
    metadata: {
      imageOutputs: ['fallback-01.png']
    },
    timeline: {
      scenes: [
        { sceneId: 'SCENE-ONLY', order: 1 }
      ]
    }
  });

  assert.equal(scenes[0].imageAsset, 'fallback-01.png');
});