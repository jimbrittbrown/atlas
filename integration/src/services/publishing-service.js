export class PublishingService {
  validatePublishRequest() {
    throw new Error('PublishingService.validatePublishRequest must be implemented by a provider.');
  }

  preparePublishPackage() {
    throw new Error('PublishingService.preparePublishPackage must be implemented by a provider.');
  }
}

export class PlaceholderPublishingService extends PublishingService {
  validatePublishRequest(metadata = {}) {
    const checks = {
      videoAsset: this.isNonEmptyString(metadata.videoAsset),
      thumbnailAsset: this.isNonEmptyString(metadata.thumbnailAsset),
      title: this.isNonEmptyString(metadata.title),
      description: this.isNonEmptyString(metadata.description),
      targetPlatform: this.isNonEmptyString(metadata.targetPlatform)
    };

    const missingFields = Object.entries(checks)
      .filter(([, present]) => present === false)
      .map(([field]) => field);

    return {
      isValid: missingFields.length === 0,
      missingFields,
      checkedFields: checks
    };
  }

  preparePublishPackage({ assignment, metadata = {} }) {
    return {
      publishId: this.buildPublishId(assignment),
      platform: metadata.targetPlatform,
      publishStatus: 'SCHEDULED',
      publishUrl: this.buildPublishUrl(metadata.targetPlatform, assignment)
    };
  }

  buildPublishId(assignment) {
    return `PUBLISH-${String(assignment.assignmentId).toUpperCase()}`;
  }

  buildPublishUrl(targetPlatform, assignment) {
    return `https://publish.placeholder/${this.slugify(targetPlatform)}/${this.buildPublishId(assignment).toLowerCase()}`;
  }

  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
