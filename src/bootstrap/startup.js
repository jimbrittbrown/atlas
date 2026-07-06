import fs from 'node:fs';

import { AtlasApplication } from './application.js';
import { DependencyContainer } from './dependency-container.js';
import { AtlasConfiguration } from './configuration.js';
import { AtlasHealthMonitor } from './health.js';

import { WorkflowCoordinator } from '../workflow/workflow-coordinator.js';
import { ResearchWorkflowBridge } from '../workflow/research-workflow-bridge.js';

export function startAtlas() {

    const configuration = new AtlasConfiguration();

    const identity = JSON.parse(
        fs.readFileSync(
            './src/system/atlas-identity.json',
            'utf8'
        )
    );

    const manifest = JSON.parse(
        fs.readFileSync(
            './src/system/atlas-manifest.json',
            'utf8'
        )
    );

    console.log('====================================================');
    console.log(identity.name);
    console.log(identity.codename);
    console.log();
    console.log(`Version: ${identity.version}`);
    console.log(`Status: ${identity.status}`);
    console.log();
    console.log(identity.mission);
    console.log('====================================================');

    console.log('================================');
    console.log('Atlas Manifest Loaded');
    console.log('================================');
    console.log(`Version: ${manifest.version}`);
    console.log(
        `Subsystems: ${
            Object.keys(manifest.subsystems).length
        }`
    );
    console.log(
        `Workflow Bridges: ${
            manifest.architecture.workflowBridges.length
        }`
    );
    console.log(
        `Adapters: ${
            manifest.architecture.adapters.length
        }`
    );
    console.log('================================');

    const container = new DependencyContainer();
    const services = container.build();

    const workflowCoordinator = new WorkflowCoordinator();

    workflowCoordinator.register(
        'research',
        new ResearchWorkflowBridge({
            executiveWorkflowManager: services.executive.workflowManager,
            researchService: services.researchService
        })
    );

    services.workflowCoordinator = workflowCoordinator;

    const healthMonitor = new AtlasHealthMonitor({
        configuration,
        services
    });

    healthMonitor.print();

    const app = new AtlasApplication(services);

    return app.start();

}
