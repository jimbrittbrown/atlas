export class CapabilityResponse {
	constructor(
		provider,
		providerVersion,
		timestamp,
		status,
		confidence,
		citations = [],
		content,
		latency,
		usage = {},
		metadata = {},
		errors = []
	) {
		this.provider = provider;
		this.providerVersion = providerVersion;
		this.timestamp = timestamp;
		this.status = status;
		this.confidence = confidence;
		this.citations = citations;
		this.content = content;
		this.latency = latency;
		this.usage = usage;
		this.metadata = metadata;
		this.errors = errors;
	}
}
