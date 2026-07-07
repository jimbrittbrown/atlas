export class Finding {
    constructor(
        id,
        statement,
        importance = 'medium',
        confidence = 0.0,
        supportingProviders = [],
        supportingEvidence = [],
        relatedRisks = [],
        relatedOpportunities = [],
        tags = [],
        createdAt = new Date().toISOString()
    ) {
        this.id = id;
        this.statement = statement;
        this.importance = importance;
        this.confidence = confidence;
        this.supportingProviders = supportingProviders;
        this.supportingEvidence = supportingEvidence;
        this.relatedRisks = relatedRisks;
        this.relatedOpportunities = relatedOpportunities;
        this.tags = tags;
        this.createdAt = createdAt;
    }
}