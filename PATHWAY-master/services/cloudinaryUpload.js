import { Platform } from 'react-native';

export async function uploadCloudinaryFile(file, authorization, { timeoutMs = 0 } = {}) {
  const abort = timeoutMs ? new AbortController() : null;
  let timer;
  const timeout = abort ? new Promise((_, reject) => {
    timer = setTimeout(() => { reject(new Error('Upload timed out. Your file is kept; try again or explicitly remove it.')); abort.abort(); }, timeoutMs);
  }) : null;
  const perform = async () => {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const bytes = file.file || await fetch(file.uri, abort ? { signal: abort.signal } : undefined).then(response => {
      if (!response.ok) throw new Error('The selected file could not be read. Please select it again.');
      return response.blob();
    });
    formData.append('file', bytes, file.name || 'upload');
  } else {
    formData.append('file', {
      uri: file.uri,
      type: file.mimeType || 'application/octet-stream',
      name: file.name || 'upload',
    });
  }
  formData.append('api_key', authorization.apiKey);
  formData.append('timestamp', String(authorization.timestamp));
  formData.append('signature', authorization.signature);
  formData.append('public_id', authorization.publicId);
  formData.append('overwrite', 'false');
  if (authorization.deliveryType === 'authenticated') formData.append('type', 'authenticated');

  const response = await fetch(authorization.uploadUrl, { method: 'POST', body: formData, ...(abort ? { signal: abort.signal } : {}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url || !result.public_id || !result.signature || !result.version) {
    throw new Error(result.error?.message || 'The document could not be uploaded. Please try again.');
  }
  return {
    intentId: authorization.intentId,
    publicId: result.public_id,
    version: result.version,
    signature: result.signature,
  };
  };
  try { return await (timeout ? Promise.race([perform(), timeout]) : perform()); }
  finally { if (timer) clearTimeout(timer); }
}
