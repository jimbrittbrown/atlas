import { appConfig } from '../../config';
import { DashboardApiError, messageForApiCode, toUserSafeError } from '../../api/errors';
import { buildDecisionCenterModel } from './ceo-decision-center-manager';
import type { CeoDecisionCenterViewModel } from './ceo-decision-center-dashboard-model';

export type DecisionCenterRequestOptions = {
  token: string;
  role: string;
  signal?: AbortSignal;
};

export async function fetchDecisionCenter(options: DecisionCenterRequestOptions): Promise<CeoDecisionCenterViewModel> {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(Math.max(1, appConfig.requestTimeoutMs));
  const onAbort = () => controller.abort();
  timeout.addEventListener('abort', onAbort);
  options.signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/ceo/decision-center`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${options.token}`,
        'x-client-id': 'atlas-ceo-dashboard-web',
        'x-atlas-role-hint': options.role,
      },
      signal: controller.signal,
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      const code = payload.error?.code ?? 'UNKNOWN';
      throw new DashboardApiError(messageForApiCode(code), response.status, code);
    }

    return buildDecisionCenterModel(payload.data);
  } catch (error) {
    throw toUserSafeError(error);
  } finally {
    timeout.removeEventListener('abort', onAbort);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
