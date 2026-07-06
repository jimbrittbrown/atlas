import { AtlasApplication } from './application.js';
import { DependencyContainer } from './dependency-container.js';
import { AtlasConfiguration } from './configuration.js';
import { AtlasHealthMonitor } from './health.js';

export function startAtlas() {
    const configuration = new AtlasConfiguration();

    const container = new DependencyContainer();
    const services = container.build();

    const healthMonitor = new AtlasHealthMonitor({
        configuration,
        services
    });

    healthMonitor.print();

    const app = new AtlasApplication(services);

    return app.start();
}
