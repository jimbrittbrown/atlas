export class AtlasConfiguration {
    constructor() {
        this.environment = process.env.NODE_ENV ?? 'development';
        this.applicationName = 'Atlas';
        this.applicationVersion = '1.0.0-alpha';
    }

    summary() {
        return {
            environment: this.environment,
            applicationName: this.applicationName,
            applicationVersion: this.applicationVersion
        };
    }
}
