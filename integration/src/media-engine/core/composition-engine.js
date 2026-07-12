import { createCompositionPlan, validateCompositionPlan } from '../contracts/composition-plan-contracts.js';
import { createDefaultCompositionPolicy } from '../contracts/composition-policy-contracts.js';

export class CompositionEngine {
  compose({ request = {}, timelineScenes = [], narrationDurationSeconds = null, compositionPolicy = null } = {}) {
    const resolvedPolicy = compositionPolicy ?? createDefaultCompositionPolicy();
    const renderInstructions = Array.isArray(timelineScenes)
      ? timelineScenes.map((scene, index) => this.createInstruction(scene, index, timelineScenes, resolvedPolicy))
      : [];
    const totalDurationSeconds = renderInstructions
      .reduce((total, instruction) => total + Number(instruction.durationSeconds ?? 0), 0);

    const compositionPlan = createCompositionPlan({
      planId: this.buildPlanId(request),
      requestId: request.requestId ?? this.buildFallbackRequestId(request),
      profileId: request.profileId ?? 'legacy_google_video_assembly',
      totalDurationSeconds: Math.round(totalDurationSeconds * 1000) / 1000,
      narrationDurationSeconds,
      renderInstructions,
      policy: resolvedPolicy
    });
    const validation = validateCompositionPlan(compositionPlan);

    return {
      compositionPlan,
      validation,
      diagnostics: {
        transitionCount: this.countEnabledTransitions(renderInstructions)
      }
    };
  }

  createInstruction(scene = {}, index = 0, timelineScenes = [], compositionPolicy = createDefaultCompositionPolicy()) {
    const order = index + 1;
    const hasFollowingScene = order < timelineScenes.length;
    const motionPresetId = compositionPolicy.motion?.defaultPresetId ?? 'MOTION_NONE';
    const sceneDurationSeconds = this.normalizeDuration(scene.durationSeconds);
    const nextScene = hasFollowingScene ? timelineScenes[index + 1] : null;
    const nextSceneDurationSeconds = this.normalizeDuration(nextScene?.durationSeconds);
    const requestedTransitionDurationSeconds = Number(compositionPolicy.transitions?.defaultDurationSeconds);
    const safeTransitionDurationSeconds = this.computeSafeTransitionDuration({
      requestedTransitionDurationSeconds,
      currentSceneDurationSeconds: sceneDurationSeconds,
      nextSceneDurationSeconds
    });
    const transitionsEnabled = compositionPolicy.transitions?.mode === 'enabled'
      && hasFollowingScene
      && safeTransitionDurationSeconds > 0;
    const transitionPresetId = transitionsEnabled
      ? (compositionPolicy.transitions?.defaultPresetId ?? 'TRANSITION_CROSSFADE')
      : 'TRANSITION_NONE';
    const transitionDurationSeconds = transitionsEnabled ? safeTransitionDurationSeconds : 0;
    const transitionType = transitionsEnabled
      ? String(compositionPolicy.transitions?.ffmpegTransition ?? 'fade')
      : 'none';

    return {
      instructionId: `RI-${String(order).padStart(3, '0')}`,
      sceneId: String(scene.sceneId ?? `SCENE-${String(order).padStart(3, '0')}`),
      order,
      imageAsset: scene.imageAsset ?? null,
      durationSeconds: sceneDurationSeconds,
      motionPreset: {
        presetId: motionPresetId,
        policy: 'STATIC',
        parameters: {}
      },
      transitionPreset: {
        presetId: transitionPresetId,
        policy: transitionsEnabled ? 'XFADE' : 'CUT',
        durationSeconds: Number.isNaN(transitionDurationSeconds) ? 0 : transitionDurationSeconds,
        parameters: {
          ffmpegTransition: transitionType
        }
      },
      overlays: []
    };
  }

  normalizeDuration(durationSeconds) {
    const parsed = Number(durationSeconds);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return 2;
    }

    return Math.round(parsed * 1000) / 1000;
  }

  computeSafeTransitionDuration({ requestedTransitionDurationSeconds, currentSceneDurationSeconds, nextSceneDurationSeconds }) {
    const requested = Number(requestedTransitionDurationSeconds);

    if (Number.isNaN(requested) || requested <= 0) {
      return 0;
    }

    const currentLimit = Math.max((Number(currentSceneDurationSeconds) || 0) - 0.05, 0);
    const nextLimit = Math.max((Number(nextSceneDurationSeconds) || 0) - 0.05, 0);
    const maxSafe = Math.min(currentLimit, nextLimit);

    if (maxSafe <= 0) {
      return 0;
    }

    return Math.round(Math.min(requested, maxSafe) * 1000) / 1000;
  }

  countEnabledTransitions(renderInstructions = []) {
    if (!Array.isArray(renderInstructions)) {
      return 0;
    }

    return renderInstructions.filter(instruction => (
      instruction.transitionPreset?.presetId !== 'TRANSITION_NONE'
      && Number(instruction.transitionPreset?.durationSeconds ?? 0) > 0
    )).length;
  }

  buildPlanId(request = {}) {
    const requestId = request.requestId ?? this.buildFallbackRequestId(request);
    return `COMPOSITION-${String(requestId).toUpperCase()}`;
  }

  buildFallbackRequestId(request = {}) {
    return `MEDIA-RENDER-${String(request.missionId ?? 'MISSION')}-${String(request.businessId ?? 'BUSINESS')}`;
  }
}
