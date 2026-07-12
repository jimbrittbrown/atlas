import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { appendEvent, getMetaMap, setMetaValue } from '../storage/provider-backed-state.js';
import { DataAvailabilityStatuses } from './executive-operations-dashboard-contracts.js';
import {
	SignedArtifactDeliveryStates,
	SignedArtifactKinds,
	createSignedArtifactPackage,
	createSignedDeliveryAuthorization
} from './signed-artifact-delivery-contracts.js';

function nowIso(nowFn) {
	return nowFn?.() ?? new Date().toISOString();
}

function toArray(value) {
	return Array.isArray(value) ? value : [];
}

function hashSecret(secret) {
	return createHash('sha256').update(String(secret ?? '')).digest('hex');
}

function compareHash(left, right) {
	const leftBuffer = Buffer.from(String(left ?? ''), 'hex');
	const rightBuffer = Buffer.from(String(right ?? ''), 'hex');
	if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function createToken({ authorizationId, secret }) {
	return `sda_${authorizationId}.${secret}`;
}

function parseToken(token) {
	const text = String(token ?? '').trim();
	if (!text.startsWith('sda_')) {
		return { valid: false, authorizationId: null, secret: null };
	}

	const withoutPrefix = text.slice(4);
	const dotIndex = withoutPrefix.indexOf('.');
	if (dotIndex <= 0) {
		return { valid: false, authorizationId: null, secret: null };
	}

	return {
		valid: true,
		authorizationId: withoutPrefix.slice(0, dotIndex),
		secret: withoutPrefix.slice(dotIndex + 1)
	};
}

function createPackageArtifacts({ mission, review } = {}) {
	const missionStatus = String(mission?.executiveStatus ?? '').toUpperCase();
	const reviewState = String(review?.state ?? '').toUpperCase();
	const packageAvailable = ['COMPLETED', 'AWAITING_EXECUTIVE_REVIEW'].includes(missionStatus) || reviewState === 'AWAITING_CEO_APPROVAL';
	const hasReview = Boolean(review);

	return [
		{
			artifactId: SignedArtifactKinds.WEBSITE_PACKAGE,
			label: 'Website Package',
			fileName: 'website-package.zip',
			mimeType: 'application/zip',
			available: missionStatus === 'COMPLETED',
			authorizationRequired: true,
			deliveryStatus: missionStatus === 'COMPLETED' ? 'READY' : 'PENDING'
		},
		{
			artifactId: SignedArtifactKinds.BRAND_GUIDE,
			label: 'Brand Guide',
			fileName: 'website-builder-mission-v1-report.md',
			mimeType: 'text/markdown',
			available: packageAvailable,
			authorizationRequired: true,
			deliveryStatus: packageAvailable ? 'READY' : 'PENDING'
		},
		{
			artifactId: SignedArtifactKinds.QA_REPORT,
			label: 'QA Report',
			fileName: hasReview ? 'website-production-execution-pipeline-v1-report.md' : 'website-production-manager-v1-report.md',
			mimeType: 'text/markdown',
			available: true,
			authorizationRequired: true,
			deliveryStatus: 'READY'
		},
		{
			artifactId: SignedArtifactKinds.EXECUTIVE_REVIEW_PACKAGE,
			label: 'Executive Review Package',
			fileName: 'website-executive-review-package-v1-report.md',
			mimeType: 'text/markdown',
			available: true,
			authorizationRequired: true,
			deliveryStatus: 'READY'
		},
		{
			artifactId: SignedArtifactKinds.DELIVERY_SUMMARY,
			label: 'Delivery Summary',
			fileName: hasReview ? 'website-production-execution-pipeline-v1-report.json' : 'website-production-manager-v1-report.json',
			mimeType: 'application/json',
			available: true,
			authorizationRequired: true,
			deliveryStatus: 'READY'
		}
	];
}

export class SignedArtifactDeliveryManager {
	constructor({
		missionControl,
		websiteProductionManager,
		storageProvider,
		now,
		logger,
		namespace = 'executive.signed-artifact-delivery'
	} = {}) {
		this.missionControl = missionControl ?? null;
		this.websiteProductionManager = websiteProductionManager ?? null;
		this.storageProvider = storageProvider ?? null;
		this.now = now;
		this.logger = logger ?? { log: () => {} };
		this.namespace = namespace;
		this.packages = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.packages` });
		this.authorizations = getMetaMap({ provider: this.storageProvider, namespace: `${this.namespace}.authorizations` });
	}

	persistPackage(record) {
		if (!record?.packageId) return;
		this.packages.set(record.packageId, record);
		setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.packages`, key: record.packageId, value: record });
	}

	persistAuthorization(record) {
		if (!record?.authorizationId) return;
		this.authorizations.set(record.authorizationId, record);
		setMetaValue({ provider: this.storageProvider, namespace: `${this.namespace}.authorizations`, key: record.authorizationId, value: record });
	}

	recordEvent(type, details = {}) {
		const event = {
			eventId: `sda_evt_${randomBytes(8).toString('hex')}`,
			type,
			at: nowIso(this.now),
			...details
		};
		appendEvent({ provider: this.storageProvider, namespace: `${this.namespace}.events`, key: event.eventId, value: event });
		return event;
	}

	resolveMission(projectId) {
		if (!projectId) return null;
		return this.missionControl?.missionRegistry?.getMissionById?.(projectId) ?? null;
	}

	resolveReview(missionId) {
		return (this.websiteProductionManager?.listReviews?.() ?? []).find((review) => review.missionId === missionId) ?? null;
	}

	ensurePackage({ customerId, projectId } = {}) {
		const mission = this.resolveMission(projectId);
		if (!mission) {
			return { found: false, status: 404, code: 'NOT_FOUND', reason: 'Mission not found.', package: null };
		}

		if (customerId && mission.customerId !== customerId) {
			return { found: false, status: 403, code: 'FORBIDDEN', reason: 'Mission does not belong to customer.', package: null };
		}

		const eligible = ['ACTIVE', 'AWAITING_EXECUTIVE_REVIEW', 'COMPLETED'].includes(String(mission.executiveStatus ?? '').toUpperCase());
		if (!eligible) {
			return { found: false, status: 409, code: 'INVALID_STATE', reason: 'Downloads unavailable for current mission state.', package: null };
		}

		const review = this.resolveReview(mission.missionId);
		const existing = this.packages.get(mission.missionId) ?? null;
		const artifacts = createPackageArtifacts({ mission, review });
		const packageRecord = existing ?? createSignedArtifactPackage({
			customerId: mission.customerId,
			missionId: mission.missionId,
			projectId,
			requestedBy: 'CUSTOMER_PORTAL',
			sourceReviewId: review?.reviewId ?? null,
			status: review ? SignedArtifactDeliveryStates.READY : SignedArtifactDeliveryStates.PARTIAL,
			approvedAt: review?.updatedAt ?? null,
			approvedBy: review?.requestedBy ?? null,
			artifacts
		});

		const updated = {
			...packageRecord,
			customerId: mission.customerId,
			missionId: mission.missionId,
			projectId,
			status: review ? SignedArtifactDeliveryStates.READY : SignedArtifactDeliveryStates.PARTIAL,
			sourceReviewId: review?.reviewId ?? null,
			approvedAt: review?.updatedAt ?? null,
			approvedBy: review?.requestedBy ?? null,
			artifacts
		};
		this.persistPackage(updated);
		return { found: true, status: 200, code: 'OK', reason: null, package: updated };
	}

	listDownloads({ customerId, projectId } = {}) {
		const packageResult = this.ensurePackage({ customerId, projectId });
		if (!packageResult.found) return packageResult;

		return {
			found: true,
			status: 200,
			code: 'OK',
			reason: null,
			data: {
				missionId: packageResult.package.missionId,
				packageId: packageResult.package.packageId,
				status: packageResult.package.status,
				downloads: packageResult.package.artifacts.map((artifact) => {
					const activeAuthorization = Array.from(this.authorizations.values()).find((record) => record.packageId === packageResult.package.packageId && record.artifactId === artifact.artifactId && record.status === SignedArtifactDeliveryStates.ISSUED && (!record.expiresAt || Date.parse(record.expiresAt) > Date.now())) ?? null;
					return {
						artifactId: artifact.artifactId,
						label: artifact.label,
						fileName: artifact.fileName,
						mimeType: artifact.mimeType,
						available: Boolean(artifact.available),
						authorizationRequired: artifact.authorizationRequired,
						deliveryStatus: artifact.deliveryStatus,
						authorizationStatus: activeAuthorization ? 'ISSUED' : 'NOT_ISSUED',
						authorizationId: activeAuthorization?.authorizationId ?? null,
						expiresAt: activeAuthorization?.expiresAt ?? null
					};
				})
			}
		};
	}

	issueAuthorization({ customerId, projectId, artifactId, requestedBy = 'CUSTOMER_PORTAL', expiresInMs = 15 * 60 * 1000 } = {}) {
		const packageResult = this.ensurePackage({ customerId, projectId });
		if (!packageResult.found) return packageResult;

		const artifact = packageResult.package.artifacts.find((item) => item.artifactId === artifactId) ?? null;
		if (!artifact) {
			return { found: false, status: 404, code: 'NOT_FOUND', reason: 'Artifact not found for project.', data: null };
		}

		if (!artifact.available) {
			return { found: false, status: 409, code: 'INVALID_STATE', reason: 'Artifact is not yet available for signed delivery.', data: null };
		}

		const issuedAt = nowIso(this.now);
		const requestedExpiryMs = Number.parseInt(String(expiresInMs ?? ''), 10);
		const expiryMs = Number.isFinite(requestedExpiryMs) && requestedExpiryMs > 0 ? requestedExpiryMs : 15 * 60 * 1000;
		const expiresAt = new Date(Date.parse(issuedAt) + expiryMs).toISOString();
		const authorization = createSignedDeliveryAuthorization({
			packageId: packageResult.package.packageId,
			customerId: packageResult.package.customerId,
			missionId: packageResult.package.missionId,
			artifactId: artifact.artifactId,
			issuedAt,
			expiresAt,
			issuedBy: requestedBy
		});
		const secret = randomBytes(24).toString('hex');
		authorization.tokenHash = hashSecret(secret);
		this.persistAuthorization(authorization);
		this.recordEvent('authorization_issued', {
			customerId: authorization.customerId,
			missionId: authorization.missionId,
			packageId: authorization.packageId,
			authorizationId: authorization.authorizationId,
			artifactId: authorization.artifactId
		});

		return {
			found: true,
			status: 200,
			code: 'OK',
			reason: null,
			data: {
				authorizationId: authorization.authorizationId,
				packageId: authorization.packageId,
				missionId: authorization.missionId,
				customerId: authorization.customerId,
				artifactId: authorization.artifactId,
				issuedAt: authorization.issuedAt,
				expiresAt: authorization.expiresAt,
				status: authorization.status,
				deliveryToken: createToken({ authorizationId: authorization.authorizationId, secret }),
				artifact: {
					artifactId: artifact.artifactId,
					label: artifact.label,
					fileName: artifact.fileName,
					mimeType: artifact.mimeType
				}
			}
		};
	}

	redeemAuthorization({ customerId, authorizationToken } = {}) {
		const parsed = parseToken(authorizationToken);
		if (!parsed.valid) {
			return { found: false, status: 400, code: 'INVALID_REQUEST', reason: 'Delivery token is malformed.', data: null };
		}

		const authorization = this.authorizations.get(parsed.authorizationId) ?? null;
		if (!authorization) {
			return { found: false, status: 404, code: 'NOT_FOUND', reason: 'Delivery authorization not found.', data: null };
		}

		if (customerId && authorization.customerId !== customerId) {
			return { found: false, status: 403, code: 'FORBIDDEN', reason: 'Delivery authorization does not belong to customer.', data: null };
		}

		if (!compareHash(authorization.tokenHash, hashSecret(parsed.secret))) {
			return { found: false, status: 401, code: 'UNAUTHORIZED', reason: 'Delivery token validation failed.', data: null };
		}

		if (authorization.revokedAt) {
			return { found: false, status: 409, code: 'INVALID_STATE', reason: 'Delivery authorization has been revoked.', data: null };
		}

		if (authorization.redeemedAt) {
			return { found: false, status: 409, code: 'INVALID_STATE', reason: 'Delivery authorization has already been redeemed.', data: null };
		}

		if (Date.parse(String(authorization.expiresAt ?? '')) <= Date.now()) {
			const expired = { ...authorization, status: SignedArtifactDeliveryStates.EXPIRED };
			this.persistAuthorization(expired);
			this.recordEvent('authorization_expired', {
				customerId: expired.customerId,
				missionId: expired.missionId,
				packageId: expired.packageId,
				authorizationId: expired.authorizationId,
				artifactId: expired.artifactId
			});
			return { found: false, status: 409, code: 'INVALID_STATE', reason: 'Delivery authorization has expired.', data: null };
		}

		const redeemedAt = nowIso(this.now);
		const updated = { ...authorization, status: SignedArtifactDeliveryStates.REDEEMED, redeemedAt };
		this.persistAuthorization(updated);
		this.recordEvent('authorization_redeemed', {
			customerId: updated.customerId,
			missionId: updated.missionId,
			packageId: updated.packageId,
			authorizationId: updated.authorizationId,
			artifactId: updated.artifactId
		});

		const packageRecord = this.packages.get(updated.packageId) ?? null;
		const artifact = packageRecord?.artifacts?.find((item) => item.artifactId === updated.artifactId) ?? null;

		return {
			found: true,
			status: 200,
			code: 'OK',
			reason: null,
			data: {
				authorizationId: updated.authorizationId,
				packageId: updated.packageId,
				missionId: updated.missionId,
				customerId: updated.customerId,
				artifactId: updated.artifactId,
				redeemedAt,
				expiresAt: updated.expiresAt,
				status: updated.status,
				delivery: artifact ? {
					artifactId: artifact.artifactId,
					label: artifact.label,
					fileName: artifact.fileName,
					mimeType: artifact.mimeType,
					status: artifact.deliveryStatus
				} : null
			}
		};
	}

	revokeAuthorizations({ projectId, customerId, reason = 'REVOKED' } = {}) {
		const mission = this.resolveMission(projectId);
		if (!mission) return 0;
		if (customerId && mission.customerId !== customerId) return 0;

		let count = 0;
		for (const record of this.authorizations.values()) {
			if (record.missionId !== mission.missionId) continue;
			if (record.revokedAt) continue;
			const updated = { ...record, status: SignedArtifactDeliveryStates.REVOKED, revokedAt: nowIso(this.now), revocationReason: reason };
			this.persistAuthorization(updated);
			count += 1;
		}

		if (count > 0) {
			this.recordEvent('authorizations_revoked', {
				customerId: mission.customerId,
				missionId: mission.missionId,
				reason,
				count
			});
		}

		return count;
	}

	getDashboardProjection() {
		const packages = Array.from(this.packages.values());
		const authorizations = Array.from(this.authorizations.values());
		const active = authorizations.filter((record) => record.status === SignedArtifactDeliveryStates.ISSUED && (!record.expiresAt || Date.parse(record.expiresAt) > Date.now()));
		return {
			status: packages.length > 0 ? DataAvailabilityStatuses.AVAILABLE : DataAvailabilityStatuses.PARTIAL,
			totalPackages: packages.length,
			totalAuthorizations: authorizations.length,
			activeAuthorizations: active.length,
			redeemedAuthorizations: authorizations.filter((record) => record.status === SignedArtifactDeliveryStates.REDEEMED).length,
			revokedAuthorizations: authorizations.filter((record) => record.status === SignedArtifactDeliveryStates.REVOKED).length,
			expiredAuthorizations: authorizations.filter((record) => record.status === SignedArtifactDeliveryStates.EXPIRED).length,
			packages: packages.map((record) => ({
				packageId: record.packageId,
				missionId: record.missionId,
				customerId: record.customerId,
				status: record.status,
				artifacts: toArray(record.artifacts).length,
				approvedAt: record.approvedAt,
				createdAt: record.createdAt
			}))
		};
	}
}