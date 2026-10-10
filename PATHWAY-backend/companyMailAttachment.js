const crypto = require('node:crypto');
const MAX_PDF_BYTES = 512 * 1024;
function reviewedAttachment(value) {
  if (value == null) return null;
  const reject = () => { throw Object.assign(new Error('Attach one reviewed PDF up to 512 KB.'), { status: 400 }); };
  if (typeof value !== 'object' || Object.keys(value).some(key => !['name', 'base64', 'reviewed'].includes(key))
    || value.reviewed !== true || typeof value.name !== 'string' || !/^[A-Za-z0-9 _().-]{1,100}\.pdf$/i.test(value.name)
    || typeof value.base64 !== 'string' || value.base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64)) reject();
  const content = Buffer.from(value.base64, 'base64');
  if (content.toString('base64') !== value.base64 || content.length > MAX_PDF_BYTES || content.length < 16
    || !content.subarray(0, 5).equals(Buffer.from('%PDF-')) || !content.subarray(-1024).toString('latin1').includes('%%EOF')) reject();
  // Format and size checks are not antivirus or signature verification. Nothing
  // is executed or fetched; an authorized human must review their own file.
  return { filename: value.name, content, contentType: 'application/pdf',
    sha256: crypto.createHash('sha256').update(content).digest('hex') };
}
module.exports = { reviewedAttachment, MAX_PDF_BYTES };
