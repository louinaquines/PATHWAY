// Offline encrypted snapshot packaging. Deliberately refuses production restores.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_BYTES = 128 * 1024 * 1024;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function safeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..' || /[.\s]$/.test(part) || /[\x00-\x1f<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) throw new Error('Unsafe archive path');
}
function keyFor(secret, salt) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('Use a secret of at least 16 characters');
  return crypto.scryptSync(secret, salt, 32);
}
function packageSnapshot(source, destination, secret, project = 'demo-pathway-security', attachments = []) {
  if (project !== 'demo-pathway-security') throw new Error('Only isolated emulator snapshots are supported');
  const root = path.resolve(source);
  if (fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory()) throw new Error('Snapshot must be a real directory');
  const files = []; let total = 0;
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are forbidden');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const name = path.relative(root, full).split(path.sep).join('/'); safeName(name);
        total += fs.statSync(full).size;
        if (total > MAX_BYTES || files.length >= 10000) throw new Error('Snapshot exceeds offline tool limits');
        const bytes = fs.readFileSync(full);
        files.push({ name, bytes: bytes.toString('base64'), sha256: digest(bytes) });
      } else throw new Error('Unsupported snapshot entry');
    }
  }
  walk(root);
  if (!Array.isArray(attachments) || attachments.length > 1000) throw new Error('Invalid attachment list');
  const mappings = [];
  for (const item of attachments) {
    if (!item || typeof item.source !== 'string' || typeof item.recordPath !== 'string' || typeof item.version !== 'string' || !item.version || item.version.length > 200) throw new Error('Attachment requires local source, recordPath and version');
    safeName(item.recordPath);
    if (item.recordPath.split('/').length % 2 !== 0) throw new Error('Attachment recordPath must identify a document');
    const local = path.resolve(item.source);
    for (let ancestor = local; ; ancestor = path.dirname(ancestor)) {
      if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Attachment symlink refused');
      if (ancestor === path.dirname(ancestor)) break;
    }
    if (!fs.statSync(local).isFile()) throw new Error('Attachment must be a local file');
    total += fs.statSync(local).size;
    if (total > MAX_BYTES || files.length >= 9999) throw new Error('Snapshot exceeds offline tool limits');
    const bytes = fs.readFileSync(local), sha256 = digest(bytes);
    const name = `attachment-bytes/${mappings.length}-${sha256}.bin`;
    if (files.some(file => file.name.toLowerCase() === name.toLowerCase())) throw new Error('Attachment path collision');
    if (mappings.some(mapping => mapping.recordPath === item.recordPath && mapping.version === item.version)) throw new Error('Duplicate attachment version');
    files.push({ name, bytes: bytes.toString('base64'), sha256 });
    if (item.originalAssetId !== undefined && !/^[A-Za-z0-9_-]{16,80}$/.test(item.originalAssetId)) throw new Error('Invalid original attachment identity');
    mappings.push({ recordPath: item.recordPath, version: item.version, name, sha256, size: bytes.length, ...(item.originalAssetId ? { originalAssetId: item.originalAssetId } : {}) });
  }
  if (mappings.length) {
    const name = 'attachment-recovery.json';
    if (files.some(file => file.name.toLowerCase() === name)) throw new Error('Attachment manifest collision');
    const bytes = Buffer.from(JSON.stringify({ version: 1, attachments: mappings }));
    files.push({ name, bytes: bytes.toString('base64'), sha256: digest(bytes) });
  }
  const archive = { version: 1, project, createdAt: new Date().toISOString(), files };
  validate(archive);
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret, salt), iv);
  cipher.setAAD(Buffer.from('PATHWAY-OFFLINE-BACKUP-v1'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(archive), 'utf8'), cipher.final()]);
  const envelope = { version: 1, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') };
  fs.writeFileSync(destination, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
  return { project, files: files.length, bytes: total, encrypted: true };
}
function validate(archive) {
  if (archive.version !== 1 || archive.project !== 'demo-pathway-security' || !Array.isArray(archive.files) || !archive.files.length || archive.files.length > 10000) throw new Error('Unsupported snapshot');
  const names = new Set(); let total = 0;
  for (const file of archive.files) {
    safeName(file.name);
    if ([...names].some(name => name.toLowerCase() === file.name.toLowerCase()) || typeof file.bytes !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.bytes)) throw new Error('Duplicate path or invalid content');
    names.add(file.name);
    const bytes = Buffer.from(file.bytes, 'base64'); total += bytes.length;
    if (digest(bytes) !== file.sha256 || total > MAX_BYTES) throw new Error('Checksum or size mismatch');
  }
  for (const name of names) {
    const parts = name.split('/');
    while (parts.length > 1) { parts.pop(); if (names.has(parts.join('/'))) throw new Error('Conflicting archive paths'); }
  }
  const metadataFile = archive.files.find(file => file.name === 'firebase-export-metadata.json');
  if (!metadataFile) throw new Error('Missing Firebase export metadata');
  const metadata = JSON.parse(Buffer.from(metadataFile.bytes, 'base64').toString('utf8'));
  const authPath = `${metadata.auth?.path}/accounts.json`, firestorePath = metadata.firestore?.metadata_file;
  safeName(authPath); safeName(firestorePath);
  if (!names.has(authPath) || !names.has(firestorePath)) throw new Error('Incomplete Auth/Firestore snapshot');
  if (!Array.isArray(JSON.parse(Buffer.from(archive.files.find(file => file.name === authPath).bytes, 'base64')).users)) throw new Error('Invalid Auth export');
  const recoveryFile = archive.files.find(file => file.name === 'attachment-recovery.json');
  const attachmentFiles = archive.files.filter(file => file.name.startsWith('attachment-bytes/'));
  if (attachmentFiles.length && !recoveryFile) throw new Error('Attachment bytes require a recovery manifest');
  if (recoveryFile) {
    const recovery = JSON.parse(Buffer.from(recoveryFile.bytes, 'base64'));
    if (recovery.version !== 1 || !Array.isArray(recovery.attachments) || recovery.attachments.length !== attachmentFiles.length || recovery.attachments.length > 1000) throw new Error('Invalid attachment manifest');
    const references = new Set(), versions = new Set();
    for (const item of recovery.attachments) {
      safeName(item.recordPath); safeName(item.name);
      const file = attachmentFiles.find(file => file.name === item.name);
      const key = JSON.stringify([item.recordPath, item.version]);
      if (item.originalAssetId !== undefined && !/^[A-Za-z0-9_-]{16,80}$/.test(item.originalAssetId)) throw new Error('Invalid attachment source identity');
      if (item.recordPath.split('/').length % 2 || typeof item.version !== 'string' || !item.version || item.version.length > 200 || references.has(item.name) || versions.has(key) || !file || file.sha256 !== item.sha256 || Buffer.from(file.bytes, 'base64').length !== item.size) throw new Error('Attachment mapping mismatch');
      references.add(item.name); versions.add(key);
    }
  }
}
function inspect(filename, secret) {
  if (fs.statSync(filename).size > MAX_BYTES * 2) throw new Error('Backup too large');
  const envelope = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (envelope.version !== 1 || !/^[a-f0-9]{32}$/.test(envelope.salt) || !/^[a-f0-9]{24}$/.test(envelope.iv) || !/^[a-f0-9]{32}$/.test(envelope.tag) || typeof envelope.ciphertext !== 'string') throw new Error('Invalid backup envelope');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret, Buffer.from(envelope.salt, 'hex')), Buffer.from(envelope.iv, 'hex'));
  decipher.setAAD(Buffer.from('PATHWAY-OFFLINE-BACKUP-v1')); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const archive = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  validate(archive); return archive;
}
function restore(filename, target, secret, { project, dryRun = true } = {}) {
  if (project !== 'demo-pathway-security') throw new Error('Production or unknown target refused');
  const archive = inspect(filename, secret);
  const destination = path.resolve(target);
  if (fs.existsSync(destination)) throw new Error('Restore destination must not exist');
  if (destination === path.parse(destination).root) throw new Error('Unsafe destination');
  for (let ancestor = path.dirname(destination); ; ancestor = path.dirname(ancestor)) {
    if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Symlink destination ancestor refused');
    if (ancestor === path.dirname(ancestor)) break;
  }
  if (dryRun) return { dryRun: true, files: archive.files.length, project };
  fs.mkdirSync(destination, { mode: 0o700 });
  let written = 0;
  try {
    for (const file of archive.files) {
      const full = path.join(destination, ...file.name.split('/'));
      fs.mkdirSync(path.dirname(full), { recursive: true, mode: 0o700 });
      fs.writeFileSync(full, Buffer.from(file.bytes, 'base64'), { flag: 'wx', mode: 0o600 }); written++;
    }
    for (const file of archive.files) if (digest(fs.readFileSync(path.join(destination, ...file.name.split('/')))) !== file.sha256) throw new Error('Readback failed');
    return { restored: true, files: written, project };
  } catch (error) {
    throw new Error(`Partial restore: ${written}/${archive.files.length} files. Keep target isolated; no automatic retry. ${error.message}`);
  }
}
module.exports = { packageSnapshot, inspect, restore };
if (require.main === module) {
  try {
    const [action, source, target] = process.argv.slice(2);
    const secret = process.env.PATHWAY_BACKUP_SECRET;
    const attachments = action === 'pack' && process.env.PATHWAY_BACKUP_ATTACHMENTS_FILE ? JSON.parse(fs.readFileSync(process.env.PATHWAY_BACKUP_ATTACHMENTS_FILE, 'utf8')) : [];
    const result = action === 'pack' ? packageSnapshot(source, target, secret, 'demo-pathway-security', attachments) : action === 'inspect' ? (() => { const value = inspect(source, secret); return { project: value.project, files: value.files.length }; })() : action === 'restore' ? restore(source, target, secret, { project: process.env.PATHWAY_RESTORE_PROJECT, dryRun: !process.argv.includes('--apply') }) : (() => { throw new Error('Use pack, inspect or restore'); })();
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
