export class ProviderMetadata {
	constructor(
		name,
		vendor,
		version,
		purpose,
		authenticationType,
		supportedCapabilities = [],
		status = 'unknown'
	) {
		this.name = name;
		this.vendor = vendor;
		this.version = version;
		this.purpose = purpose;
		this.authenticationType = authenticationType;
		this.supportedCapabilities = supportedCapabilities;
		this.status = status;
	}
}
