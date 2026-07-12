# Atlas CEO Dashboard Frontend v1

## Architecture Decision

- Framework: React + TypeScript + Vite.
- Location: `apps/executive-dashboard`.
- Why: repository already uses Node ESM modules and contains a minimal existing web surface (`control-center`) but no typed component-based dashboard app; this app adds a maintainable frontend boundary without altering backend contracts.
- API communication:
  - Browser client calls `${VITE_ATLAS_API_BASE_URL}/api/v1/dashboard`.
  - In local development, Vite middleware route `/atlas-api/*` invokes existing `ExecutiveDashboardApiService` directly (no duplicated backend business logic).
  - In production, same client contract can point to external HTTP endpoint.
- Authentication:
  - Token entered at runtime in the browser session (`sessionStorage`) and sent as Bearer token.
  - No token hardcoded in source or committed in config.
  - UI errors are normalized and do not expose stack traces or secrets.
- Development fallback:
  - Fixture mode exists only when `VITE_ATLAS_ENABLE_FIXTURES=true`.
  - UI shows explicit `DEVELOPMENT DATA MODE` banner.
  - Live request failures do not auto-fallback to fixture data.

## Folder Structure

- `src/api`: API client, error normalization, runtime validators, envelope/domain types.
- `src/components`: shell layout, status badges, section cards, error boundary.
- `src/hooks`: overview query orchestration.
- `src/pages`: Executive Overview page and Coming Soon modules.
- `src/pages`: Executive Overview and CEO Decision Center operational pages, plus Coming Soon modules.
- `src/modules/ceo-decision-center`: decision-center contracts, manager, dashboard model, and API boundary.
- `src/fixtures`: explicit development dataset.
- `src/__tests__`: frontend unit/integration tests.
- `dev`: local API gateway adapter for Vite dev server.
- `scripts`: validation and reporting scripts.

## Data Status Meanings

- `AVAILABLE`: live section is complete.
- `PARTIAL`: section has missing fields or upstream gaps.
- `UNAVAILABLE`: section could not be generated.
- `NOT_CONNECTED`: provider/system discovered but not connected.
- `NOT_CONFIGURED`: provider/system not configured.
- `ESTIMATED`: estimate-only values (not recognized/settled metrics).

## Security and Governance Protections

- Read-only GET-only dashboard client path.
- No publish/deploy/approval/destructive UI actions.
- No token or stack trace rendering in UI.
- Role-based backend behavior preserved by existing API service.

## Environment Variables

- `VITE_ATLAS_API_BASE_URL` default `/atlas-api`
- `VITE_ATLAS_REQUEST_TIMEOUT_MS` default `8000`
- `VITE_ATLAS_STALE_AFTER_MINUTES` default `20`
- `VITE_ATLAS_ENABLE_FIXTURES` default `false`
- `VITE_ATLAS_DASHBOARD_ROLE` default `CEO`
- Backend dev gateway auth env (shell): `ATLAS_DASHBOARD_API_TOKEN`

## Commands

From `apps/executive-dashboard`:

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run validate:overview-path`
- `npm run report:v1`

## CEO Decision Center Endpoint

- `GET /api/v1/ceo/decision-center`
- Rendered in frontend route: `/decisions`
- Reads approval queue, blocked missions, ranked opportunities, risk overview, and decision history without executing any mission workflow.

## Known Limitations

- v1 uses prompt-based runtime token entry for local session usage.
- v1 includes only Executive Overview as fully operational route.
- Gateway adapter is for local development and validation; production deployment should mount the backend API in a dedicated HTTP service.

## Next Recommended Module

- Implement `CEO Decisions` module with read-only decision queue exploration and filter controls over `/api/v1/dashboard/decisions`.
