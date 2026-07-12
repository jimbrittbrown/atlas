# Customer Identity and Secure Sessions v1

## Scope
This document defines the Atlas production foundation for customer identity and secure sessions while preserving existing Atlas architecture boundaries.

## Canonical Customer Relationship
The canonical customer business record remains in Customer Registry.

Provider adapter -> Customer Auth Manager -> Customer Registry -> Customer Portal / Mission Control / Executive Dashboard

Identity providers store provider-specific authentication metadata only. They do not own a duplicate customer domain model.

## Architectural Decisions
- Customer Registry remains the single source of truth for customer profile/business status data.
- Customer Auth Manager stores only identity-link metadata and auth counters in provider-backed meta storage.
- Session records are persisted through existing storage-provider abstractions.
- Existing API audit, RBAC, route contracts, and rate limiter are reused.
- Auth telemetry is projected through existing dashboard projection architecture.

## Identity Link Model
Durable identity link record includes only:
- Atlas customer ID
- provider type and provider name
- provider user ID (subject)
- normalized email
- verification status
- disabled/revoked flags
- created and updated timestamps

No duplicate customer company/contact/business profile fields are stored in the identity link model.

## Registration and Linking Policy
- Registration normalizes email (trim + lowercase).
- Duplicate provider registrations are treated idempotently.
- Existing provider user is safely linked to canonical customer record.
- Customer creation uses existing Customer Registry create/update APIs only.
- Provider retry and repeated registration avoid duplicate canonical customers.

## Lifecycle Access Policy
Customer lifecycle policy is enforced at login and session validation:
- ACTIVE: allowed
- PENDING_VERIFICATION / INTAKE_REVIEW: denied for sign-in
- SUSPENDED: denied and active sessions revoked
- DISABLED: denied and active sessions revoked
- BLOCKED (archived-equivalent): denied and active sessions revoked

## Session Security and Recovery
- Session tokens are generated as csn_<id>.<secret>.
- Only token hash is stored at rest.
- Session token parser is strict and fails closed for malformed/ambiguous formats.
- Session supports idle timeout, absolute timeout, refresh rotation, logout revocation, and revoke-all.
- Startup recovery marks expired active sessions as EXPIRED.
- Runtime cleanup updates stale active sessions to EXPIRED.
- Password reset completion revokes all customer sessions.

## Password and Reset Security
Local development provider:
- Password hashing: scrypt with unique per-user salt.
- Verification: timing-safe hash comparison.
- No plaintext password storage.

Password reset:
- Cryptographically generated token.
- Token hash persisted (not raw token).
- Single-use and time-limited enforcement.
- Public reset-request responses are enumeration-safe.
- Development reset token exposure is disabled by default and gated by env flag.

## Token Transport and Browser Storage
Production-capable transport is explicit and mode-driven:
- secure_cookie mode (production target): customer session travels in HttpOnly Secure cookie.
- development_token mode (non-production fallback): customer session token travels in request headers.

Secure cookie mode behavior:
- Login sets a customer session cookie.
- Login and authenticated registration also set a readable CSRF cookie.
- Registration sets a session cookie when registration yields an authenticated session.
- Refresh rotates and replaces the cookie.
- Refresh also rotates CSRF token state.
- Logout clears the cookie.
- Logout clears CSRF cookie state.
- Revoke-all clears the current cookie and invalidates all active customer sessions.
- Revoke-all clears CSRF cookie state.
- Password reset completion revokes customer sessions and clears current cookie.
- Password reset completion clears CSRF cookie state.
- Current-session authenticates from cookie transport.
- Raw session tokens are not returned in production cookie-mode response bodies.

Development token mode behavior:
- Must be explicitly enabled by configuration.
- Is blocked in production.
- Intended only for local/test continuity.

Security posture:
- Customer session token is never placed in URL parameters.
- Cookie transport keeps customer session token out of browser-readable storage.
- Session token hashes remain the only at-rest persistent token representation.
- CSRF token is readable by browser script (double-submit), but session cookie remains HttpOnly.

## Protected Route Policy
Centralized policy classifies customer routes by method/path and applies:
- Customer authentication requirement
- State-changing mutation classification
- Trusted origin validation requirement
- CSRF validation requirement
- Explicit exemptions for non-customer routes (for example Stripe webhook route)

For customer mutations, ambiguous classification fails closed.

Protected mutation examples:
- register
- login
- logout
- session refresh
- password reset completion
- revoke-all sessions
- website request creation
- revision request creation
- checkout creation
- customer completion approval

Read-only customer routes remain available without CSRF checks (for example projects list, project detail, downloads, payment history, current session).

## Trusted Origin Policy
- Exact origin matching only (`scheme://host[:port]`).
- No wildcard trusted origins when credentialed cookies are enabled.
- No substring/suffix trust checks.
- Malformed `Origin` values are rejected.
- Untrusted origins are rejected before business logic executes.
- Same-origin requests (derived from forwarded/request host metadata) or explicitly trusted origins are accepted.

Missing-Origin policy:
- Production: protected customer mutations reject missing `Origin` by default (fail closed).
- Development: missing `Origin` may be allowed only through explicit non-production configuration.

## Authorization Boundaries
- Customer session token authenticates only CUSTOMER role routes.
- Executive dashboard routes still require service token role authorization.
- Service and customer token contexts are separated in auth gate flow.
- Ownership checks enforce customer-only access to projects/revisions/downloads.
- Public customer auth routes remain rate-limited and audited.

## Provider Abstraction Readiness
- Local provider: development implementation for secure foundational testing.
- OIDC provider: foundation-only adapter, not production complete.
- OIDC selection fails safely unless explicitly enabled for controlled testing.

