import { safeInitializeProvider, supportsSyncStorage } from './storage-provider.js';

export function loadRecordMap({ provider, namespace, valueKey = 'value' } = {}) {
  if (!provider) return new Map();
  safeInitializeProvider(provider);
  if (!supportsSyncStorage(provider)) {
    return new Map();
  }

  return new Map(
    provider.listRecordsSync(namespace).map((entry) => [entry.key, entry[valueKey] ?? entry.value])
  );
}

export function upsertRecord({ provider, namespace, key, value } = {}) {
  if (!provider) return;
  if (supportsSyncStorage(provider)) {
    provider.upsertRecordSync(namespace, key, value);
    return;
  }
  void provider.upsertRecord(namespace, key, value);
}

export function deleteRecord({ provider, namespace, key } = {}) {
  if (!provider) return;
  if (supportsSyncStorage(provider)) {
    provider.deleteRecordSync(namespace, key);
    return;
  }
  void provider.deleteRecord(namespace, key);
}

export function loadEventList({ provider, namespace } = {}) {
  if (!provider) return [];
  safeInitializeProvider(provider);
  if (!supportsSyncStorage(provider)) {
    return [];
  }
  return provider.listEventsSync(namespace).map((entry) => entry.value);
}

export function appendEvent({ provider, namespace, key, value } = {}) {
  if (!provider) return;
  if (supportsSyncStorage(provider)) {
    provider.appendEventSync(namespace, key, value);
    return;
  }
  void provider.appendEvent(namespace, key, value);
}

export function getMetaMap({ provider, namespace } = {}) {
  if (!provider) return new Map();
  safeInitializeProvider(provider);
  if (!supportsSyncStorage(provider)) {
    return new Map();
  }
  return new Map(provider.listMetaSync(namespace).map((entry) => [entry.key, entry.value]));
}

export function setMetaValue({ provider, namespace, key, value } = {}) {
  if (!provider) return;
  if (supportsSyncStorage(provider)) {
    provider.setMetaSync(namespace, key, value);
    return;
  }
  void provider.setMeta(namespace, key, value);
}
