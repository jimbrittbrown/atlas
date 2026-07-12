# Framer Read Engine v2 Capability Report

## Result
- Status: PASS
- Connected: YES
- Mode: LIVE
- Available Methods Detected: 4

## Supported Endpoints
- projectMetadata.projectInfo via getProjectInfo
- pageMetadata.pages via getNodesWithType
- cmsCollections.collections via getCollections
- cmsCollections.managedCollections via getManagedCollections
- styles.colorStyles via getColorStyles
- styles.textStyles via getTextStyles
- components.componentNodes via getNodesWithType
- fonts.fonts via getFonts
- navigation.redirects via getRedirects
- publishingMetadata.publishInfo via getPublishInfo
- publishingMetadata.deployments via getDeployments

## Unsupported Endpoints
- projectMetadata.branchMetadata: No detected API method for branchMetadata.
- projectMetadata.activeBranchMetadata: No detected API method for activeBranchMetadata.
- assets.assetInventory: No detected API method for assetInventory.
- images.imageInventory: No detected API method for imageInventory.
- variables.variables: No detected API method for variables.
- analyticsMetadata.analyticsSummary: No detected API method for analyticsSummary.
- projectMetadata.versions: No detected API method for versions.

## Limitations
- No detected API method for branchMetadata.
- No detected API method for activeBranchMetadata.
- No detected API method for assetInventory.
- No detected API method for imageInventory.
- No detected API method for variables.
- No detected API method for analyticsSummary.
- No detected API method for versions.

## Recommended Future Write Operations
- Controlled CMS upsert workflow after CEO write authorization
- Policy-gated preview publish flow in sandbox branch
- CEO-approved production deploy workflow with explicit ticket evidence
- Asset replacement workflow with idempotency and rollback checkpoints
- Project duplication and branch promotion workflow after governance approval

