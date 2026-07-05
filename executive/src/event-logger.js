export class DefaultEventLogger {
  constructor() {
    this.events = [];
  }

  log(event) {
    this.events.push(event);
  }

  getEvents() {
    return this.events;
  }
}
