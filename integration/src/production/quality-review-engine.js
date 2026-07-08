export class QualityReviewEngine {
  review(completedProductionPackage = {}) {
    const issues = this.validatePackage(completedProductionPackage);
    const remediationTasks = this.buildRemediationTasks(issues);
    const passed = issues.length === 0;

    return {
      passed,
      issues,
      remediationTasks,
      executiveRecommendation: this.buildExecutiveRecommendation({ passed, issues, remediationTasks })
    };
  }

  validatePackage(completedProductionPackage = {}) {
    const metadata = completedProductionPackage.metadata ?? {};
    const checks = [
      {
        code: 'MISSING_SCRIPT',
        field: 'script',
        passed: this.isNonEmptyString(completedProductionPackage.script)
      },
      {
        code: 'MISSING_VOICE',
        field: 'voiceOutput',
        passed: this.isNonEmptyString(completedProductionPackage.voiceOutput)
      },
      {
        code: 'MISSING_IMAGES',
        field: 'imageOutputs',
        passed: Array.isArray(completedProductionPackage.imageOutputs) && completedProductionPackage.imageOutputs.length > 0
      },
      {
        code: 'MISSING_VIDEO',
        field: 'videoOutput',
        passed: this.isNonEmptyString(completedProductionPackage.videoOutput)
      },
      {
        code: 'MISSING_METADATA',
        field: 'metadata',
        passed: this.hasMetadata(metadata)
      }
    ];

    return checks
      .filter(check => check.passed === false)
      .map(check => ({
        code: check.code,
        field: check.field,
        message: this.buildIssueMessage(check.field)
      }));
  }

  buildRemediationTasks(issues) {
    return issues.map((issue, index) => ({
      taskId: `REMED-${String(index + 1).padStart(3, '0')}`,
      type: 'QUALITY_REMEDIATION',
      issueCode: issue.code,
      requiredField: issue.field,
      action: this.buildRemediationAction(issue.field),
      priority: 'HIGH'
    }));
  }

  buildExecutiveRecommendation({ passed, issues, remediationTasks }) {
    if (passed) {
      return 'APPROVE_FOR_RELEASE';
    }

    return {
      decision: 'REMEDIATE_AND_REVIEW',
      issueCount: issues.length,
      remediationTaskCount: remediationTasks.length,
      summary: 'Production package failed quality gate. Execute remediation tasks and resubmit.'
    };
  }

  buildIssueMessage(field) {
    return `Quality review requires ${field} to be present.`;
  }

  buildRemediationAction(field) {
    const actionByField = {
      script: 'Regenerate script artifact and attach to package.',
      voiceOutput: 'Regenerate voice asset and attach audio output.',
      imageOutputs: 'Regenerate image assets and attach at least one image output.',
      videoOutput: 'Reassemble video package and attach video output.',
      metadata: 'Rebuild package metadata and include required release context.'
    };

    return actionByField[field] ?? 'Resolve missing quality input and resubmit package.';
  }

  hasMetadata(metadata) {
    return metadata !== null
      && typeof metadata === 'object'
      && Object.keys(metadata).length > 0;
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
