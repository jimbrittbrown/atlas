import {
  EmploymentStatus,
  WorkforceCapability,
  WorkforceCategories
} from './workforce-models.js';

export class WorkforceValidator {
  validateSpecialistPayload(payload = {}) {
    const issues = [];

    this.requireNonEmpty(issues, payload.specialistId, 'specialistId');
    this.requireNonEmpty(issues, payload.category, 'category');
    this.requireNonEmpty(issues, payload.company, 'company');
    this.requireNonEmpty(issues, payload.model, 'model');

    if (!WorkforceCategories.includes(payload.category)) {
      issues.push(`Unknown category: ${payload.category}`);
    }

    if (!Object.values(WorkforceCapability).includes(payload.apiAvailability)) {
      issues.push(`Unknown apiAvailability: ${payload.apiAvailability}`);
    }

    if (!Object.values(EmploymentStatus).includes(payload.currentEmploymentStatus)) {
      issues.push(`Unknown employment status: ${payload.currentEmploymentStatus}`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  requireNonEmpty(issues, value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push(`Missing required field: ${field}`);
    }
  }
}
