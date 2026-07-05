export class EvidenceRepository {
  constructor() {
    this.records = [];
  }

  addEvidence(jobId, evidence) {
    this.records.push({ jobId, evidence });
  }

  getEvidence(jobId) {
    return this.records.filter((record) => record.jobId === jobId).flatMap((record) => record.evidence);
  }
}
