export class CapabilityRequest {
	constructor(
		requestId,
		missionId,
		department,
		capability,
		objective,
		input,
		constraints = {},
		priority = 'normal',
		timeout = 30000,
		metadata = {}
	) {
		this.requestId = requestId;
		this.missionId = missionId;
		this.department = department;
		this.capability = capability;
		this.objective = objective;
		this.input = input;
		this.constraints = constraints;
		this.priority = priority;
		this.timeout = timeout;
		this.metadata = metadata;
	}
}
