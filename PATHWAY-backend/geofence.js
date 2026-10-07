function invalid(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function coordinate(value, bound) { return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound; }
function parseGeofence(value) {
  if (value == null) return { enabled: false };
  if (typeof value.enabled !== 'boolean') invalid('Specify whether attendance geofencing is enabled.');
  if (!value.enabled) return { enabled: false };
  if (!coordinate(value.latitude, 90) || !coordinate(value.longitude, 180)
    || !Number.isFinite(value.radiusMeters) || value.radiusMeters < 50 || value.radiusMeters > 2000) invalid('Enter valid coordinates and a radius between 50 and 2,000 metres.');
  return { enabled: true, latitude: value.latitude, longitude: value.longitude, radiusMeters: value.radiusMeters };
}
function verifyLocation(fence, location, now = Date.now()) {
  const config = parseGeofence(fence);
  if (!config.enabled) return { enforced: false };
  if (!location || !coordinate(location.latitude, 90) || !coordinate(location.longitude, 180)
    || typeof location.accuracy !== 'number' || !Number.isFinite(location.accuracy) || location.accuracy < 0
    || typeof location.timestamp !== 'number' || !Number.isFinite(location.timestamp)
    || now - location.timestamp > 120000 || location.timestamp - now > 15000) invalid('A fresh, valid location is required. Enable location access and retry.', 422);
  if (location.mocked === true) invalid('Mock locations cannot be used for attendance.', 422);
  if (location.accuracy > Math.min(100, config.radiusMeters / 2)) invalid('Location accuracy is too low. Move to an open area and retry.', 422);
  const rad = degrees => degrees * Math.PI / 180;
  const dLat = rad(location.latitude - config.latitude), dLng = rad(location.longitude - config.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(config.latitude)) * Math.cos(rad(location.latitude)) * Math.sin(dLng / 2) ** 2;
  const distanceMeters = 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  if (distanceMeters > config.radiusMeters) invalid('You are outside your company attendance area.', 422);
  return { enforced: true, latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy,
    capturedAt: new Date(location.timestamp).toISOString(), distanceMeters: Math.round(distanceMeters), radiusMeters: config.radiusMeters };
}
module.exports = { parseGeofence, verifyLocation };
