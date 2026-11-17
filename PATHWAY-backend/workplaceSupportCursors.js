const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');

// Process-local keys preserve the existing restart contract: restart listing after a 400.
function createSupportCursors() {
  const key = randomBytes(32);
  return {
    encode(scope, position) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(Buffer.from(JSON.stringify(scope)));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(position)), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
    },
    decode(scope, value) {
      if (value === undefined) return null;
      try {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,2048}$/.test(value)) throw new Error();
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(JSON.stringify(scope)));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
      } catch { throw Object.assign(new Error('Invalid cursor. Restart the list.'), { status: 400 }); }
    },
  };
}
module.exports = { createSupportCursors };
