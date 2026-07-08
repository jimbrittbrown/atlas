import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ExecutiveOfficeDashboard } from './executive-office-dashboard.js';

class NodeConsoleIO {
  constructor() {
    this.readline = createInterface({ input, output });
  }

  writeLine(message = '') {
    output.write(`${message}\n`);
  }

  async prompt(message) {
    return this.readline.question(message);
  }

  close() {
    this.readline.close();
  }
}

export class ExecutiveOfficeConsole {
  constructor({
    businessEvaluationApplication,
    io,
    executiveOfficeDashboard,
    workflowResults = [],
    currentPassingTestCount = 0,
    latestCommit = 'LATEST_COMMIT_PLACEHOLDER'
  }) {
    this.businessEvaluationApplication = businessEvaluationApplication;
    this.io = io ?? new NodeConsoleIO();
    this.executiveOfficeDashboard = executiveOfficeDashboard ?? new ExecutiveOfficeDashboard();
    this.workflowResults = [...workflowResults];
    this.currentPassingTestCount = currentPassingTestCount;
    this.latestCommit = latestCommit;
  }

  async run() {
    let running = true;
    while (running) {
      this.renderHomeScreen();
      this.renderMenu();
      const selection = (await this.io.prompt('Select application: ')).trim();

      if (selection === '1') {
        await this.handleBusinessEvaluation();
        continue;
      }

      if (selection === '2') {
        this.io.writeLine('Exiting Atlas Executive Office.');
        running = false;
        continue;
      }

      this.io.writeLine('Invalid selection. Please choose 1 or 2.');
    }

    if (typeof this.io.close === 'function') {
      this.io.close();
    }
  }

  renderHeader() {
    this.io.writeLine('=================================');
    this.io.writeLine('ATLAS EXECUTIVE OFFICE');
    this.io.writeLine('=================================');
  }

  renderHomeScreen() {
    const dashboard = this.executiveOfficeDashboard.build({
      workflowResults: this.workflowResults,
      currentPassingTestCount: this.currentPassingTestCount,
      latestCommit: this.latestCommit
    });
    const missionQueueIds = this.workflowResults
      .map(result => result?.mission?.id)
      .filter(Boolean);

    this.renderHeader();
    this.io.writeLine('Atlas Branding: Atlas Executive Command');
    this.io.writeLine('Executive Health: ' + dashboard.executiveHealth);
    this.io.writeLine(
      'Mission Queue: '
      + dashboard.activeMissions
      + ' active '
      + (missionQueueIds.length > 0 ? `(${missionQueueIds.join(', ')})` : '(none)')
    );
    this.io.writeLine('Outstanding Investigation Requests: ' + dashboard.outstandingInvestigationRequests);
    this.io.writeLine('Latest Executive Recommendation: ' + dashboard.latestRecommendation);
    this.io.writeLine('Enterprise Health: ' + this.calculateEnterpriseHealth(dashboard));
  }

  renderMenu() {
    this.io.writeLine('');
    this.io.writeLine('Available Executive Applications');
    this.io.writeLine('');
    this.io.writeLine('1. Business Evaluation');
    this.io.writeLine('2. Exit');
  }

  async handleBusinessEvaluation() {
    const businessName = (await this.io.prompt('Business Name: ')).trim();
    const description = (await this.io.prompt('Description: ')).trim();
    const businessOpportunityRequest = this.buildBusinessOpportunityRequest({ businessName, description });
    const decisionPackage = await this.businessEvaluationApplication.evaluateBusinessOpportunity(
      businessOpportunityRequest
    );

    this.workflowResults.push({
      mission: {
        id: businessOpportunityRequest.id,
        title: businessOpportunityRequest.objective,
        status: 'MISSION_CREATED',
        sponsor: 'CEO',
        decisionClass: 'Strategic'
      },
      decisionPackage,
      review: {
        additionalInvestigationRequired: false,
        updatedRecommendation: decisionPackage.recommendation ?? null,
        investigationRequests: []
      }
    });

    this.renderDecisionPackage(decisionPackage);
  }

  buildBusinessOpportunityRequest({ businessName, description }) {
    const normalizedName = this.normalizeForId(businessName);

    return {
      id: `BO-${normalizedName}`,
      businessName,
      description,
      businessOpportunity: `${businessName} - ${description}`,
      objective: `Evaluate ${businessName}: ${description}`,
      ceoQuestions: []
    };
  }

  normalizeForId(value) {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || 'UNTITLED';
  }

  renderDecisionPackage(decisionPackage = {}) {
    const readiness = decisionPackage.decisionReadiness?.status
      ?? decisionPackage.decisionReadiness
      ?? 'UNKNOWN';

    this.io.writeLine('');
    this.io.writeLine('Executive Summary: ' + (decisionPackage.executiveSummary ?? 'No executive summary available.'));
    this.io.writeLine('Recommendation: ' + (decisionPackage.recommendation ?? 'NO_RECOMMENDATION_AVAILABLE'));
    this.io.writeLine('Confidence: ' + (decisionPackage.confidence ?? 0));
    this.io.writeLine('Decision Readiness: ' + readiness);
    this.io.writeLine('Authority Required: ' + (decisionPackage.authorityRequired ?? 'CEO Review Required'));
  }

  calculateEnterpriseHealth(dashboard) {
    if ((dashboard.currentPassingTestCount ?? 0) === 0) {
      return 'UNKNOWN';
    }

    if (dashboard.executiveHealth === 'AT_RISK') {
      return 'DEGRADED';
    }

    if (dashboard.executiveHealth === 'ATTENTION_REQUIRED') {
      return 'MONITORED';
    }

    return 'STABLE';
  }
}
