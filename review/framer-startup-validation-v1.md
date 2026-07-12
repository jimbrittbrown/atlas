# Framer Startup Validation v1 (Offline)

## Result
- Status: PASS
- Network Requests: NONE

## Checks
- Environment variables exist: PASS
- API key format valid: PASS
- Project URL format valid: PASS
- Configuration complete and policy-valid: PASS

## Required Variables
- FRAMER_PROJECT_URL
- FRAMER_API_KEY
- FRAMER_READ_ONLY
- FRAMER_LIVE_MODE
- FRAMER_DRY_RUN
- FRAMER_ALLOW_PREVIEW_PUBLISH
- FRAMER_ALLOW_PRODUCTION_DEPLOY
- FRAMER_ALLOW_PROJECT_DUPLICATION

## Missing Variables
- None

## Issues
- None

## Redacted Configuration
```json
{
  "projectUrl": "https://framer.com/projects/Atlas-Sandbox--et8OSabDDPQDIAZaWphw-e3M7c",
  "apiKey": "***REDACTED***",
  "apiKeyEnvVarName": "FRAMER_API_KEY",
  "readOnly": true,
  "liveMode": true,
  "dryRun": false,
  "allowPreviewPublish": false,
  "allowProductionDeploy": false,
  "allowProjectDuplication": false,
  "maxRetries": 2,
  "retryDelayMs": 250,
  "requestTimeoutMs": 30000,
  "externalAgentEnabled": true,
  "pluginFallbackEnabled": true
}
```
