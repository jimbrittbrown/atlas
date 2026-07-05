import { ResearchFinding, ResearchResult, ResearchStatus } from './models.js';
import { EvidenceCollector } from './evidence-collector.js';
import { EvidenceRepository } from './evidence-repository.js';
import { ResearchJobManager } from './research-job-manager.js';
import { ResearchLogger } from './research-logger.js';
import { ResearchReportGenerator } from './research-report-generator.js';
import { ResearchRequestManager } from './research-request-manager.js';
import { ResearchStateMachine } from './research-state-machine.js';

export class ResearchService {
  constructor({
    requestManager = new ResearchRequestManager(),
    jobManager = new ResearchJobManager(new ResearchStateMachine()),
    evidenceCollector = new EvidenceCollector(),
    evidenceRepository = new EvidenceRepository(),
    reportGenerator = new ResearchReportGenerator(),
    logger = new ResearchLogger(),
  } = {}) {
    this.requestManager = requestManager;
    this.jobManager = jobManager;
    this.evidenceCollector = evidenceCollector;
    this.evidenceRepository = evidenceRepository;
    this.reportGenerator = reportGenerator;
    this.logger = logger;
  }

  async createResearchJob(requestId, objective, context = {}) {
    const request = this.requestManager.createRequest(requestId, objective, context);
    const job = this.jobManager.createJob(request);
    this.logger.log({ jobId: job.id, message: 'Research job created', status: job.status.value });
    return job;
  }

  async executeResearch(jobId, request) {
    const job = this.jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Unknown research job: ${jobId}`);
    }

    this.jobManager.transition(job.id, ResearchStatus.QUEUED);
    this.jobManager.transition(job.id, ResearchStatus.RUNNING);
    this.jobManager.transition(job.id, ResearchStatus.COLLECTING_EVIDENCE);

    const evidence = await this.evidenceCollector.collect(job, request);
    this.evidenceRepository.addEvidence(job.id, evidence);
    job.evidence.push(...evidence);

    const findings = [new ResearchFinding('Initial evidence gathered', 'Evidence collection completed successfully', 0.7)];
    job.findings.push(...findings);

    this.jobManager.transition(job.id, ResearchStatus.ANALYZING);
    this.jobManager.transition(job.id, ResearchStatus.GENERATING_REPORT);
    const report = this.reportGenerator.generate(job, evidence, findings);

    this.jobManager.transition(job.id, ResearchStatus.COMPLETED);
    this.logger.log({ jobId: job.id, message: 'Research report generated', status: job.status.value });

    return new ResearchResult(job.id, job.status, evidence, findings, report);
  }
}
