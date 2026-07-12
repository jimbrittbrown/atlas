const test = require('node:test');
const assert = require('node:assert/strict');

const { WebsiteIntelligenceEngineManager } = require('../website-intelligence-engine-manager.js');

test('research pipeline generates production-compatible branding package', () => {
  const manager = new WebsiteIntelligenceEngineManager({
    now: () => new Date('2026-07-11T10:00:00.000Z').getTime()
  });

  const result = manager.runResearchPipeline({
    clientId: 'client_001',
    sourceData: {
      websiteUrl: 'https://example.com',
      companyName: 'Example Roofing',
      logo: { assetPath: 'assets/logos/example.png' },
      primaryColors: ['#000000', '#ffffff'],
      contactInformation: {
        phone: '+1-555-0100',
        email: 'hello@example.com',
        address: '100 Main St'
      },
      serviceList: ['Roof Repair', 'Roof Replacement', 'Inspection'],
      serviceAreas: ['Austin, TX', 'Round Rock, TX'],
      existingMessaging: 'We protect homes with fast, reliable roofing service.',
      certifications: ['Licensed and Insured'],
      financingOptions: ['Monthly payments available'],
      existingReviews: [
        { source: 'Google', reviewer: 'A', rating: 5, quote: 'Great work.' },
        { source: 'Yelp', reviewer: 'B', rating: 5, quote: 'Excellent team.' }
      ],
      socialLinks: {
        facebook: 'https://facebook.com/example'
      },
      images: [
        { assetPath: 'assets/photos/1.jpg' },
        { assetPath: 'assets/photos/2.jpg' },
        { assetPath: 'assets/photos/3.jpg' }
      ]
    }
  });

  assert.equal(result.clientId, 'client_001');
  assert.equal(result.brandAssetPackage.clientId, 'CLIENT_001');
  assert.equal(result.brandAssetPackage.logoAsset.overwriteApproved, false);
  assert.ok(Array.isArray(result.confidenceEngine.scores));
  assert.equal(typeof result.executiveSummary.customizationReadinessScore, 'number');
});

test('validation detects missing critical assets and uncertain fields', () => {
  const manager = new WebsiteIntelligenceEngineManager();

  const result = manager.runResearchPipeline({
    clientId: 'client_002',
    sourceData: {
      companyName: 'Sparse Profile LLC',
      primaryColors: [],
      serviceList: ['Roofing']
    }
  });

  assert.equal(result.assetValidation.missingAssets.includes('logo'), true);
  assert.equal(result.assetValidation.missingAssets.includes('contactInformation'), true);
  assert.equal(result.assetValidation.blocked, true);
  assert.equal(result.confidenceEngine.uncertainFields.length > 0, true);
  assert.equal(result.executiveSummary.readinessClassification === 'NOT_READY' || result.executiveSummary.readinessClassification === 'CONDITIONAL', true);
});
