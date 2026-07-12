import { createMediaRenderRequest } from '../contracts/media-render-contracts.js';

export class LegacyVideoAssemblyCompatibilityAdapter {
  toMediaRenderRequest(metadata = {}) {
    return createMediaRenderRequest({
      missionId: metadata.missionId,
      businessId: metadata.businessId,
      profileId: 'legacy_google_video_assembly',
      operation: 'render_video',
      metadata,
      timeline: metadata.timeline ?? null
    });
  }

  toLegacyVideoResult(engineExecution = {}) {
    const renderResult = engineExecution.renderResult ?? engineExecution ?? {};
    const status = renderResult.status ?? engineExecution.status ?? 'COMPLETED';

    return {
      videoFile: renderResult.videoFile ?? renderResult.videoFilePath ?? null,
      duration: renderResult.duration ?? '0 seconds',
      validation: renderResult.validation,
      status,
      diagnostics: renderResult.diagnostics ?? engineExecution.diagnostics ?? null,
      timelineDiagnostics: renderResult.timelineDiagnostics ?? null
    };
  }
}