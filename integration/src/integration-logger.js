export class IntegrationLogger {
  constructor() {
    this.entries = [];
  }

  log(entry) {
    this.entries.push(entry);
  }
}
