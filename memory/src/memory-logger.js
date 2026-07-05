export class MemoryLogger {
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
