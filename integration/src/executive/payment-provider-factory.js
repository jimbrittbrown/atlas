import { PaymentProviderStatuses } from './payment-provider-contracts.js';
import { StripePaymentProviderAdapter } from './payment-provider-stripe.js';

function boolFlag(value, fallback = false) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

export function createPaymentProvider({
  providerType = process.env.ATLAS_PAYMENT_PROVIDER ?? 'stripe',
  now,
  logger,
  environment = process.env.NODE_ENV ?? 'development',
  allowMockInProduction = boolFlag(process.env.ATLAS_PAYMENT_ALLOW_MOCK_IN_PRODUCTION, false)
} = {}) {
  const normalized = String(providerType ?? '').trim().toLowerCase();

  if (normalized !== 'stripe') {
    return {
      provider: new StripePaymentProviderAdapter({ now, logger, config: { mode: 'mock' } }),
      type: 'stripe',
      blocked: true,
      status: PaymentProviderStatuses.NOT_CONFIGURED,
      warnings: [`Unsupported payment provider '${normalized}'. Stripe adapter is required for Phase I.`]
    };
  }

  const provider = new StripePaymentProviderAdapter({ now, logger });
  const status = provider.getProviderStatus();
  const warnings = [...(status.warnings ?? [])];

  if ((environment === 'production' || environment === 'staging') && provider.config.mode === 'mock' && !allowMockInProduction) {
    warnings.push('Mock Stripe mode is blocked in production/staging unless explicit override is enabled.');
    return {
      provider,
      type: 'stripe',
      blocked: true,
      status: PaymentProviderStatuses.DEVELOPMENT_ONLY,
      warnings
    };
  }

  return {
    provider,
    type: 'stripe',
    blocked: false,
    status: status.readiness,
    warnings
  };
}
