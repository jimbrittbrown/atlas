export class BusinessFactoryLogger {
  constructor() {
    this.events = [];
  }

  log(event) {
    const entry = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.events.push(entry);
    return entry;
  }

  getEvents() {
    return [...this.events];
  }
}
