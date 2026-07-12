# Atlas Framer Capability Matrix v1

## Verification Scope

This matrix is based on Framer's official documentation pages reviewed on 2026-07-11:

- Developers overview: https://www.framer.com/developers/
- Server API intro: https://www.framer.com/developers/server-api-introduction
- Server API quick start: https://www.framer.com/developers/server-api-quick-start
- Server API reference: https://www.framer.com/developers/server-api-reference
- Server API FAQ: https://www.framer.com/developers/server-api-faq
- Plugin API reference: https://www.framer.com/developers/reference/
- Plugins introduction: https://www.framer.com/developers/plugins/
- Agents overview: https://www.framer.com/agents/
- External Agents: https://www.framer.com/agents/external/

## Capability Matrix

| Atlas-required operation | Capability status | Required Framer interface | Authentication requirement | Plan/permission requirement | Known limitation | Recommended implementation approach |
|---|---|---|---|---|---|---|
| 1. Authenticate securely from the Atlas VPS | Supported | Server API (`framer-api` SDK) | Project-bound API key generated in Site Settings (General), passed from secure env var | Access to target Framer project and key management on VPS | API key represents user context; must be stored and rotated securely | Use server-side secret env vars and a dedicated auth boundary; never hardcode keys |
| 2. Read project and site information | Supported | Server API (`getProjectInfo`, shared Plugin API methods such as site/project info) | Same as above | Project access permissions | Some project IDs are hashed in plugin contexts; use project URL or project id in server connect as documented | Implement read methods through a Server API client boundary with explicit error normalization |
| 3. Update project content | Partially supported | Server API (inherits most Plugin API methods) and/or External Agent bridge for broader editor tasks | API key for Server API; browser-granted project access for External Agent | User permissions and project edit rights | Server API reference only explicitly lists extra methods; not transactional | Implement a staged writer with idempotency keys and fall back to External Agent tasks for unsupported edit types |
| 4. Update CMS collections | Supported | Plugin CMS APIs (shared by Server API per docs): collections/items operations | API key for Server API or active plugin user context | CMS edit permission | Partial updates can leave project in mixed state if script fails | Use batch-safe upsert patterns, per-item checkpoints, and retry-safe writes |
| 5. Insert or replace images and other assets | Partially supported | Plugin Assets APIs (`addImage`, `setImage`, upload APIs), potentially available via Server API shared methods; External Agent for workflow-style tasks | API key or plugin/external-agent session auth | Asset and editor permissions | Server API explicit method list is narrow; verify asset method availability at runtime | Implement capability probes and graceful fallback to External Agent instructions when assets API is unavailable |
| 6. Modify canvas layers and components where supported | Partially supported | Plugin Node/Canvas/Component APIs; External Agent for broad canvas operations from AI tools | Plugin or external-agent project authorization | Edit rights on project and selected targets | Direct server-side support for all canvas methods is not explicitly enumerated in Server API docs | Treat canvas mutation as capability-gated: try Server API method presence, otherwise route to External Agent boundary |
| 7. Apply company name, logo, brand colors, services, contact information, service areas, reviews, photography | Partially supported | Combination of CMS APIs, Node/Style/Asset APIs, and External Agent | API key and/or external-agent project grant | Edit permissions and style/component permissions | Requires cross-surface edits; some operations may need agent/plugin context | Apply deterministic fields (CMS/text/styles) through API; emit a task plan for unsupported visual/layout edits |
| 8. Generate or retrieve a preview URL | Supported | Server API `publish()` returns deployment/hostnames (preview deployment flow) | API key | Publish permission within project context | Creating preview is still a publish action to a deployment preview environment | Implement explicit `preview()` operation separate from production deploy, with audit logging |
| 9. Run a non-publishing preview workflow | Supported | Server API preview publish (`publish`) without production deploy (`deploy`) | API key | Publish/deployment permission | Terminology nuance: preview generation uses publish call but does not promote to production | Enforce policy: allow preview publish, block production deploy without CEO gate |
| 10. Publish only after explicit CEO approval | Supported (Atlas governance) | Atlas orchestration policy + Server API `deploy()` | Atlas CEO approval artifact + API key | Internal Atlas governance and Framer deploy permission | Framer API itself does not enforce Atlas CEO policy | Enforce gate in adapter and orchestrator before any `deploy` call |
| 11. Capture provider errors and return them to the Website Orchestrator | Supported | Atlas adapter boundary | N/A | N/A | Server API is non-transactional; partial failures are possible | Normalize all provider errors into stable Atlas error schema with retryability hints |
| 12. Support retry, resume, and idempotent execution | Partially supported | Atlas adapter runtime + Server API reconnect behavior | API key | N/A | Framer states API is not transactional; script failures can leave partial state | Implement Atlas-managed idempotency keys, checkpoints, safe retries, and explicit resume from stage |

## Notes

- Framer Server API docs explicitly state the API is not transactional and uses a streaming WebSocket architecture.
- Framer External Agent docs explicitly state no separate Framer MCP setup is required and that changes occur in Framer branches with user-controlled publish.
- For Atlas governance, production deploy must remain blocked until CEO approval is present, even if preview generation is available.
