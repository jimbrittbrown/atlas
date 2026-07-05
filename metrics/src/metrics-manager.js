export class MetricsManager {
  constructor(repository, recorder) {
    this.repository = repository;
    this.recorder = recorder;
  }

  record(payload) {
    const record = this.recorder.buildRecord(payload);
    return this.repository.addRecord(record);
  }
}
