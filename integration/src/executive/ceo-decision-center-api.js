import { CeoDecisionCenterManager } from './ceo-decision-center-manager.js';
import { CeoDecisionCenterVersion } from './ceo-decision-center-contracts.js';

export class CeoDecisionCenterApi {
  constructor({ manager } = {}) {
    this.manager = manager;
  }

  buildResponse() {
    const data = this.manager.buildDecisionCenter();
    return {
      ...data,
      apiVersion: CeoDecisionCenterVersion,
      governance: {
        readOnly: true,
        decisionExecutionEnabled: false,
        missionExecutionEnabled: false,
        publishEnabled: false,
        deployEnabled: false,
        destructiveActionsEnabled: false
      }
    };
  }
}
