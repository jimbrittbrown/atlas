export class AssetRegistry {
  constructor({ assets = [] } = {}) {
    this.assets = [];

    assets.forEach(asset => {
      this.assets.push(this.normalizeAsset({
        ...asset,
        assetId: asset.assetId ?? this.generateAssetId()
      }));
    });
  }

  registerAsset(assetInput = {}) {
    const asset = this.normalizeAsset({
      ...assetInput,
      assetId: assetInput.assetId ?? this.generateAssetId()
    });
    const existingIndex = this.assets.findIndex(item => item.assetId === asset.assetId);

    if (existingIndex >= 0) {
      this.assets[existingIndex] = asset;
    } else {
      this.assets.push(asset);
    }

    return this.cloneAsset(asset);
  }

  getAsset(assetId) {
    const asset = this.assets.find(item => item.assetId === assetId);

    return asset ? this.cloneAsset(asset) : null;
  }

  listAssets() {
    return this.assets
      .map(asset => this.cloneAsset(asset))
      .sort((a, b) => a.assetId.localeCompare(b.assetId));
  }

  updateAsset(assetId, updates = {}) {
    const existing = this.assets.find(item => item.assetId === assetId);

    if (!existing) {
      return null;
    }

    const updated = this.normalizeAsset({
      ...existing,
      ...updates,
      assetId: existing.assetId,
      createdAt: existing.createdAt
    });
    const index = this.assets.findIndex(item => item.assetId === assetId);
    this.assets[index] = updated;

    return this.cloneAsset(updated);
  }

  generateAssetId() {
    return `ASSET-${String(this.assets.length + 1).padStart(4, '0')}`;
  }

  normalizeAsset(asset) {
    return {
      assetId: asset.assetId,
      assetType: asset.assetType ?? 'UNKNOWN_ASSET',
      businessId: asset.businessId ?? 'BUSINESS_ID_PLACEHOLDER',
      missionId: asset.missionId ?? 'MISSION_ID_PLACEHOLDER',
      workerId: asset.workerId ?? 'WORKER_ID_PLACEHOLDER',
      parentAssetIds: Array.isArray(asset.parentAssetIds) ? [...asset.parentAssetIds] : [],
      status: asset.status ?? 'REGISTERED',
      createdAt: asset.createdAt ?? 'CREATED_AT_PLACEHOLDER',
      metadata: this.normalizeMetadata(asset.metadata)
    };
  }

  normalizeMetadata(metadata) {
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    return { ...metadata };
  }

  cloneAsset(asset) {
    return {
      ...asset,
      parentAssetIds: [...asset.parentAssetIds],
      metadata: { ...asset.metadata }
    };
  }
}
