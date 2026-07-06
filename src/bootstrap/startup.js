import { AtlasApplication } from './application.js';
import { DependencyContainer } from './dependency-container.js';
import { AtlasConfiguration } from './configuration.js';

export function startAtlas() {

    const configuration = new AtlasConfiguration();

    console.log(configuration.summary());

    const container = new DependencyContainer();

    const services = container.build();

    const app = new AtlasApplication(services);

    return app.start();

}
