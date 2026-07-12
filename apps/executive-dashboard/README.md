# Atlas CEO Dashboard Frontend v1

Operational frontend for Atlas Executive Dashboard API read models.

## Scope

- Fully implemented: Executive Overview and CEO Decision Center pages.
- Foundation routes: Decisions, Mission Control, Customers, Opportunities, Workforce, Providers, System Health, Activity, Settings.
- Read-only governance preserved: no approvals, publish/deploy, destructive actions, or write operations.

## Local Setup

1. Copy `.env.example` values into your shell or local env configuration.
2. Set backend token in shell for local gateway:
   - `export ATLAS_DASHBOARD_API_TOKEN=<token>`
3. Start app:
   - `npm run dev`

The app uses `/atlas-api/*` in development and routes requests through a Vite middleware adapter that invokes the existing Executive Dashboard API service.

## Commands

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run validate:overview-path`
- `npm run report:v1`

## Data Source Modes

- `LIVE API`: default mode, authenticated request to dashboard API route.
- `DEVELOPMENT DATA`: available only when `VITE_ATLAS_ENABLE_FIXTURES=true`, explicitly labeled in UI.

Fixture mode is opt-in and never used as silent fallback after live API failures.

## Security Notes

- No API token committed to source.
- Token entered at runtime and stored in browser `sessionStorage` only.
- Error messages are normalized; no stack traces or secret values are rendered.

## Architecture Documentation

See `docs/ceo-dashboard-frontend-v1.md`.
