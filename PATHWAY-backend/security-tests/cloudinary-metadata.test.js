const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAssetMetadata } = require('../cloudinaryUploads');

const options = { cloudName: 'qa-cloud', expectedPublicId: 'student/test.pdf', expectedVersion: 1, kind: 'requirement', expectedDeliveryType: 'authenticated' };
const asset = { public_id: options.expectedPublicId, version: 1, type: 'authenticated', asset_id: 'synthetic-asset-000001', resource_type: 'raw', bytes: 76, secure_url: 'https://res.cloudinary.com/qa-cloud/raw/authenticated/v1/student/test.pdf' };

test('raw PDF metadata without format is accepted only through verified public ID', () => {
  assert.equal(validateAssetMetadata(asset, options), true);
  assert.equal(validateAssetMetadata({ ...asset, public_id: 'other.pdf' }, options), false);
  assert.equal(validateAssetMetadata({ ...asset, type: 'upload' }, options), false);
  assert.equal(validateAssetMetadata({ ...asset, version: 2 }, options), false);
});

test('unsupported or missing raw extension and explicit invalid format remain denied', () => {
  for (const publicId of ['student/test.exe', 'student/test', 'student/pdf']) {
    assert.equal(validateAssetMetadata({ ...asset, public_id: publicId }, { ...options, expectedPublicId: publicId }), false);
  }
  assert.equal(validateAssetMetadata({ ...asset, format: 'exe' }, options), false);
  assert.equal(validateAssetMetadata({ ...asset, resource_type: 'image' }, options), false);
  assert.equal(validateAssetMetadata(asset, { ...options, kind: 'profile' }), false);
});
