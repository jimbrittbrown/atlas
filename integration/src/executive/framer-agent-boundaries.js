export class FramerPluginBoundary {
  createTaskPlan({ operation, details = {} } = {}) {
    return {
      boundary: 'PLUGIN',
      operation,
      status: 'REQUIRES_PLUGIN_CONTEXT',
      details,
      guidance: [
        'Use Framer Plugin APIs from within editor context.',
        'Confirm user permissions with isAllowedTo before write operations.',
        'Record resulting node/item IDs for resume and idempotent checkpoints.'
      ]
    };
  }
}

export class FramerExternalAgentBoundary {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
  }

  createTaskPlan({ operation, details = {} } = {}) {
    return {
      boundary: 'EXTERNAL_AGENT',
      operation,
      enabled: this.enabled,
      status: this.enabled ? 'AVAILABLE' : 'DISABLED',
      installCommand: 'npx @framer/agent setup',
      connectCommand: '/framer',
      details,
      guidance: [
        'Authorize only explicit project scope in browser grant flow.',
        'Review all branch changes before merge/publish.',
        'Use explicit prompts containing Atlas stage ID and idempotency key.'
      ]
    };
  }
}
