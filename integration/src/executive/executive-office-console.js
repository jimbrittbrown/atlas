import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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
  constructor({ businessEvaluationApplication, io }) {
    this.businessEvaluationApplication = businessEvaluationApplication;
    this.io = io ?? new NodeConsoleIO();
  }

  async run() {
    this.renderHeader();

    let running = true;
    while (running) {
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

  renderMenu() {
    this.io.writeLine('');
    this.io.writeLine('Applications');
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
}
