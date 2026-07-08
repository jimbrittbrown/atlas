export class Playbook {
  constructor({
    playbookId,
    title,
    version,
    objective,
    phases,
    milestones,
    requiredWorkers,
    successCriteria
  }) {
    this.assertNonEmptyString(playbookId, 'playbookId');
    this.assertNonEmptyString(title, 'title');
    this.assertNonEmptyString(version, 'version');
    this.assertNonEmptyString(objective, 'objective');
    this.assertStringArray(phases, 'phases');
    this.assertStringArray(milestones, 'milestones');
    this.assertStringArray(requiredWorkers, 'requiredWorkers');
    this.assertStringArray(successCriteria, 'successCriteria');

    this.playbookId = playbookId;
    this.title = title;
    this.version = version;
    this.objective = objective;
    this.phases = [...phases];
    this.milestones = [...milestones];
    this.requiredWorkers = [...requiredWorkers];
    this.successCriteria = [...successCriteria];
  }

  assertNonEmptyString(value, field) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Playbook requires a non-empty ${field}.`);
    }
  }

  assertStringArray(value, field) {
    if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
      throw new Error(`Playbook requires ${field} as a non-empty string array.`);
    }
  }
}
