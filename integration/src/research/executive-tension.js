export class ExecutiveTension {
    constructor(
        id,
        title,
        description,
        beliefs = [],
        importance = 'medium',
        status = 'open',
        createdAt = new Date().toISOString()
    ) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.beliefs = beliefs;
        this.importance = importance;
        this.status = status;
        this.createdAt = createdAt;
    }
}
