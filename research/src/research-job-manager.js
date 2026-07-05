import { ResearchJob, ResearchStatus } from './models.js';

export class ResearchJobManager {
  constructor(stateMachine) {
    this.stateMachine = stateMachine;
    this.jobs = new Map();
  }

  createJob(request) {
    const job = new ResearchJob(`job-${request.id}`, request, ResearchStatus.NEW);
    this.jobs.set(job.id, job);
    return job;
  }

  transition(jobId, nextStatus) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }

    job.status = this.stateMachine.transitionState(job.status, nextStatus);
    job.updatedAt = new Date().toISOString();
    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }
}
