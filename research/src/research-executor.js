export class ResearchExecutor {

    constructor(broker) {

        this.broker = broker;

    }

    async execute(report) {

        const evidence = [];

        for (const question of report.researchQuestions) {

            evidence.push(
                await this.broker.collect(question)
            );

        }

        return evidence;

    }

}
