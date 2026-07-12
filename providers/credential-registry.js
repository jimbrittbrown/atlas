const {
  CredentialStatuses,
  normalizeCredentialStatus,
  createCredentialRecord,
  validateCredentialRecord,
  createCredentialValidationResult
} = require('./credential-registry-contracts.js');

class CredentialRegistry {
  constructor({ environment = 'production', initialCredentials = [] } = {}) {
    this.environment = String(environment).toLowerCase().trim();
    this.credentials = new Map();

    initialCredentials.forEach(credential => {
      this.registerCredential(credential);
    });
  }

  registerCredential(credentialInput = {}) {
    const credential = createCredentialRecord(credentialInput);
    const validation = validateCredentialRecord(credential);

    if (!validation.isValid) {
      throw new Error(`Invalid credential: ${validation.issues.map(issue => issue.issue).join(', ')}`);
    }

    if (this.credentials.has(credential.credentialId)) {
      throw new Error(`Credential already registered: ${credential.credentialId}`);
    }

    this.credentials.set(credential.credentialId, Object.freeze({ ...credential }));

    return this.credentials.get(credential.credentialId);
  }

  hasCredential(credentialId) {
    return this.credentials.has(String(credentialId ?? '').toUpperCase().trim());
  }

  getCredential(credentialId) {
    const normalized = String(credentialId ?? '').toUpperCase().trim();
    const credential = this.credentials.get(normalized);

    if (!credential) {
      throw new Error(`Unknown credential: ${normalized}`);
    }

    return credential;
  }

  listCredentials() {
    return [...this.credentials.values()];
  }

  listCredentialsByProvider(providerId) {
    const normalizedProviderId = String(providerId ?? '').toUpperCase().trim();

    return this.listCredentials().filter(credential => credential.providerId === normalizedProviderId);
  }

  validateProviderCredentials({
    providerId,
    environment = this.environment,
    requiredCredentials = [],
    requiredScopes = []
  } = {}) {
    const normalizedProviderId = String(providerId ?? '').toUpperCase().trim();
    const normalizedEnvironment = String(environment ?? this.environment).toLowerCase().trim();

    if (normalizedProviderId.length === 0) {
      return createCredentialValidationResult({
        providerId: null,
        isValid: false,
        code: 'UNKNOWN_PROVIDER',
        message: 'Provider ID is required for credential validation.'
      });
    }

    const providerCredentials = this.listCredentialsByProvider(normalizedProviderId);

    const missingCredentials = requiredCredentials.filter(requiredCredentialId => {
      const normalizedCredentialId = String(requiredCredentialId ?? '').toUpperCase().trim();
      const credential = providerCredentials.find(item => item.credentialId === normalizedCredentialId);

      if (!credential) {
        return true;
      }

      return credential.configured !== true;
    });

    const environmentMismatch = providerCredentials.some(credential => (
      credential.environment !== normalizedEnvironment
      && credential.configured === true
    ));

    const missingScopes = [];
    if (requiredScopes.length > 0) {
      providerCredentials
        .filter(credential => credential.environment === normalizedEnvironment && credential.configured === true)
        .forEach(credential => {
          const absentScopes = requiredScopes.filter(scope => !credential.requiredScopes.includes(scope));

          if (absentScopes.length > 0) {
            missingScopes.push({
              credentialId: credential.credentialId,
              scopes: absentScopes
            });
          }
        });
    }

    if (missingCredentials.length > 0) {
      return createCredentialValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'MISSING_CREDENTIALS',
        message: `Missing configured credentials for provider ${normalizedProviderId}.`,
        details: {
          missingCredentials,
          missingScopes,
          environmentMismatch
        }
      });
    }

    if (environmentMismatch) {
      return createCredentialValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'ENVIRONMENT_MISMATCH',
        message: `Credential environment mismatch for provider ${normalizedProviderId}.`,
        details: {
          missingCredentials,
          missingScopes,
          environmentMismatch
        }
      });
    }

    if (missingScopes.length > 0) {
      return createCredentialValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'MISSING_SCOPES',
        message: `Credential scopes are incomplete for provider ${normalizedProviderId}.`,
        details: {
          missingCredentials,
          missingScopes,
          environmentMismatch
        }
      });
    }

    const hasVerificationFailure = providerCredentials.some(credential => (
      credential.environment === normalizedEnvironment
      && credential.configured === true
      && credential.verified !== true
    ));

    if (hasVerificationFailure) {
      return createCredentialValidationResult({
        providerId: normalizedProviderId,
        isValid: false,
        code: 'VERIFICATION_FAILURE',
        message: `Credential verification failed for provider ${normalizedProviderId}.`,
        details: {
          missingCredentials,
          missingScopes,
          environmentMismatch
        }
      });
    }

    return createCredentialValidationResult({
      providerId: normalizedProviderId,
      isValid: true,
      code: null,
      message: null,
      details: {
        missingCredentials: [],
        missingScopes: [],
        environmentMismatch: false
      }
    });
  }

  getCredentialSummary({ environment = this.environment } = {}) {
    const normalizedEnvironment = String(environment ?? this.environment).toLowerCase().trim();
    const credentials = this.listCredentials().filter(credential => credential.environment === normalizedEnvironment);

    const configuredCredentials = credentials.filter(credential => credential.configured === true).length;
    const verifiedCredentials = credentials.filter(credential => credential.verified === true).length;
    const warningCredentials = credentials.filter(credential => (
      normalizeCredentialStatus(credential.status) === CredentialStatuses.WARNING
      || normalizeCredentialStatus(credential.status) === CredentialStatuses.FAILED
    )).length;

    return {
      environment: normalizedEnvironment,
      credentialCount: credentials.length,
      configuredCredentials,
      verifiedCredentials,
      warningCredentials
    };
  }
}

module.exports = {
  CredentialRegistry
};
