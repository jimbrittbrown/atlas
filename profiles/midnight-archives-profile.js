const MIDNIGHT_ARCHIVES_PROFILE = Object.freeze({
  businessId: 'MIDNIGHT_ARCHIVES',
  displayName: 'Midnight Archives',
  description: 'Cinematic horror short-form storytelling business profile.',
  businessFamily: 'Entertainment',
  status: 'ACTIVE',
  missionTypes: ['PRODUCTION'],
  brandingProfile: 'MIDNIGHT_ARCHIVES_BRAND',
  creativeProfile: {
    genre: 'Cinematic Horror',
    targetLengthSeconds: {
      min: 30,
      max: 60
    },
    narrationStyle: 'Story driven',
    visualStyle: 'Dark cinematic',
    defaultProductionProfile: 'cinematic_horror_landscape_v1'
  },
  productionProfile: 'cinematic_horror_landscape_v1',
  qualityProfile: 'QUALITY_CINEMATIC',
  executiveCouncilProfile: 'EXEC_COUNCIL_MEDIA',
  publishingProfile: {
    platform: 'YouTube',
    visibility: 'NONE',
    scheduling: 'disabled',
    requiresCEOApproval: true
  },
  knowledgePartition: 'knowledge/midnight-archives/',
  metricsNamespace: 'midnight_archives',
  metrics: {
    reservedMetrics: [
      'views',
      'CTR',
      'watch time',
      'retention',
      'subscribers',
      'upload latency',
      'quality score'
    ]
  },
  assetRoot: 'assets/midnight-archives/',
  assetLayout: {
    scripts: 'assets/midnight-archives/scripts/',
    voice: 'assets/midnight-archives/voice/',
    images: 'assets/midnight-archives/images/',
    video: 'assets/midnight-archives/video/',
    thumbnails: 'assets/midnight-archives/thumbnails/',
    reports: 'assets/midnight-archives/reports/',
    releaseCandidates: 'assets/midnight-archives/release-candidates/'
  },
  credentialProfile: 'CREDENTIALS_MIDNIGHT_ARCHIVES',
  defaultPolicies: {
    publishingMode: 'NONE'
  },
  featureFlags: {
    transitions: true
  }
});

module.exports = {
  MIDNIGHT_ARCHIVES_PROFILE
};