Remaining OIDC production work includes issuer discovery, token signature validation, audience validation, state/nonce callback handling, and hardened callback/session exchange.

## Environment Variables
- ATLAS_IDENTITY_PROVIDER
- ATLAS_AUTH_ALLOW_DEVELOPMENT_IN_PRODUCTION
- ATLAS_LOCAL_IDENTITY_AUTO_VERIFY
- ATLAS_LOCAL_IDENTITY_EXPOSE_RESET_TOKEN
- ATLAS_LOCAL_IDENTITY_RESET_TOKEN_PEPPER
- ATLAS_AUTH_SESSION_IDLE_TIMEOUT_MS
- ATLAS_AUTH_SESSION_ABSOLUTE_TIMEOUT_MS
- ATLAS_AUTH_SESSION_PEPPER
- ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE (`secure_cookie` or `development_token`)
- ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT (`true` only for non-production development/testing)
- ATLAS_CUSTOMER_SESSION_COOKIE_NAME
- ATLAS_CUSTOMER_SESSION_COOKIE_PATH
- ATLAS_CUSTOMER_SESSION_COOKIE_SAMESITE (`Strict`, `Lax`, or `None`)
- ATLAS_CUSTOMER_SESSION_COOKIE_SECURE (must remain `true` in secure cookie mode)
- ATLAS_CUSTOMER_SESSION_COOKIE_HTTP_ONLY (must remain `true` in secure cookie mode)
- ATLAS_CUSTOMER_SESSION_COOKIE_DOMAIN (optional)
- ATLAS_CUSTOMER_TRUSTED_ORIGINS (exact comma-separated origins)
- ATLAS_CUSTOMER_ENFORCE_TRUSTED_ORIGIN
- ATLAS_CUSTOMER_ALLOW_MISSING_ORIGIN (non-production relaxation only)
- ATLAS_CUSTOMER_CSRF_PROTECTION_ENABLED
- ATLAS_CUSTOMER_CSRF_COOKIE_NAME
- ATLAS_CUSTOMER_CSRF_HEADER_NAME
- ATLAS_CUSTOMER_CSRF_COOKIE_PATH
- ATLAS_CUSTOMER_CSRF_COOKIE_SAMESITE (`Strict`, `Lax`, or `None`)
- ATLAS_CUSTOMER_CSRF_COOKIE_SECURE (must remain `true` when enabled)
- ATLAS_CUSTOMER_CSRF_COOKIE_DOMAIN (optional)
- ATLAS_IDENTITY_OIDC_EXPERIMENTAL_ENABLE
- ATLAS_IDENTITY_OIDC_ISSUER_URL
- ATLAS_IDENTITY_OIDC_CLIENT_ID
- ATLAS_IDENTITY_OIDC_CLIENT_SECRET
- ATLAS_IDENTITY_OIDC_AUDIENCE
- ATLAS_IDENTITY_OIDC_MANAGEMENT_TOKEN

## Governance Boundaries
- No deploy or publish operations in this mission.
- No production infrastructure mutation performed.
- No CEO approval gate bypass introduced.
- No production secrets embedded in source or report artifacts.

## Recovery and Operations
- Session recovery executes on manager initialization.
- Expired records are normalized and auditable.
- Auth health projection includes provider readiness, warnings, session counts, lifecycle denials, and rate-limit metrics.

## Cookie Lifecycle
- Issue: login (and eligible registration) writes cookie with `Expires` aligned to Atlas session expiry.
- Rotate: refresh replaces session cookie and CSRF cookie with a newly bound pair.
- Revoke/clear: logout, revoke-all, and password-reset completion issue cookie clear semantics (`Max-Age=0` and past `Expires`) for session and CSRF cookies.
- Expiry: expired/revoked sessions are rejected by session manager regardless of cookie presence.

## CSRF Design
- Double-submit pattern: readable CSRF cookie + dedicated request header.
- Header/cookie token equality check uses timing-safe comparison.
- CSRF token format is validated and malformed values are rejected.
- Session manager stores only CSRF token hash in session metadata.
- CSRF token is validated against the active authenticated customer session.
- CSRF token alone never authorizes a request.

## Frontend Behavior
- Customer API requests are sent with credentials to support cookie transport.
- Frontend reads CSRF token from readable cookie storage and sends it in configured CSRF header for customer mutations.
- Portal session restore uses customer current-session endpoint.
- Logout clears frontend customer state and requests backend logout.
- Auth-loss cleanup clears local customer state and readable CSRF cookie state.
- Browser-readable customer session token is no longer required for production cookie mode.
- Optional header-token fallback remains available only when explicitly enabled for development transport.

## Audit and Telemetry Behavior
- Aggregate customer security counters record origin acceptance/rejection, missing-origin rejection, CSRF success/failure classes, and protected-request denials.
- Existing API audit system records denied protected requests with normalized denial reasons.
- Raw session cookies, CSRF tokens, passwords, reset tokens, and provider/webhook secrets are not logged.

## Known Limitations
- Development token transport remains available for controlled non-production scenarios and must be explicitly enabled.
- OIDC adapter is foundation-only and intentionally fails safe without explicit testing override.
- Cross-process registration race protection is bounded by underlying storage semantics and current API request serialization model.
- Same-origin derivation depends on deployment forwarding headers (`x-forwarded-proto`/`x-forwarded-host`) when direct host metadata is absent.

## Security Assumptions
- TLS is enforced before relying on Secure cookies.
- API and frontend are deployed with origin/path settings compatible with configured cookie scope.
- Executive/service token auth and Stripe webhook signature verification remain independent from customer browser cookies.
