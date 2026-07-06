export class WorkflowCoordinator {

    constructor() {
        this.bridges = new Map();
    }

    register(name, bridge) {
        this.bridges.set(name, bridge);
        return this;
    }

    get(name) {
        const bridge = this.bridges.get(name);

        if (!bridge) {
            throw new Error(
                `Unknown workflow bridge: ${name}`
            );
        }

        return bridge;
    }

    async execute(name, workflowId, request) {
        const bridge = this.get(name);
        return bridge.execute(workflowId, request);
    }

    registeredBridges() {
        return [...this.bridges.keys()];
    }

}
