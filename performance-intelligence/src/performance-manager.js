export class PerformanceManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  generate(payload) {
    const assessment = this.recorder.buildAssessment(payload);
    return this.repository.addRecord(assessment);
  }
}
