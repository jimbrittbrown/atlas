export class CapabilityStatus {
  static PLANNED = new CapabilityStatus('PLANNED');
  static IN_DEVELOPMENT = new CapabilityStatus('IN_DEVELOPMENT');
  static IMPLEMENTED = new CapabilityStatus('IMPLEMENTED');
  static RELEASED = new CapabilityStatus('RELEASED');
  static DEPRECATED = new CapabilityStatus('DEPRECATED');

  static all() {
    return [
      CapabilityStatus.PLANNED,
      CapabilityStatus.IN_DEVELOPMENT,
      CapabilityStatus.IMPLEMENTED,
      CapabilityStatus.RELEASED,
      CapabilityStatus.DEPRECATED,
    ];
  }

  static fromValue(value) {
    const status = CapabilityStatus.all().find((item) => item.value === value);
    if (!status) {
      throw new Error(`Unknown capability status: ${value}`);
    }
    return status;
  }

  constructor(value) {
    this.value = value;
  }
}

export class CapabilityVersion {
  constructor({ version, releaseTag = '', commitHash = '', releasedAt = null, notes = '' }) {
    this.version = version;
    this.releaseTag = releaseTag;
    this.commitHash = commitHash;
    this.releasedAt = releasedAt;
    this.notes = notes;
  }
}

export class CapabilityDependency {
  constructor({ name, version = '*', type = 'service' }) {
    this.name = name;
    this.version = version;
    this.type = type;
  }
}

export class CapabilityInterface {
  constructor({ name, signature = '', description = '' }) {
    this.name = name;
    this.signature = signature;
    this.description = description;
  }
}

export class CapabilityDocumentation {
  constructor({ architecture = '', api = '', operational = '', changelogReference = '', traceabilityReference = '' }) {
    this.architecture = architecture;
    this.api = api;
    this.operational = operational;
    this.changelogReference = changelogReference;
    this.traceabilityReference = traceabilityReference;
  }
}

export class CapabilityMetadata {
  constructor({
    name,
    version,
    purpose,
    owner,
    dependencies = [],
    publicInterfaces = [],
    releaseTag = '',
    commitHash = '',
    status = CapabilityStatus.PLANNED,
    documentation = new CapabilityDocumentation(),
    changelogReference = '',
    traceabilityReference = '',
    testStatus = 'UNKNOWN',
    releaseHistory = [],
    updatedAt = new Date().toISOString(),
  }) {
    this.name = name;
    this.version = version;
    this.purpose = purpose;
    this.owner = owner;
    this.dependencies = dependencies;
    this.publicInterfaces = publicInterfaces;
    this.releaseTag = releaseTag;
    this.commitHash = commitHash;
    this.status = status;
    this.documentation = documentation;
    this.changelogReference = changelogReference;
    this.traceabilityReference = traceabilityReference;
    this.testStatus = testStatus;
    this.releaseHistory = releaseHistory;
    this.updatedAt = updatedAt;
  }
}

export class CapabilityRecord {
  constructor({ id, metadata, createdAt = new Date().toISOString(), updatedAt = createdAt }) {
    this.id = id;
    this.metadata = metadata;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export class CapabilityQuery {
  constructor({ search = '', owner = null, status = null, dependency = null, tag = null } = {}) {
    this.search = search;
    this.owner = owner;
    this.status = status;
    this.dependency = dependency;
    this.tag = tag;
  }
}

export class CapabilityResult {
  constructor({ records = [], total = 0 }) {
    this.records = records;
    this.total = total;
  }
}

export class RegistryValidationResult {
  constructor({ valid = true, issues = [] }) {
    this.valid = valid;
    this.issues = issues;
  }
}
