export class CapabilityHealth {
	constructor(
		available = false,
		authenticated = false,
		latency = null,
		lastSuccessfulCall = null,
		failureCount = 0,
		rateLimitStatus = 'unknown',
		lastHealthCheck = new Date().toISOString()
	) {
		this.available = available;
		this.authenticated = authenticated;
		this.latency = latency;
		this.lastSuccessfulCall = lastSuccessfulCall;
		this.failureCount = failureCount;
		this.rateLimitStatus = rateLimitStatus;
		this.lastHealthCheck = lastHealthCheck;
	}
}
