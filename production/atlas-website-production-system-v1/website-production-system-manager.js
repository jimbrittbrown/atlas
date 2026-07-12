const {
  createWebsiteTemplateRegistryEntry,
  createClientBrandingPackage,
  createWebsiteCustomizationJob,
  createWebsiteQaReport,
  createDeliveryPackage,
  validateTemplateRegistryEntry,
  validateClientBrandingPackage,
  validateCustomizationJob,
  validateQaReport,
  validateDeliveryPackage,
  QaStatuses,
  DeliveryStatuses,
  CustomizationStatuses
} = require('./contracts/website-production-system-contracts.js');

class WebsiteProductionSystemManager {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
  }

  registerTemplate(templateInput = {}) {
    const entry = createWebsiteTemplateRegistryEntry({
      ...templateInput,
      updatedAt: new Date(this.now()).toISOString()
    });

    const validation = validateTemplateRegistryEntry(entry);

    return {
      entry,
      validation,
      accepted: validation.isValid
    };
  }

  ingestClientBrandingPackage(brandingInput = {}) {
    const brandingPackage = createClientBrandingPackage(brandingInput);
    const validation = validateClientBrandingPackage(brandingPackage);

    return {
      brandingPackage,
      validation,
      accepted: validation.isValid
    };
  }

  createCustomizationPlan({ customizationInput = {}, brandingPackage = {} } = {}) {
    const job = createWebsiteCustomizationJob({
      ...customizationInput,
      status: CustomizationStatuses.PENDING,
      createdAt: new Date(this.now()).toISOString()
    });

    const validation = validateCustomizationJob(job, brandingPackage);

    return {
      job,
      validation,
      accepted: validation.isValid
    };
  }

  evaluateQa({ qaInput = {} } = {}) {
    const qaReport = createWebsiteQaReport({
      ...qaInput,
      generatedAt: new Date(this.now()).toISOString()
    });

    const validation = validateQaReport(qaReport);

    return {
      qaReport,
      validation,
      accepted: validation.isValid && qaReport.status === QaStatuses.PASS
    };
  }

  buildDeliveryPackage({ deliveryInput = {}, qaReport = {} } = {}) {
    const status = qaReport.status === QaStatuses.PASS
      ? DeliveryStatuses.READY
      : DeliveryStatuses.BLOCKED;

    const deliveryPackage = createDeliveryPackage({
      ...deliveryInput,
      status,
      deliveredAt: status === DeliveryStatuses.READY ? new Date(this.now()).toISOString() : ''
    });

    const validation = validateDeliveryPackage(deliveryPackage);

    return {
      deliveryPackage,
      validation,
      accepted: validation.isValid && status === DeliveryStatuses.READY
    };
  }

  runPipeline({
    templateInput = {},
    brandingInput = {},
    customizationInput = {},
    qaInput = {},
    deliveryInput = {}
  } = {}) {
    const templateResult = this.registerTemplate(templateInput);
    const brandingResult = this.ingestClientBrandingPackage(brandingInput);

    const customizationResult = this.createCustomizationPlan({
      customizationInput,
      brandingPackage: brandingResult.brandingPackage
    });

    const qaResult = this.evaluateQa({ qaInput });
    const deliveryResult = this.buildDeliveryPackage({
      deliveryInput,
      qaReport: qaResult.qaReport
    });

    const blockingIssues = [
      ...templateResult.validation.issues,
      ...brandingResult.validation.issues,
      ...customizationResult.validation.issues,
      ...qaResult.validation.issues,
      ...deliveryResult.validation.issues
    ];

    return {
      accepted: blockingIssues.length === 0,
      templateResult,
      brandingResult,
      customizationResult,
      qaResult,
      deliveryResult,
      blockingIssues
    };
  }
}

module.exports = {
  WebsiteProductionSystemManager
};
