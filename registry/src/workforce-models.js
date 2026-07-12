export const EmploymentStatus = Object.freeze({
  CANDIDATE: 'Candidate',
  CONNECTED: 'Connected',
  BENCHMARKING: 'Benchmarking',
  ACTIVE: 'Active',
  CHAMPION: 'Champion',
  RUNNER_UP: 'Runner-up',
  RETIRED: 'Retired',
  DEPRECATED: 'Deprecated'
});

export const WorkforceCategories = Object.freeze([
  'Research',
  'Long-form Writing',
  'Editing',
  'Fact Verification',
  'Narration',
  'Image Generation',
  'Video Generation',
  'Music',
  'Translation',
  'Coding',
  'Data Analysis',
  'Marketing Copy',
  'SEO',
  'Publishing',
  'Analytics'
]);

export const WorkforceCapability = Object.freeze({
  API_AVAILABLE: 'API_AVAILABLE',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  UNKNOWN: 'UNKNOWN'
});

export class SpecialistRecord {
  constructor({
    specialistId,
    category,
    company,
    model,
    apiAvailability = WorkforceCapability.UNKNOWN,
    connectionStatus = 'DISCONNECTED',
    benchmarkStatus = 'NOT_BENCHMARKED',
    currentBenchmarkScore = null,
    currentRank = null,
    cost = null,
    speed = null,
    reliability = null,
    strengths = [],
    weaknesses = [],
    bestUseCases = [],
    lastBenchmarkDate = null,
    benchmarkHistory = [],
    currentEmploymentStatus = EmploymentStatus.CANDIDATE,
    metadata = {},
    createdAt = new Date().toISOString(),
    updatedAt = createdAt
  }) {
    this.specialistId = specialistId;
    this.category = category;
    this.company = company;
    this.model = model;
    this.apiAvailability = apiAvailability;
    this.connectionStatus = connectionStatus;
    this.benchmarkStatus = benchmarkStatus;
    this.currentBenchmarkScore = currentBenchmarkScore;
    this.currentRank = currentRank;
    this.cost = cost;
    this.speed = speed;
    this.reliability = reliability;
    this.strengths = strengths;
    this.weaknesses = weaknesses;
    this.bestUseCases = bestUseCases;
    this.lastBenchmarkDate = lastBenchmarkDate;
    this.benchmarkHistory = benchmarkHistory;
    this.currentEmploymentStatus = currentEmploymentStatus;
    this.metadata = metadata;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class WorkforceCategoryStanding {
  constructor({
    category,
    currentChampion = null,
    runnerUp = null,
    otherCandidates = [],
    lastUpdatedAt = new Date().toISOString()
  }) {
    this.category = category;
    this.currentChampion = currentChampion;
    this.runnerUp = runnerUp;
    this.otherCandidates = otherCandidates;
    this.lastUpdatedAt = lastUpdatedAt;
  }
}

export class WorkforceRegistrySnapshot {
  constructor({
    meta,
    specialists = [],
    categoryStandings = {},
    benchmarkSchedules = {},
    eventHistory = []
  }) {
    this.meta = meta;
    this.specialists = specialists;
    this.categoryStandings = categoryStandings;
    this.benchmarkSchedules = benchmarkSchedules;
    this.eventHistory = eventHistory;
  }
}
