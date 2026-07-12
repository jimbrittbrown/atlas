export class ExecutiveOperationsLoopApi {
  constructor({ manager } = {}) {
    this.manager = manager;
  }

  buildResponse() {
    return this.manager.getDashboardProjection();
  }
}
