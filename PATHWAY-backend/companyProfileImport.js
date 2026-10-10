const https = require('node:https');
const dns = require('node:dns/promises');
const net = require('node:net');
function publicIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0,88,168].includes(b))
    || (a === 198 && [18,19,51].includes(b)) || (a === 203 && b === 0));
}
function publicUrl(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hostname.length > 253 || !url.hostname.includes('.') || net.isIP(url.hostname) || url.hostname.startsWith('[')) throw new Error('Use a public HTTPS website without credentials or a custom port.');
  url.hash = ''; return url;
}
function decode(value) { return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function extractProfile(html, sourceUrl) {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '';
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].find(([tag]) => /(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag))?.[0] || '';
  const description = /content\s*=\s*["']([^"']*)["']/i.exec(meta)?.[1] || '';
  const email = /href\s*=\s*["']mailto:([^?"'\s<>]+)/i.exec(html)?.[1] || '';
  const phone = /href\s*=\s*["']tel:([^"'<>]+)/i.exec(html)?.[1] || '';
  return { sourceUrl, name: decode(title).slice(0, 120), description: decode(description).slice(0, 600),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : '', phone: decode(phone).slice(0, 60),
    warning: 'Suggestions from public page text only. Confirm the company name and contacts. Address, industry, capacity and attendance location are not inferred.' };
}
async function fetchPublicProfile(input, { lookup = dns.lookup, get = https.get, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url = publicUrl(input);
    for (let redirect = 0; redirect <= 3; redirect++) {
      const records = await Promise.race([lookup(url.hostname, { all: true }), new Promise((_, reject) => {
        if (controller.signal.aborted) return reject(new Error('Website request timed out.'));
        controller.signal.addEventListener('abort', () => reject(new Error('Website request timed out.')), { once: true });
      })]);
      if (!records.length || records.some(record => !publicIPv4(record.address))) throw new Error('Website resolves to a restricted or unsupported network.');
      const address = records[0].address;
      const response = await new Promise((resolve, reject) => {
        const request = get(url, { agent: false, signal: controller.signal,
          lookup: (_host, options, callback) => callback(null, options.all ? [{ address, family: 4 }] : address, 4),
          headers: { 'User-Agent': 'PATHWAY-Profile-Preview/1.0', Accept: 'text/html', 'Accept-Encoding': 'identity' } }, res => {
          if ([301,302,303,307,308].includes(res.statusCode)) { const location = res.headers.location; res.destroy(); return resolve({ location }); }
          if (res.statusCode !== 200 || !/^text\/html\b/i.test(res.headers['content-type'] || '') || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity')) { res.destroy(); return reject(new Error('Website did not return a supported public HTML page.')); }
          let size = 0; const chunks = [];
          res.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) { res.destroy(new Error('Page exceeds the 1 MB limit.')); } else chunks.push(chunk); });
          res.on('error', reject); res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
        }); request.on('error', reject);
      });
      if (response.html != null) return extractProfile(response.html, url.href);
      if (!response.location || redirect === 3) throw new Error('Too many redirects or missing redirect location.');
      url = publicUrl(new URL(response.location, url).href);
    }
  } finally { clearTimeout(timer); controller.abort(); }
}
function installCompanyProfileImport({ app, requireStaff, allowRate }) {
  app.post('/coordinator/company-profile-preview', requireStaff, async (req, res) => {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!allowRate(req, res, { limit: 5, windowMs: 60000, key: r => `profile-import:${r.staff.uid}` })) return;
    if (typeof req.body?.url !== 'string' || req.body.url.length > 2000) return res.status(400).json({ error: 'Enter a public HTTPS website.' });
    try { return res.json({ preview: await fetchPublicProfile(req.body.url) }); }
    catch { return res.status(422).json({ error: 'Could not preview this public website. It may be restricted, unsupported or unavailable. Enter company details manually.' }); }
  });
}
module.exports = { publicIPv4, publicUrl, extractProfile, fetchPublicProfile, installCompanyProfileImport };
