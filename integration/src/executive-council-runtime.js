const REQUIRED_ROLES = ['COO', 'CMO', 'CFO', 'CCO', 'CTO', 'CQO'];
const VALID_DECISIONS = new Set(['APPROVE', 'APPROVE_WITH_WAIVERS', 'REVISE', 'BLOCK']);

export class ExecutiveCouncilRuntime {
  evaluate({ recommendationContracts = {}, missionId = null, businessId = null } = {}) {
    const normalizedContracts = this.normalizeContracts(recommendationContracts);
    const validation = this.validateContracts(normalizedContracts);
    const outcome = this.resolveOutcome(normalizedContracts, validation);

    return {
      missionId,
      businessId,
      requiredRoles: [...REQUIRED_ROLES],
      recommendationContracts: normalizedContracts,
      validation,
      outcome: outcome.outcome,
      confidence: outcome.confidence,
      conflicts: outcome.conflicts,
      waivers: outcome.waivers,
      highestRisks: outcome.highestRisks,
      evidenceReferences: outcome.evidenceReferences,
      recommendedCEOAction: outcome.recommendedCEOAction
    };
  }

  normalizeContracts(recommendationContracts) {
    if (Array.isArray(recommendationContracts)) {
      return recommendationContracts.map(contract => ({ ...contract }));
    }

    return Object.entries(recommendationContracts ?? {}).map(([role, contract]) => ({
      role,
      ...(contract ?? {})
    }));
  }

  validateContracts(contracts = []) {
    const issues = [];
    const byRole = new Map();

    contracts.forEach(contract => {
      if (typeof contract.role === 'string' && contract.role.trim().length > 0) {
        byRole.set(contract.role.trim().toUpperCase(), contract);
      }
    });

    REQUIRED_ROLES.forEach(role => {
      const contract = byRole.get(role);

      if (!contract) {
        issues.push({
          type: 'MISSING_RECOMMENDATION',
          role,
          message: `Missing recommendation contract for ${role}.`
        });
        return;
      }

      const decision = String(contract.decision ?? '').toUpperCase().trim();
      const confidence = Number(contract.confidence);
      const rationale = contract.rationale;
      const evidenceReferences = contract.evidenceReferences;

      if (!VALID_DECISIONS.has(decision)) {
        issues.push({
          type: 'INVALID_DECISION',
          role,
          message: `Invalid decision for ${role}.`
        });
      }

      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
        issues.push({
          type: 'INVALID_CONFIDENCE',
          role,
          message: `Invalid confidence for ${role}.`
        });
      }

      if (typeof rationale !== 'string' || rationale.trim().length === 0) {
        issues.push({
          type: 'MISSING_RATIONALE',
          role,
          message: `Missing rationale for ${role}.`
        });
      }

      if (!Array.isArray(evidenceReferences) || evidenceReferences.length === 0) {
        issues.push({
          type: 'MISSING_EVIDENCE_REFERENCES',
          role,
          message: `Missing evidence references for ${role}.`
        });
      }
    });

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  resolveOutcome(contracts = [], validation = { isValid: true, issues: [] }) {
    const validContracts = contracts
      .map(contract => ({
        ...contract,
        role: String(contract.role ?? '').toUpperCase().trim(),
        decision: String(contract.decision ?? '').toUpperCase().trim(),
        confidence: Number(contract.confidence)
      }))
      .filter(contract => REQUIRED_ROLES.includes(contract.role));

    const allEvidence = validContracts.flatMap(contract => (
      Array.isArray(contract.evidenceReferences) ? contract.evidenceReferences : []
    ));

    const highestRisks = validContracts.flatMap(contract => {
      const risks = Array.isArray(contract.risks) ? contract.risks : [];
      return risks.map(risk => ({
        role: contract.role,
        ...risk
      }));
    });

    const waivers = validContracts
      .filter(contract => contract.decision === 'APPROVE_WITH_WAIVERS')
      .map(contract => ({
        role: contract.role,
        rationale: contract.rationale,
        waivers: Array.isArray(contract.waivers) ? contract.waivers : []
      }));

    const hasBlock = validContracts.some(contract => contract.decision === 'BLOCK');
    const hasApprove = validContracts.some(contract => (
      contract.decision === 'APPROVE' || contract.decision === 'APPROVE_WITH_WAIVERS'
    ));
    const hasRevise = validContracts.some(contract => contract.decision === 'REVISE');

    const conflicts = [];
    if (hasBlock && hasApprove) {
      conflicts.push({
        type: 'BLOCK_VS_APPROVE',
        message: 'Council recommendations contain both BLOCK and APPROVE decisions.'
      });
    }

    let outcome = 'UNANIMOUS_APPROVE';

    if (!validation.isValid) {
      outcome = 'REVISION_REQUIRED';
    } else if (conflicts.length > 0) {
      outcome = 'CONFLICT';
    } else if (hasBlock) {
      outcome = 'BLOCK';
    } else if (hasRevise) {
      outcome = 'REVISION_REQUIRED';
    } else if (waivers.length > 0) {
      outcome = 'APPROVE_WITH_WAIVERS';
    }

    const recommendedCEOAction = this.mapOutcomeToCEOAction(outcome);
    const confidence = this.computeConfidence(validContracts, validation);

    return {
      outcome,
      confidence,
      conflicts,
      waivers,
      highestRisks,
      evidenceReferences: [...new Set(allEvidence)],
      recommendedCEOAction
    };
  }

  mapOutcomeToCEOAction(outcome) {
    if (outcome === 'UNANIMOUS_APPROVE') {
      return 'APPROVE';
    }

    if (outcome === 'APPROVE_WITH_WAIVERS') {
      return 'APPROVE_WITH_WAIVERS';
    }

    if (outcome === 'BLOCK') {
      return 'REJECT';
    }

    return 'RETURN_FOR_REVISION';
  }

  computeConfidence(contracts = [], validation = { isValid: true, issues: [] }) {
    if (contracts.length === 0) {
      return 0;
    }

    const average = contracts.reduce((sum, contract) => sum + Number(contract.confidence || 0), 0) / contracts.length;

    if (!validation.isValid) {
      return Math.max(0, Math.round(average - (validation.issues.length * 10)));
    }

    return Math.round(average);
  }
}
