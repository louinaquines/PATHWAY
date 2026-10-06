import { Platform } from 'react-native';

export async function uploadCloudinaryFile(file, authorization) {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    const bytes = file.file || await fetch(file.uri).then(response => {
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

  const response = await fetch(authorization.uploadUrl, { method: 'POST', body: formData });
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
}
