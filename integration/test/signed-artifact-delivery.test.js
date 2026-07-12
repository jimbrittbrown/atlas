import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerIntakeMissionControl } from '../src/executive/customer-intake-mission-control.js';
import { ExecutivePlanningSystem } from '../src/executive/executive-planning-system.js';
import { CustomerPortalManager } from '../src/executive/customer-portal-manager.js';
import { ExecutiveOperationsDashboard } from '../src/executive/executive-operations-dashboard.js';
import { ExecutiveOperationsDashboardManager } from '../src/executive/executive-operations-dashboard-manager.js';
import { ExecutiveDashboardApiService } from '../src/executive/executive-dashboard-api-service.js';
import { ExecutiveDashboardApiAuth } from '../src/executive/executive-dashboard-api-auth.js';
import { ExecutiveDashboardApiRateLimiter } from '../src/executive/executive-dashboard-api-rate-limiter.js';

function createPortalRuntime({ now } = {}) {
	const missionControl = new CustomerIntakeMissionControl();
	const planning = new ExecutivePlanningSystem({ missionControl });
	const customerPortalManager = new CustomerPortalManager({
		missionControl,
		executivePlanningSystem: planning,
		workforceDirector: missionControl.workforceDirector,
		now
	});
	const manager = new ExecutiveOperationsDashboardManager({
		missionControl,
		executivePlanningSystem: planning,
		customerPortalManager
	});
	return { missionControl, planning, customerPortalManager, manager };
}

function createApiRuntime() {
	const { customerPortalManager, manager } = createPortalRuntime();
	const dashboard = new ExecutiveOperationsDashboard({ manager });
	const api = new ExecutiveDashboardApiService({
		dashboard,
		auth: new ExecutiveDashboardApiAuth({ env: {
			ATLAS_DASHBOARD_API_TOKEN_CUSTOMER: 'token-customer',
			ATLAS_DASHBOARD_API_TOKEN: 'token-ceo'
		} }),
		rateLimiter: new ExecutiveDashboardApiRateLimiter({ requestsPerWindow: 100, windowMs: 60000 }),
		env: {
			ATLAS_CUSTOMER_AUTH_TRANSPORT_MODE: 'development_token',
			ATLAS_CUSTOMER_AUTH_ALLOW_DEVELOPMENT_TOKEN_TRANSPORT: 'true'
		}
	});

	return { api, customerPortalManager };
}

async function callApi(api, { path, method = 'GET', body = {}, sessionToken = null, origin = null } = {}) {
	return api.handleRequest({
		path,
		method,
		body,
		headers: {
			...(sessionToken ? { 'x-customer-session-token': sessionToken } : {}),
			...(origin ? { origin } : {}),
			'x-client-id': 'signed-artifact-tests'
		}
	});
}

