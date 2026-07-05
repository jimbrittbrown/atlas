# Atlas Credential Inventory

Date: 2026-07-05
Status: OVP-002 EXECUTED INVENTORY
Scope: Metadata-only credential inventory populated during OVP-002

## Inventory Summary
- Credential classes inventoried: 6
- Fully populated from current evidence: 2
- Partially populated from current evidence: 4
- Raw secret values recorded: 0

## Inventory Entries

### 1. Repository Access Credentials
- System/provider: Git repository access
- Owner: Repository custodian
- Purpose: Pull and push Atlas source-of-truth changes
- Storage location reference: Local Git Credential Manager (`git credential.helper=manager`)
- Rotation interval: 90 days or personnel/control change
- Last verified date: 2026-07-05
- Emergency revocation path: Revoke provider PAT/session or GitHub App grant, remove local credential-manager entry, verify remote access is denied
- Completeness: PARTIAL
- Gap: No canonical remote is configured in this local `atlas-repo` clone, so the provider-side custody target is not concretely represented in current Atlas evidence

### 2. VPS / Infrastructure Credentials
- System/provider: Deployment host and infrastructure admin access
- Owner: Operations lead
- Purpose: Access launch-critical hosts and infrastructure controls
- Storage location reference: Not populated in Atlas repository evidence
- Rotation interval: 90 days or personnel/control change
- Last verified date: 2026-07-05
- Emergency revocation path: Disable host or account access, issue replacement admin credential, verify old access path fails
- Completeness: PARTIAL
- Gap: Concrete custody reference is missing from Atlas repository artifacts

### 3. Backup / Archive Credentials
- System/provider: Off-host and offline backup archive access
- Owner: Security owner
- Purpose: Access encrypted off-host and offline recovery archives
- Storage location reference: Not populated in Atlas repository evidence
- Rotation interval: 90 days or after security incident
- Last verified date: 2026-07-05
- Emergency revocation path: Revoke archive access, rotate archive-access credential, verify archive access with replacement path only
- Completeness: PARTIAL
- Gap: Concrete archive provider or account reference is missing from Atlas repository artifacts

### 4. Provider / Model API Credentials
- System/provider: OpenAI, Anthropic, Gemini, OpenRouter, and other provider/API integrations
- Owner: OpenClaw SecOps
- Purpose: Model/provider execution in local, CI, and live validation paths
- Storage location reference: GitHub Actions repository secrets, `~/.openclaw/.env`, `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`, and documented 1Password item references
- Rotation interval: 90 days or immediately after suspected exposure
- Last verified date: 2026-07-05
- Emergency revocation path: Revoke provider key at vendor, replace GitHub Actions secret or auth-profile reference, verify old credential is inactive
- Completeness: FULL
- Gap: None observed at metadata-reference level

### 5. Service Environment and Channel Secrets
- System/provider: Gateway auth, channel bot tokens, setup tokens, APNs/runtime secrets
- Owner: OpenClaw SecOps
- Purpose: Secure gateway access and channel/runtime integration
- Storage location reference: `~/.openclaw/credentials/`, tokenFile/config/env or SecretRef providers, GitHub Actions secrets, and release-owner vault references where documented
- Rotation interval: 90 days or immediately after suspected exposure
- Last verified date: 2026-07-05
- Emergency revocation path: Disable token or app secret at provider, replace file/env/SecretRef reference, verify unauthorized requests fail
- Completeness: FULL
- Gap: None observed at metadata-reference level

### 6. Emergency Recovery and Decryption Material
- System/provider: Auth-profile secret dir, signing-password custody, backup/decryption material
- Owner: Security owner / release owner
- Purpose: Recover encrypted auth stores and signing/recovery material after loss event
- Storage location reference: `OPENCLAW_AUTH_PROFILE_SECRET_DIR` host path and release-owner vault for `MATCH_PASSWORD`; backup-key custody reference not populated in Atlas repository
- Rotation interval: Quarterly verification and rotate on suspected compromise
- Last verified date: 2026-07-05
- Emergency revocation path: Rotate vault-held secret or decryption material, re-encrypt dependent stores, verify only replacement material works
- Completeness: PARTIAL
- Gap: Backup encryption-key custody is not concretely recorded in Atlas repository artifacts

## Evidence Basis
- `openclaw/.env.example`
- `openclaw/.github/workflows/ci-check-testbox.yml`
- `openclaw/.agents/skills/openclaw-qa-testing/SKILL.md`
- `openclaw/AGENTS.md`
- `openclaw/docs/gateway/security/index.md`
- `openclaw/apps/ios/fastlane/SETUP.md`

## Inventory Rule Applied
Inventory completeness requires concrete custody references, not role-only expectations.
Where the evidence provided only policy-level intent, the inventory entry remains partial.