# Layer 5 — Adapter Layer

## Purpose

The Adapter Layer translates Executive requests into subsystem-specific operations.

Adapters isolate the Executive from subsystem implementation details.

Adapters preserve subsystem independence.

---

# Responsibilities

- Translate Executive requests
- Adapt Executive models
- Invoke subsystem services
- Return subsystem results
- Preserve interface compatibility

---

# Inputs

Executive Requests

Workflow Bridge Requests

Subsystem Responses

---

# Outputs

Subsystem Commands

Subsystem Results

Workflow Events

---

# Dependencies

Workflow Bridges

Subsystem Services

Subsystem Models

---

# Communication

Adapters communicate with:

Workflow Bridges

Subsystem Services

Adapters do NOT communicate directly with Workers.

Adapters do NOT communicate directly with Executive.

---

# Rules

Adapters translate.

Adapters never make Executive decisions.

Adapters never contain business policy.

Adapters never bypass Workflow Bridges.

Adapters preserve subsystem independence.

---

# Standard Pattern

Executive

↓

Workflow Bridge

↓

Adapter

↓

Subsystem

↓

Result

↓

Workflow Bridge

↓

Executive

