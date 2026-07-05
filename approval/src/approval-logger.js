export class ApprovalLogger {
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
