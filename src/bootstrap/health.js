export class AtlasHealthMonitor {
    constructor({ configuration, services }) {
        this.configuration = configuration;
        this.services = services;
    }

    check() {
        const checks = [
            this.checkService('Executive', this.services.executive),
            this.checkService('Capability Registry', this.services.capabilityRegistry),
            this.checkService('Worker Orchestration', this.services.workerOrchestration),
        ];

        const ready = checks.every((check) => check.status === 'READY');

        return {
            application: this.configuration.summary(),
            status: ready ? 'READY' : 'DEGRADED',
            checks
        };
    }

    checkService(name, service) {
        return {
            name,
            status: service ? 'READY' : 'MISSING'
        };
    }

    print() {
        const report = this.check();

        console.log('================================');
        console.log(`${report.application.applicationName} System Status`);
        console.log(`Version: ${report.application.applicationVersion}`);
        console.log(`Environment: ${report.application.environment}`);
        console.log('================================');

        for (const check of report.checks) {
            const icon = check.status === 'READY' ? '✓' : '✗';
            console.log(`${icon} ${check.name}: ${check.status}`);
        }

        console.log('================================');
        console.log(`System Status: ${report.status}`);
        console.log('================================');

        return report;
    }
}
