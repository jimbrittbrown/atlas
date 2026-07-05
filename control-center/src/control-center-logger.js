export class ControlCenterLogger {
  constructor() {
    this.entries = [];
  }

  log(entry) {
    const event = {
      ...entry,
      timestamp: entry?.timestamp ?? new Date().toISOString(),
    };
    this.entries.push(event);
    return event;
  }

  getEntries() {
    return [...this.entries];
  }
}
