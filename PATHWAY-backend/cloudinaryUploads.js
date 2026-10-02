const crypto = require('node:crypto');

function canonicalParams(params) {
  return Object.entries(params)
    .filter(([key, value]) => !['file', 'api_key', 'cloud_name', 'resource_type', 'signature'].includes(key)
      && value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function signParams(params, apiSecret) {
  return crypto.createHash('sha1').update(`${canonicalParams(params)}${apiSecret}`).digest('hex');
}

function secureEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function cloudinaryConfig(env = process.env) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) return null;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(cloudName) || !/^\d{1,30}$/.test(apiKey)) return null;
  return { cloudName, apiKey, apiSecret };
}

async function fetchCloudinaryAsset({ cloudName, apiKey, apiSecret, resourceType, publicId, deliveryType = 'upload', env = process.env }) {
  const apiBase = (env.CLOUDINARY_API_BASE_URL || 'https://api.cloudinary.com/v1_1').replace(/\/$/, '');
  const encodedId = publicId.split('/').map(encodeURIComponent).join('/');
  const url = `${apiBase}/${encodeURIComponent(cloudName)}/resources/${resourceType}/${encodeURIComponent(deliveryType)}/${encodedId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
  });
  if (!response.ok) {
    const error = new Error(response.status === 404 ? 'Uploaded file was not found.' : 'Cloudinary could not verify the uploaded file.');
    error.status = response.status === 404 ? 400 : 502;
    throw error;
  }
  return response.json();
}

async function fetchCloudinaryAssetDownload({ cloudName, apiKey, apiSecret, assetId, fileName, env = process.env }) {
  const apiBase = (env.CLOUDINARY_API_BASE_URL || 'https://api.cloudinary.com/v1_1').replace(/\/$/, '');
  if (typeof assetId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(assetId)) {
    throw Object.assign(new Error('Invalid Cloudinary asset identifier.'), { status: 400 });
  }
  const safeFileName = String(fileName || 'endorsement-letter').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || 'endorsement-letter';
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = { asset_id: assetId, attachment: 'true', target_filename: safeFileName, timestamp };
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(signedParams).map(([key, value]) => [key, String(value)])),
    api_key: apiKey,
    signature: signParams(signedParams, apiSecret),
  });
  const url = `${apiBase}/${encodeURIComponent(cloudName)}/asset/download?${query}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error('Cloudinary could not retrieve the protected document.');
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    throw Object.assign(new Error('The protected document exceeds the permitted size.'), { status: 502 });
  }
  return bytes;
}

function validateAssetMetadata(asset, { cloudName, expectedPublicId, expectedVersion, kind, expectedDeliveryType = 'upload' }) {
  if (!asset || asset.public_id !== expectedPublicId || String(asset.version) !== String(expectedVersion)) return false;
  if (expectedDeliveryType === 'authenticated'
    && (asset.type !== 'authenticated' || typeof asset.asset_id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(asset.asset_id))) return false;
  if (asset.type && asset.type !== expectedDeliveryType) return false;
  if (!['image', 'raw'].includes(asset.resource_type) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 5 * 1024 * 1024) return false;
  const validFormat = kind === 'profile'
    ? asset.resource_type === 'image' && ['jpg', 'jpeg', 'png', 'webp'].includes(String(asset.format).toLowerCase())
    : ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'].includes(String(asset.format).toLowerCase());
  if (!validFormat) return false;
  try {
    const url = new URL(asset.secure_url);
    const path = `/${cloudName}/${asset.resource_type}/${expectedDeliveryType}/`;
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && url.pathname.includes(path);
  } catch (_) { return false; }
}

function formatFileSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  cloudinaryConfig, signParams, secureEqual, fetchCloudinaryAsset,
  fetchCloudinaryAssetDownload, validateAssetMetadata, formatFileSize,
};
