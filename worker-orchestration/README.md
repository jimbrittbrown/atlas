# Atlas Worker Orchestration Service v1.0

Worker Orchestration coordinates approved execution work across replaceable workers discovered through the Capability Registry.

## Responsibilities
- Worker discovery via Capability Registry.
- Worker selection and work dispatch.
- Parallel/staged execution coordination.
- Retry and failure handling.
- Execution state tracking and completion reporting.

## Non-Responsibilities
- No executive decision making.
- No governance approval decisions.
- No capability catalog ownership.
- Workers do not coordinate other workers.
