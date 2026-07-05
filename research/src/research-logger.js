export class ResearchLogger {
  constructor() {
    this.entries = [];
  }

  log(event) {
    this.entries.push(event);
  }

  getEntries() {
    return this.entries;
  }
}
