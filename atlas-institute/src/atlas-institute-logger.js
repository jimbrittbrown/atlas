export class AtlasInstituteLogger {
  constructor() {
    this.events = [];
  }

  log(event) {
    const logged = { ...event, timestamp: event.timestamp ?? new Date().toISOString() };
    this.events.push(logged);
    return logged;
  }

  getEvents() {
    return [...this.events];
  }
}
