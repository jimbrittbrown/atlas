export const ATLAS_ENGINE_STANDARD_VERSION = '1.0.0';

export function createMediaRenderRequest({
  requestId,
  missionId,
  businessId,
  profileId = 'legacy_google_video_assembly',
  operation = 'render_video',
  metadata = {},
  timeline = null,
  context = {}
} = {}) {
  const resolvedTimeline = resolveTimeline({ timeline, metadata });

  return {
    requestId: requestId ?? buildRequestId(missionId, businessId),
    missionId: missionId ?? metadata.missionId ?? 'MISSION_ID_PLACEHOLDER',
    businessId: businessId ?? metadata.businessId ?? 'BUSINESS_ID_PLACEHOLDER',
    profileId,
    operation,
    metadata: {
      script: metadata.script ?? 'Script unavailable',
      voiceOutput: metadata.voiceOutput ?? null,
      imageOutputs: Array.isArray(metadata.imageOutputs) ? [...metadata.imageOutputs] : [],
      subtitles: metadata.subtitles ?? null,
      productionProfileId: metadata.productionProfileId ?? null,
      featureFlags: (metadata.featureFlags && typeof metadata.featureFlags === 'object')
        ? { ...metadata.featureFlags }
        : {},
      compositionPolicy: (metadata.compositionPolicy && typeof metadata.compositionPolicy === 'object')
        ? { ...metadata.compositionPolicy }
        : {},
      targetFormat: metadata.targetFormat ?? 'mp4',
      targetResolution: metadata.targetResolution ?? '1920x1080',
      timeline: resolvedTimeline,
      businessId: metadata.businessId ?? businessId ?? 'BUSINESS_ID_PLACEHOLDER',
      missionId: metadata.missionId ?? missionId ?? 'MISSION_ID_PLACEHOLDER'
    },
    context: {
      ...context
    }
  };
}

export function createMediaRenderResult({
  requestId,
  missionId,
  businessId,
  status = 'COMPLETED',
  videoFile = null,
  duration = '0 seconds',
  validation = null,
  timelineDiagnostics = null,
  diagnostics = null,
  error = null
} = {}) {
  return {
    requestId,
    missionId,
    businessId,
    status,
    videoFile,
    duration,
    validation,
    timelineDiagnostics,
    diagnostics,
    error
  };
}

function buildRequestId(missionId, businessId) {
  const missionToken = String(missionId ?? 'MISSION').toUpperCase().replace(/[^A-Z0-9]+/g, '-');
  const businessToken = String(businessId ?? 'BUSINESS').toUpperCase().replace(/[^A-Z0-9]+/g, '-');

  return `MEDIA-RENDER-${missionToken}-${businessToken}`;
}

function resolveTimeline({ timeline, metadata }) {
  const inputTimeline = (timeline && typeof timeline === 'object')
    ? timeline
    : ((metadata.timeline && typeof metadata.timeline === 'object') ? metadata.timeline : {});

  return {
    scenes: Array.isArray(inputTimeline.scenes) ? [...inputTimeline.scenes] : [],
    narrationDurationSeconds: inputTimeline.narrationDurationSeconds ?? metadata.narrationDurationSeconds ?? null
  };
}