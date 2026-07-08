import { Playbook } from './playbook.js';

export class EnterpriseKnowledgeLibrary {
  constructor() {
    this.playbooks = new Map();

    this.registerPlaybook(this.createYouTubeBusinessPlaybookV1());
  }

  registerPlaybook(playbook) {
    if (!(playbook instanceof Playbook)) {
      throw new Error('EnterpriseKnowledgeLibrary requires a Playbook instance.');
    }

    this.playbooks.set(playbook.playbookId, playbook);

    return playbook;
  }

  getPlaybook(playbookId) {
    return this.playbooks.get(playbookId) ?? null;
  }

  listPlaybooks() {
    return [...this.playbooks.values()]
      .sort((a, b) => a.playbookId.localeCompare(b.playbookId));
  }

  createYouTubeBusinessPlaybookV1() {
    return new Playbook({
      playbookId: 'youtube-business',
      title: 'YouTube Business Playbook v1.0',
      version: '1.0',
      objective: 'Launch and scale a profitable YouTube-first content business with deterministic operating cadence.',
      phases: [
        'Foundation',
        'Production',
        'Growth'
      ],
      milestones: [
        'Audience and niche strategy approved',
        'First production-ready content batch completed',
        'Monetization systems activated'
      ],
      requiredWorkers: [
        'RESEARCH-WORKER-001',
        'YOUTUBE-SCRIPT-WORKER-001',
        'PROGRAM-MANAGER-001'
      ],
      successCriteria: [
        'Weekly publishing cadence is maintained',
        'Content quality meets defined review standards',
        'Channel reaches first monetization threshold'
      ]
    });
  }
}
