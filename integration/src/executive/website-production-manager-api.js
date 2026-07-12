export class WebsiteProductionManagerApi {
  constructor({ manager } = {}) {
    this.manager = manager;
  }

  buildResponse() {
    return this.manager.getDashboardProjection();
  }
}
