import { randomUUID } from 'node:crypto';

export const SignedArtifactDeliveryStates = Object.freeze({
	READY: 'READY',
	PARTIAL: 'PARTIAL',
	ISSUED: 'ISSUED',
	REDEEMED: 'REDEEMED',
	REVOKED: 'REVOKED',
	EXPIRED: 'EXPIRED',
	UNAVAILABLE: 'UNAVAILABLE'
});

export const SignedArtifactKinds = Object.freeze({
	WEBSITE_PACKAGE: 'WEBSITE_PACKAGE',
	BRAND_GUIDE: 'BRAND_GUIDE',
	QA_REPORT: 'QA_REPORT',
	EXECUTIVE_REVIEW_PACKAGE: 'EXECUTIVE_REVIEW_PACKAGE',
	DELIVERY_SUMMARY: 'DELIVERY_SUMMARY'
});

export function createSignedArtifactPackage({
	packageId,
	customerId,
	missionId,
	projectId = null,
	requestedBy = 'CUSTOMER_PORTAL',
	sourceReviewId = null,
	status = SignedArtifactDeliveryStates.PARTIAL,
	createdAt = new Date().toISOString(),
	approvedAt = null,
	approvedBy = null,
	revokedAt = null,
	artifacts = []
} = {}) {
	return {
		packageId: packageId ?? `sap_${randomUUID()}`,
		customerId,
		missionId,
		projectId,
		requestedBy,
		sourceReviewId,
		status,
		createdAt,
		approvedAt,
		approvedBy,
		revokedAt,
		artifacts: Array.isArray(artifacts) ? artifacts : []
	};
}

export function createSignedDeliveryAuthorization({
	authorizationId,
	packageId,
	customerId,
	missionId,
	artifactId,
	expiresAt,
	issuedAt = new Date().toISOString(),
	status = SignedArtifactDeliveryStates.ISSUED,
	issuedBy = 'CUSTOMER_PORTAL',
	redeemedAt = null,
	revokedAt = null,
	tokenHash = null
} = {}) {
	return {
		authorizationId: authorizationId ?? `sda_${randomUUID()}`,
		packageId,
		customerId,
		missionId,
		artifactId,
		issuedAt,
		expiresAt,
		status,
		issuedBy,
		redeemedAt,
		revokedAt,
		tokenHash
	};
}