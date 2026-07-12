# Website Business Launch Stack v1

## Mission
Operate Atlas as a real website business by reusing existing architecture for public website, customer intake, authentication, customer dashboard, delivery governance, and executive visibility.

## Reuse Strategy
- Mission Control and Customer Intake Engine for request routing
- Customer Registry and Customer Portal session/account persistence
- Mission Registry and Workforce Director for project state and assignments
- Website Production Manager for QA/review delivery projection
- Executive Operations Dashboard for leadership visibility metrics
- Existing API auth/role model and read-only governance controls

## Phase Coverage

### Phase 1: Public Website
Frontend routes now provide:
- Home
- Services
- Portfolio
- Pricing
- Process
- FAQ
- Contact

These pages consume existing executive snapshot data (mission records, portfolio estimate, launch metrics).

### Phase 2: Lead Intake
Contact/request captures required fields:
- company information
- business type
- website URL (optional)
- goals
- desired pages
- branding assets
- budget
- timeline

Submission routes through existing customer portal manager and creates WEBSITE_BUILD missions via Mission Control.

### Phase 3: Customer Authentication
Customer login endpoint reuses:
- Customer Registry lookup
- Existing customer account/session persistence
- Existing API token auth model and customer role permissions

No duplicate auth model introduced.

### Phase 4: Customer Dashboard
Project views read from mission and portal records and include:
- Current projects
- Mission status
- Messages
- Revision requests
- Files
- Downloads
- Invoices (placeholder)
- Timeline
- QA results

### Phase 5: Website Delivery
Customer delivery flow includes:
- Progress tracking
- Delivery package references
- Revision requests
- Completion approval action

Governance is preserved:
- No publish
- No deploy
- No destructive operations
- CEO approval gate remains required

### Phase 6: Executive Visibility
Dashboard now includes website business launch metrics:
- New leads
- Active customers
- Website projects
- Revenue pipeline (estimated)
- Projects awaiting approval
- Revision queue
- Customer satisfaction placeholder

### Phase 7: Validation
Validation command:
- `npm run executive:website-business-launch-stack:v1:validate`

Outputs:
- `../review/website-business-launch-stack-v1-report.json`
- `../review/website-business-launch-stack-v1-report.md`

Validation covers customer creation, mission routing, login, dashboard rendering, production integration, delivery package references, executive dashboard integration, and governance checks.
