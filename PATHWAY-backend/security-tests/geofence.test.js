const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGeofence, verifyLocation } = require('../geofence');
const fence = { enabled: true, latitude: 10.3, longitude: 123.9, radiusMeters: 150 };
const fix = () => ({ latitude: 10.3, longitude: 123.9, accuracy: 10, timestamp: Date.now() });
test('geofence configuration validates ranges and preserves disabled policy', () => {
  assert.deepEqual(parseGeofence(), { enabled: false });
  assert.throws(() => parseGeofence({ ...fence, latitude: 91 }));
  assert.throws(() => parseGeofence({ ...fence, radiusMeters: 0 }));
  assert.throws(() => parseGeofence({ ...fence, longitude: '123' }));
});
test('inside accepted, outside rejected without accuracy expanding radius', () => {
  assert.equal(verifyLocation(fence, fix()).distanceMeters, 0);
  assert.throws(() => verifyLocation(fence, { ...fix(), latitude: 10.31 }));
  assert.equal(verifyLocation(null, null).enforced, false);
});
test('missing stale future inaccurate and mocked fixes rejected', () => {
  for (const point of [null, { ...fix(), timestamp: Date.now() - 130000 }, { ...fix(), timestamp: Date.now() + 30000 },
    { ...fix(), accuracy: 500 }, { ...fix(), mocked: true }, { ...fix(), latitude: NaN }]) {
    assert.throws(() => verifyLocation(fence, point));
  }
});