## Categories
```json
{
  "projectMetadata": {
    "category": "projectMetadata",
    "operations": [
      {
        "operationId": "projectInfo",
        "description": "Connected project metadata",
        "methodName": "getProjectInfo",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "object",
          "keys": [
            "apiVersion1Id",
            "id",
            "name"
          ]
        },
        "limitation": null
      },
      {
        "operationId": "branchMetadata",
        "description": "Project branch metadata",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for branchMetadata."
      },
      {
        "operationId": "activeBranchMetadata",
        "description": "Active branch metadata",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for activeBranchMetadata."
      },
      {
        "operationId": "versions",
        "description": "Project version metadata",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for versions."
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "projectInfo",
        "methodName": "getProjectInfo"
      }
    ],
    "unsupportedEndpoints": [
      {
        "operationId": "branchMetadata",
        "methodName": null,
        "reason": "No detected API method for branchMetadata."
      },
      {
        "operationId": "activeBranchMetadata",
        "methodName": null,
        "reason": "No detected API method for activeBranchMetadata."
      },
      {
        "operationId": "versions",
        "methodName": null,
        "reason": "No detected API method for versions."
      }
    ],
    "limitations": [
      "No detected API method for branchMetadata.",
      "No detected API method for activeBranchMetadata.",
      "No detected API method for versions."
    ]
  },
  "pageMetadata": {
    "category": "pageMetadata",
    "operations": [
      {
        "operationId": "pages",
        "description": "Page metadata and routing nodes",
        "methodName": "getNodesWithType",
        "supported": true,
        "callable": true,
        "requiresArguments": true,
        "valueSummary": {
          "type": "array",
          "length": 1
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "pages",
        "methodName": "getNodesWithType"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "cmsCollections": {
    "category": "cmsCollections",
    "operations": [
      {
        "operationId": "collections",
        "description": "CMS collections",
        "methodName": "getCollections",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      },
      {
        "operationId": "managedCollections",
        "description": "Managed CMS collections",
        "methodName": "getManagedCollections",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "collections",
        "methodName": "getCollections"
      },
      {
        "operationId": "managedCollections",
        "methodName": "getManagedCollections"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "assets": {
    "category": "assets",
    "operations": [
      {
        "operationId": "assetInventory",
        "description": "Asset inventory metadata",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for assetInventory."
      }
    ],
    "supportedEndpoints": [],
    "unsupportedEndpoints": [
      {
        "operationId": "assetInventory",
        "methodName": null,
        "reason": "No detected API method for assetInventory."
      }
    ],
    "limitations": [
      "No detected API method for assetInventory."
    ]
  },
  "images": {
    "category": "images",
    "operations": [
      {
        "operationId": "imageInventory",
        "description": "Image asset metadata",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for imageInventory."
      }
    ],
    "supportedEndpoints": [],
    "unsupportedEndpoints": [
      {
        "operationId": "imageInventory",
        "methodName": null,
        "reason": "No detected API method for imageInventory."
      }
    ],
    "limitations": [
      "No detected API method for imageInventory."
    ]
  },
  "styles": {
    "category": "styles",
    "operations": [
      {
        "operationId": "colorStyles",
        "description": "Color style metadata",
        "methodName": "getColorStyles",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      },
      {
        "operationId": "textStyles",
        "description": "Text style metadata",
        "methodName": "getTextStyles",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "colorStyles",
        "methodName": "getColorStyles"
      },
      {
        "operationId": "textStyles",
        "methodName": "getTextStyles"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "components": {
    "category": "components",
    "operations": [
      {
        "operationId": "componentNodes",
        "description": "Component node metadata",
        "methodName": "getNodesWithType",
        "supported": true,
        "callable": true,
        "requiresArguments": true,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "componentNodes",
        "methodName": "getNodesWithType"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "variables": {
    "category": "variables",
    "operations": [
      {
        "operationId": "variables",
        "description": "Variable definitions and bindings",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for variables."
      }
    ],
    "supportedEndpoints": [],
    "unsupportedEndpoints": [
      {
        "operationId": "variables",
        "methodName": null,
        "reason": "No detected API method for variables."
      }
    ],
    "limitations": [
      "No detected API method for variables."
    ]
  },
  "fonts": {
    "category": "fonts",
    "operations": [
      {
        "operationId": "fonts",
        "description": "Font metadata",
        "methodName": "getFonts",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 9486
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "fonts",
        "methodName": "getFonts"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "navigation": {
    "category": "navigation",
    "operations": [
      {
        "operationId": "redirects",
        "description": "Redirect and navigation metadata",
        "methodName": "getRedirects",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "redirects",
        "methodName": "getRedirects"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "publishingMetadata": {
    "category": "publishingMetadata",
    "operations": [
      {
        "operationId": "publishInfo",
        "description": "Publish metadata for staging and production",
        "methodName": "getPublishInfo",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "object",
          "keys": [
            "production",
            "staging"
          ]
        },
        "limitation": null
      },
      {
        "operationId": "deployments",
        "description": "Deployment history metadata",
        "methodName": "getDeployments",
        "supported": true,
        "callable": true,
        "requiresArguments": false,
        "valueSummary": {
          "type": "array",
          "length": 0
        },
        "limitation": null
      }
    ],
    "supportedEndpoints": [
      {
        "operationId": "publishInfo",
        "methodName": "getPublishInfo"
      },
      {
        "operationId": "deployments",
        "methodName": "getDeployments"
      }
    ],
    "unsupportedEndpoints": [],
    "limitations": []
  },
  "analyticsMetadata": {
    "category": "analyticsMetadata",
    "operations": [
      {
        "operationId": "analyticsSummary",
        "description": "Analytics metadata when exposed by API context",
        "methodName": null,
        "supported": false,
        "callable": false,
        "requiresArguments": false,
        "valueSummary": null,
        "limitation": "No detected API method for analyticsSummary."
      }
    ],
    "supportedEndpoints": [],
    "unsupportedEndpoints": [
      {
        "operationId": "analyticsSummary",
        "methodName": null,
        "reason": "No detected API method for analyticsSummary."
      }
    ],
    "limitations": [
      "No detected API method for analyticsSummary."
    ]
  }
}
```

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
