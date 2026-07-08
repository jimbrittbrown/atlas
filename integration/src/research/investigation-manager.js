export class InvestigationManager {
  constructor(researchCoordinator) {
    this.researchCoordinator = researchCoordinator;
  }

  async executeInvestigations(investigations) {
    return Promise.all(
      investigations.map(investigation => this.researchCoordinator.performInvestigation(investigation))
    );
  }
}