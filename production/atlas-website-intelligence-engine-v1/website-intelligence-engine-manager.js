const {
  createCompanyResearchModule,
  scoreCompanyResearchModule,
  createBrandAssetPackage,
  createAssetValidationReport,
  createExecutiveSummary
} = require('./contracts/website-intelligence-contracts.js');

class WebsiteIntelligenceEngineManager {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
  }

  runResearchPipeline({ clientId = '', sourceData = {} } = {}) {
    const researchModule = createCompanyResearchModule(sourceData);
    const confidence = scoreCompanyResearchModule(researchModule);
    const brandAssetPackage = createBrandAssetPackage({ researchModule, clientId });
    const assetValidation = createAssetValidationReport({ researchModule, confidence });
    const executiveSummary = createExecutiveSummary({
      researchModule,
      confidence,
      validation: assetValidation
    });

    return {
      generatedAt: new Date(this.now()).toISOString(),
      clientId,
      companyResearchModule: researchModule,
      confidenceEngine: confidence,
      brandAssetPackage,
      assetValidation,
      executiveSummary
    };
  }
}

module.exports = {
  WebsiteIntelligenceEngineManager
};
