import { createRenderInstruction } from './render-instruction-contracts.js';
import { createCompositionPolicy, createDefaultCompositionPolicy, validateCompositionPolicy } from './composition-policy-contracts.js';

export function createCompositionPlan({
  planId,
  requestId,
  profileId = 'legacy_google_video_assembly',
  totalDurationSeconds = 0,
  narrationDurationSeconds = null,
  renderInstructions = [],
  policy = createDefaultCompositionPolicy()
} = {}) {
  return {
    planId,
    requestId,
    profileId,
    totalDurationSeconds,
    narrationDurationSeconds,
    renderInstructions: Array.isArray(renderInstructions)
      ? renderInstructions.map(instruction => createRenderInstruction(instruction ?? {}))
      : [],
    policy: createCompositionPolicy(policy ?? {})
  };
}

export function validateCompositionPlan(plan = {}) {
  const issues = [];
  const instructions = Array.isArray(plan.renderInstructions) ? plan.renderInstructions : [];

  if (typeof plan.planId !== 'string' || plan.planId.trim().length === 0) {
    issues.push({ field: 'planId', issue: 'MISSING_PLAN_ID' });
  }

  if (typeof plan.requestId !== 'string' || plan.requestId.trim().length === 0) {
    issues.push({ field: 'requestId', issue: 'MISSING_REQUEST_ID' });
  }

  if (!Array.isArray(plan.renderInstructions) || instructions.length === 0) {
    issues.push({ field: 'renderInstructions', issue: 'MISSING_RENDER_INSTRUCTIONS' });
  }

  const policyValidation = validateCompositionPolicy(plan.policy ?? {});
  if (!policyValidation.isValid) {
    issues.push(...policyValidation.issues.map(issue => ({
      field: `policy.${issue.field}`,
      issue: issue.issue
    })));
  }

  instructions.forEach((instruction, index) => {
    const expectedOrder = index + 1;

    if (!instruction || typeof instruction !== 'object') {
      issues.push({ field: `renderInstructions[${index}]`, issue: 'INVALID_INSTRUCTION' });
      return;
    }

    if (Number(instruction.order) !== expectedOrder) {
      issues.push({ field: `renderInstructions[${index}].order`, issue: 'INVALID_INSTRUCTION_ORDER' });
    }

    if (typeof instruction.imageAsset !== 'string' || instruction.imageAsset.trim().length === 0) {
      issues.push({ field: `renderInstructions[${index}].imageAsset`, issue: 'MISSING_IMAGE_ASSET' });
    }

    const durationSeconds = Number(instruction.durationSeconds);
    if (Number.isNaN(durationSeconds) || durationSeconds <= 0) {
      issues.push({ field: `renderInstructions[${index}].durationSeconds`, issue: 'INVALID_DURATION_SECONDS' });
    }
  });

  return {
    isValid: issues.length === 0,
    issues
  };
}
