# Executive Mission Control API v1 Report

- Status: PASS
- Generated: 2026-07-11T19:14:38.638Z
- missionId: mis_869df859-d31c-4ffc-b7bf-20a6c39ec202
- finalMissionState: CANCELLED
- auditEventCount: 6

## Checks
- viewer can list mission control projection: PASS
- viewer can read mission detail: PASS
- executive pause command accepted: PASS
- executive resume command accepted: PASS
- executive rollback is forbidden: PASS
- ceo rollback command accepted: PASS
- ceo cancel command accepted: PASS
- duplicate idempotency key rejected: PASS

## Routes Validated
- GET /api/v1/mission-control
- GET /api/v1/mission-control/:missionId
- POST /api/v1/mission-control/:missionId/pause
- POST /api/v1/mission-control/:missionId/resume
- POST /api/v1/mission-control/:missionId/rollback
- POST /api/v1/mission-control/:missionId/cancel
