# Work Order 010 - Control Center v1.0 Responsibility Matrix

Date: 2026-07-05
Status: PLANNING ONLY

| Layer / Service | Responsibility | Out of Scope for Control Center |
| --- | --- | --- |
| Executive Service | Owns strategic intent, objective framing, governance-aware workflow direction | Delegating strategic intent to workers or support services |
| Control Center (Proposed) | Presents operational visibility and governance-aware command interface | Replacing Executive decision authority |
| Approval Service | Authorizes or denies execution actions under policy | Executing workflows directly |
| Capability Registry | Authoritative discovery and capability metadata | Coordination of execution behavior |
| Worker Orchestration | Discovery, selection, dispatch, retry, completion reporting | Strategic planning and policy interpretation |
| Workers | Execute assigned responsibilities only | Worker-to-worker coordination or strategic planning |
| Metrics / Memory / Performance | Measurement, history, intelligence support | Governance ownership or orchestration authority |

## Boundary Rules
- Control Center must compose existing service outputs and commands without collapsing ownership boundaries.
- Operational controls must route through existing governance and orchestration pathways.
- Worker operations remain mediated by Worker Orchestration and discovered through Capability Registry.
