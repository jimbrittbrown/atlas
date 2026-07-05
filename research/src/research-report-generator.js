import { ResearchReport } from './models.js';

export class ResearchReportGenerator {
  generate(job, evidence, findings) {
    return new ResearchReport(
      job.id,
      `Research completed for ${job.request.objective}`,
      job.request.objective,
      evidence,
      findings,
      evidence.map((item) => item.source),
      ['No critical risks identified'],
      ['Further validation may be required'],
      0.75,
      ['Review the evidence and prepare next actions'],
    );
  }
}
