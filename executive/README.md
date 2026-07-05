# Atlas Executive Service

## Directory structure

```text
executive/
  README.md
  package.json
  src/
    executive-service.js
    types.js
  test/
    executive-service.test.js
```

## Source files

- [src/executive-service.js](src/executive-service.js) — executive orchestration kernel with dependency-injected collaborators.
- [src/types.js](src/types.js) — workflow state definitions and service interface shapes.
- [test/executive-service.test.js](test/executive-service.test.js) — unit tests for workflow creation, transitions, routing, and logging.

## Class diagram

```mermaid
classDiagram
  class ExecutiveService {
    +handleRequest(request)
    +processWorkflow(workflowId, request)
  }

  class DefaultWorkflowStateMachine {
    +canTransition(from, to)
    +transitionState(current, next)
  }

  class InMemoryWorkflowManager {
    +createWorkflow(request)
    +transition(workflowId, nextState)
    +getWorkflow(workflowId)
  }

  class SimpleRequestRouter {
    +route(request, workflow)
  }

  class DefaultEventLogger {
    +log(event)
    +getEvents()
  }

  class DefaultNotificationManager {
    +notify(workflowId, message)
  }

  ExecutiveService --> InMemoryWorkflowManager
  ExecutiveService --> DefaultWorkflowStateMachine
  ExecutiveService --> SimpleRequestRouter
  ExecutiveService --> DefaultEventLogger
  ExecutiveService --> DefaultNotificationManager
```

## Sequence diagram

```mermaid
sequenceDiagram
  participant Client
  participant ExecutiveService
  participant WorkflowManager
  participant StateMachine
  participant Router
  participant Logger

  Client->>ExecutiveService: handleRequest(request)
  ExecutiveService->>WorkflowManager: createWorkflow(request)
  WorkflowManager-->>ExecutiveService: workflow
  ExecutiveService->>Logger: log(created)
  ExecutiveService->>StateMachine: transitionState(NEW -> INTENT_ANALYSIS)
  ExecutiveService->>WorkflowManager: transition(...)
  ExecutiveService-->>Client: ExecutiveResponse
```

## Unit test summary

Verified with Node test runner:

- workflow creation and workflow id assignment
- valid state transitions
- invalid state transitions
- routing to service hooks
- event logging

## Remaining TODO list

- Add richer transition coverage for the full state ladder.
- Introduce persistence for workflows beyond the in-memory manager.
- Wire the service interfaces to real Atlas services in a later work order.

## Engineering recommendations before Work Order #002

- Keep the executive service strictly orchestration-focused.
- Preserve the dependency-injected boundary between orchestration and future services.
- Add persistence and event-store support before introducing broader runtime integration.
