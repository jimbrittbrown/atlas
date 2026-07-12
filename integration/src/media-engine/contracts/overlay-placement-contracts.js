export function createOverlayPlacement({
  overlayId,
  overlayType = 'NONE',
  anchor = 'CENTER',
  zIndex = 0,
  timing = null,
  payload = null
} = {}) {
  return {
    overlayId: overlayId ?? null,
    overlayType,
    anchor,
    zIndex,
    timing,
    payload
  };
}
