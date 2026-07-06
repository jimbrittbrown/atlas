# Layer 2 — Application

## Purpose

The Application Layer owns the Atlas Executive Operating System.

It provides the operational environment in which all Executive functions execute.

AtlasApplication is the single owner of the running Atlas instance.

---

# Responsibilities

- Own system lifecycle
- Accept Executive Requests
- Initialize runtime execution
- Coordinate startup completion
- Expose Executive interface
- Maintain operational state

---

# Inputs

Bootstrap

Configuration

Dependency Container

Workflow Coordinator

---

# Outputs

Executive Requests

Operational Runtime

Application State

---

# Dependencies

Executive Layer

Workflow Coordinator

Dependency Container

---

# Communication

Application communicates with:

Bootstrap

Executive

Workflow Coordinator

Application does NOT communicate directly with subsystem services.

---

# Rules

Application owns Atlas.

Application never performs Executive decision making.

Application never executes subsystem business logic.

Application communicates only through Executive.

