export class Belief {
    constructor(
        id,
        statement,
        confidence = 0.0,
        supportingFindings = [],
        status = 'proposed',
        createdAt = new Date().toISOString()
    ) {
        this.id = id;
        this.statement = statement;
        this.confidence = confidence;
        this.supportingFindings = supportingFindings;
        this.status = status;
        this.createdAt = createdAt;
    }
}
