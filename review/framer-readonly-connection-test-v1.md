# Framer Read-Only Connection Test v1

## Result
- Status: PASS
- Authenticated: YES
- Read-Only Enforcement: YES
- Network Writes Executed: NO
- Publish Executed: NO

## Read Operations
- Workspace read attempted: YES
- Project read attempted: YES
- Site read attempted: YES

## Warnings
- Workspace listing is not exposed by detected Server API methods in this context.
- Project listing is not exposed by detected Server API methods in this context.
- Site listing is not exposed by detected Server API methods in this context.

## Blocking Issues
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

## Connection Report
```json
{
  "connected": true,
  "workspace": {
    "supported": false,
    "methodName": null,
    "value": null
  },
  "projects": {
    "supported": false,
    "methodName": null,
    "value": null
  },
  "sites": {
    "supported": false,
    "methodName": null,
    "value": null
  },
  "projectInfo": {
    "supported": true,
    "methodName": "getProjectInfo",
    "value": {
      "id": "6167a254412e149ea2bd471f3bc08352a2820b42f218dfb507e7195432885000",
      "name": "Atlas Sandbox",
      "apiVersion1Id": "3789531436"
    }
  },
  "publishInfo": {
    "supported": true,
    "methodName": "getPublishInfo",
    "value": {
      "production": null,
      "staging": null
    }
  },
  "mode": "LIVE",
  "limitations": [
    "Workspace listing is not exposed by detected Server API methods in this context.",
    "Project listing is not exposed by detected Server API methods in this context.",
    "Site listing is not exposed by detected Server API methods in this context."
  ]
}
```
