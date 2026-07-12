import { CustomerIntakeMissionControl } from './customer-intake-mission-control.js';
import { MissionPortfolioManager } from './mission-portfolio-manager.js';
import { ExecutivePlanningDashboardModel } from './executive-planning-dashboard-model.js';

export class ExecutivePlanningSystem {
  constructor({
    missionControl,
    portfolioManager,
    dashboardModel,
    logger,
    now,
    storageProvider
  } = {}) {
    this.logger = logger ?? { log: () => {} };
    this.now = now;

    this.missionControl = missionControl ?? new CustomerIntakeMissionControl({ logger: this.logger, storageProvider });
    this.portfolioManager = portfolioManager ?? new MissionPortfolioManager({
      missionControl: this.missionControl,
      workforceDirector: this.missionControl.workforceDirector,
      storageProvider,
      logger: this.logger,
      now
    });

    this.dashboardModel = dashboardModel ?? new ExecutivePlanningDashboardModel();
  }

  submitProposal(payload) {
    return this.portfolioManager.submitProposal(payload);
  }

  listCommercialPackages() {
    return this.portfolioManager.listCommercialPackages();
  }

  generateCommercialProposalArtifact(input) {
    return this.portfolioManager.generateCommercialProposalArtifact(input);
  }

  applyCommercialPriceOverride(input) {
    return this.portfolioManager.applyCommercialPriceOverride(input);
  }

  acceptCommercialProposal(input) {
    return this.portfolioManager.acceptCommercialProposal(input);
  }

  expireCommercialProposal(proposalId, options) {
    return this.portfolioManager.expireCommercialProposal(proposalId, options);
  }

  evaluateAll() {
    return this.portfolioManager.evaluateAllUnderReview();
  }

  rankPortfolio() {
    return this.portfolioManager.rankPortfolio();
  }

  applyDecision(decision) {
    return this.portfolioManager.applyExecutiveDecision(decision);
  }

  async convertApprovedProposal(proposalId) {
    return this.portfolioManager.convertProposalToMission(proposalId);
  }

  buildDashboard() {
    const proposals = this.portfolioManager.portfolioRegistry.listProposals();
    const portfolio = this.portfolioManager.rankPortfolio();

    const recentDecisions = proposals.flatMap((proposal) => proposal.decisionHistory ?? []);
    const recommendedNextActions = this.portfolioManager.recommendNextExecutiveActions();

    return this.dashboardModel.build({
      proposals,
      missionPortfolio: portfolio,
      missionRegistry: this.missionControl.missionRegistry,
      recentDecisions,
      recommendedNextActions
    });
  }

  getPortfolioView() {
    return this.portfolioManager.getPortfolioView();
  }
}