test('customer download listing and signed authorization flow work through the API', async () => {
	const { api } = createApiRuntime();

	await callApi(api, {
		path: '/api/v1/customer/register',
		method: 'POST',
		body: {
			email: 'artifact-api@example.com',
			password: 'atlas-pass-1234',
			companyName: 'Artifact API Co'
		}
	});

	const login = await callApi(api, {
		path: '/api/v1/customer/login',
		method: 'POST',
		body: {
			email: 'artifact-api@example.com',
			password: 'atlas-pass-1234'
		}
	});

	const sessionToken = login.envelope.data.sessionToken;

	const request = await callApi(api, {
		path: '/api/v1/customer/request',
		method: 'POST',
		sessionToken,
		body: {
			businessName: 'Signed Artifact Delivery',
			businessType: 'Professional Services',
			websiteUrl: 'https://signed-artifact.example',
			contactName: 'Artifact Owner',
			email: 'artifact-api@example.com',
			phone: '+1-555-0111',
			targetAudience: 'Customers',
			businessDescription: 'Validate signed delivery issuance.',
			goals: ['launch'],
			budget: '$5,000 - $10,000',
			timeline: '4 weeks',
			desiredPages: ['home', 'contact']
		}
	});

	const missionId = request.envelope.data.missionId;

	const listing = await callApi(api, {
		path: `/api/v1/customer/downloads/${missionId}`,
		method: 'GET',
		sessionToken
	});

	assert.equal(listing.httpStatus, 200);
	assert.equal(listing.envelope.data.downloads.length, 5);
	assert.equal(listing.envelope.data.downloads[2].authorizationStatus, 'NOT_ISSUED');

	const authorization = await callApi(api, {
		path: `/api/v1/customer/downloads/${missionId}/authorize`,
		method: 'POST',
		sessionToken,
		body: {
			artifactId: 'QA_REPORT',
			expiresInMs: 60000
		}
	});

	assert.equal(authorization.httpStatus, 200);
	assert.equal(typeof authorization.envelope.data.deliveryToken, 'string');

	const redeemed = await callApi(api, {
		path: '/api/v1/customer/downloads/redeem',
		method: 'POST',
		sessionToken,
		body: {
			authorizationToken: authorization.envelope.data.deliveryToken
		}
	});

	assert.equal(redeemed.httpStatus, 200);
	assert.equal(redeemed.envelope.data.status, 'REDEEMED');
	assert.equal(redeemed.envelope.data.delivery.artifactId, 'QA_REPORT');

	const replay = await callApi(api, {
		path: '/api/v1/customer/downloads/redeem',
		method: 'POST',
		sessionToken,
		body: {
			authorizationToken: authorization.envelope.data.deliveryToken
		}
	});

	assert.equal(replay.httpStatus, 409);
	assert.equal(['INVALID_STATE', 'INVALID_REQUEST'].includes(replay.envelope.error.code), true);
});

test('signed delivery authorizations expire and revoke fail closed', () => {
	let now = new Date('2026-01-01T00:00:00.000Z');
	const runtime = createPortalRuntime({ now: () => now.toISOString() });

	const created = runtime.customerPortalManager.submitWebsiteRequest({
		businessName: 'Expiry Guard Co',
		businessType: 'Services',
		websiteUrl: 'https://expiry-guard.example',
		contactName: 'Expiry Owner',
		email: 'expiry-guard@example.com',
		phone: '+1-555-0222',
		targetAudience: 'buyers',
		businessDescription: 'Validate expiry and revocation.',
		goals: ['launch'],
		budget: '$7,000 - $11,000',
		timeline: '5 weeks',
		desiredPages: ['home', 'contact']
	});

	const issue = runtime.customerPortalManager.issueDownloadAuthorization({
		customerId: created.data.customerId,
		projectId: created.data.missionId,
		artifactId: 'QA_REPORT',
		expiresInMs: 1000
	});

	assert.equal(issue.found, true);
	now = new Date(now.getTime() + 2000);

	const expired = runtime.customerPortalManager.redeemDownloadAuthorization({
		customerId: created.data.customerId,
		authorizationToken: issue.data.deliveryToken
	});

	assert.equal(expired.found, false);
	assert.equal(expired.code, 'INVALID_STATE');

	const issuedAgain = runtime.customerPortalManager.issueDownloadAuthorization({
		customerId: created.data.customerId,
		projectId: created.data.missionId,
		artifactId: 'QA_REPORT',
		expiresInMs: 60000
	});

	const revokedCount = runtime.customerPortalManager.artifactDeliveryManager.revokeAuthorizations({
		customerId: created.data.customerId,
		projectId: created.data.missionId,
		reason: 'MANUAL_REVOKE'
	});

	assert.equal(revokedCount >= 1, true);

	const revoked = runtime.customerPortalManager.redeemDownloadAuthorization({
		customerId: created.data.customerId,
		authorizationToken: issuedAgain.data.deliveryToken
	});

	assert.equal(revoked.found, false);
	assert.equal(revoked.code, 'INVALID_STATE');
});