export class WorkerOrchestrationLogger {
  constructor() {
    this.entries = [];
  }

  log(entry) {
    this.entries.push(entry);
  }

  getEntries() {
    return [...this.entries];
  }
}
