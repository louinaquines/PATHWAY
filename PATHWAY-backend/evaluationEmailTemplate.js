// PATHWAY-backend/evaluationEmailTemplate.js
// Shared PATHWAY email look (student-app style): blue header with logo, animated guide character,
// white card, info rows, big button. Images are inline CID attachments, so they show without
// loading remote content. Layout is table-based for Gmail/Outlook.
const fs = require('fs');
const path = require('path');

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const FONT = "'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { blue: '#0B5FD3', blueDark: '#0B4FB3', ink: '#0F1B33', body: '#4A5873', muted: '#7A879C', soft: '#F5F8FD', line: '#E3EAF5', page: '#EEF3FB', chipBg: '#E8F0FE', yellowBg: '#FFF4CC', yellowInk: '#8A6100' };
const GUIDES = ['writing', 'thinking', 'thumbsup', 'pointing', 'waving'];

function readAsset(name) { try { return fs.readFileSync(path.join(__dirname, name)); } catch { return null; } }
const logoBuffer = readAsset('pathway-email-logo.png');
const guideBuffers = Object.fromEntries(GUIDES.map(pose => [pose, readAsset(`email-guide-${pose}.gif`)]));

// Prefer hosted images (portal /email/...) so Gmail doesn't list them as attachments.
// Falls back to inline CID attachments when no public web URL is configured.
function hostedBase() { try { return new URL('/email/', process.env.EVALUATION_WEB_URL).href; } catch { return ''; } }
const logoSrc = () => hostedBase() ? hostedBase() + 'pathway-logo.png' : 'cid:pathway-logo';
const guideSrc = pose => hostedBase() ? hostedBase() + `email-guide-${pose}.gif` : 'cid:pathway-guide';

function rowsHtml(rows) {
  if (!rows?.length) return '';
  const body = rows.map((row, index) => {
    const value = row.chip
      ? `<span style="display:inline-block;padding:4px 10px;border-radius:99px;background:${C.yellowBg};color:${C.yellowInk};font-size:13px;font-weight:700">${escape(row.value)}</span>`
      : `<span style="font-size:14px;font-weight:700;color:${C.ink}">${escape(row.value)}</span>`;
    const border = index < rows.length - 1 ? `border-bottom:1px solid ${C.line};` : '';
    return `<tr><td style="padding:14px 18px;${border}"><div style="font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:${C.muted};margin-bottom:3px">${escape(row.label)}</div>${value}</td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.soft};border-radius:16px;margin:22px 0 4px">${body}</table>`;
}

function codeHtml(code) {
  if (!code) return '';
  const digits = String(code).split('').map(d => `<td width="15%" style="width:15%;padding:0 3px"><div style="height:58px;line-height:58px;background:#ffffff;border:1.5px solid ${C.blue};border-radius:12px;text-align:center;font-size:28px;font-weight:800;color:${C.blueDark};font-family:${FONT}">${escape(d)}</div></td>`).join('');
  // One unbroken, selectable token so a long-press/double-click copies the whole code.
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.soft};border-radius:16px;margin:22px 0 12px"><tr><td align="center" style="padding:20px 14px">
<table class="pw-code" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:380px"><tr>${digits}</tr></table>
<div style="margin-top:16px;font-size:12px;color:${C.muted}">Tap and hold to copy</div>
<div style="display:inline-block;margin-top:6px;padding:10px 18px;border-radius:12px;background:#ffffff;border:1px dashed #9DB4D8;font-family:${FONT};font-size:24px;font-weight:800;letter-spacing:2px;color:${C.ink};user-select:all;-webkit-user-select:all">${escape(code)}</div></td></tr></table>`;
}

function pathwayEmail({ preheader = '', chip, title, greeting, paragraphs = [], rows, code, note, button, after = [], fallbackUrl, footerReason, guide = 'writing' }) {
  const guideImg = guideBuffers[guide] ? `<img class="pw-guide" src="${guideSrc(guide)}" width="120" height="120" alt="" style="display:block;border:0;width:120px;height:120px;border-radius:60px">` : '';
  const logoImg = logoBuffer ? `<img class="pw-logo" src="${logoSrc()}" width="44" height="44" alt="PATHWAY" style="display:block;border:0;width:44px;height:44px;border-radius:12px;background:#ffffff">` : '';
  const paras = paragraphs.filter(Boolean).map(p => `<p class="pw-p" style="margin:0 0 12px;font-size:15px;line-height:1.65;color:${C.body}">${p}</p>`).join('');
  const btn = button ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="pw-btn" style="margin:22px 0 12px"><tr><td align="center" style="background:${C.blue};border-radius:14px"><a href="${escape(button.url)}" style="display:block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;font-family:${FONT}">${escape(button.label)} &rarr;</a></td></tr></table>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escape(title)}</title><style>@media only screen and (max-width:620px){.pw-outer{padding:12px 6px!important}.pw-head{padding:18px 18px 0!important;border-radius:20px 20px 0 0!important}.pw-card{padding:22px 20px 20px!important;border-radius:0 0 20px 20px!important}.pw-guide-cell{width:92px!important}.pw-guide{width:84px!important;height:84px!important;border-radius:42px!important}.pw-logo{width:38px!important;height:38px!important}.pw-brand{font-size:19px!important}.pw-sub{font-size:12px!important}.pw-title{font-size:22px!important}.pw-p{font-size:14px!important}.pw-code td{padding:0 2px!important}.pw-code td div{height:50px!important;line-height:50px!important;font-size:24px!important}.pw-btn a{padding:14px 16px!important;font-size:15px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.page}"><tr><td class="pw-outer" align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px">
<tr><td class="pw-head" style="background:${C.blue};background-image:linear-gradient(135deg,${C.blueDark},#1A73E8);border-radius:24px 24px 0 0;padding:24px 28px 0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td style="vertical-align:top"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px">${logoImg}</td><td><div class="pw-brand" style="font-size:22px;font-weight:800;letter-spacing:1px;color:#ffffff">PATHWAY</div><div class="pw-sub" style="white-space:nowrap;font-size:13px;color:#DCE8FF">OJT Management System</div></td></tr></table></td>
<td class="pw-guide-cell" align="right" style="vertical-align:bottom;width:130px">${guideImg}</td></tr></table></td></tr>
<tr><td class="pw-card" style="background:#ffffff;border-radius:0 0 24px 24px;padding:28px 32px 26px;box-shadow:0 12px 32px rgba(13,51,128,.10)">
${chip ? `<span style="display:inline-block;padding:6px 12px;border-radius:99px;background:${C.chipBg};color:${C.blueDark};font-size:12px;font-weight:700">${escape(chip)}</span>` : ''}
<h1 class="pw-title" style="margin:14px 0 12px;font-size:26px;line-height:1.25;font-weight:800;color:${C.ink}">${escape(greeting || title)}</h1>
${paras}${rowsHtml(rows)}${codeHtml(code)}
${note ? `<span style="display:inline-block;margin:6px 0 4px;padding:6px 12px;border-radius:99px;background:${C.yellowBg};color:${C.yellowInk};font-size:13px;font-weight:700">${escape(note)}</span>` : ''}
${btn}${after.filter(Boolean).map(p => `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${C.muted}">${p}</p>`).join('')}
</td></tr>
<tr><td align="center" style="padding:20px 24px 8px;font-size:12px;line-height:1.6;color:${C.muted}">PATHWAY OJT Management System &middot; UCLM College of Computer Studies${footerReason ? `<br>${escape(footerReason)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

function verificationCodeHtml(code) {
  return pathwayEmail({ preheader: `Your PATHWAY verification code: ${code}`, chip: 'Verify it’s you', title: 'Your verification code', guide: 'thinking',
    paragraphs: ['Enter this code on the evaluation page to open the form.'], code, note: '⏳ Expires in 10 minutes',
    after: ['This code works for this evaluation only. Never share it with anyone.', 'Didn’t ask for this? You can ignore this email — nothing will change.'],
    footerReason: 'You got this email because someone opened your PATHWAY evaluation link.' });
}

// "Cruz, Jose" -> "Jose Cruz" for sentences.
const displayName = name => { const [last, first] = String(name || '').split(','); return first ? `${first.trim()} ${last.trim()}` : String(name || 'Your intern'); };

function evaluationEmailHtml(evaluation, message, link) {
  const expires = new Date(evaluation.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const title = evaluation.formDefinition?.title || 'Supervisor evaluation request';
  const coordinatorNote = String(message || '').trim();
  return pathwayEmail({ preheader: `Please rate ${evaluation.studentName}'s OJT performance`, chip: 'Supervisor evaluation', title, guide: 'writing',
    greeting: `Hi ${evaluation.supervisorName || 'there'},`,
    paragraphs: [`${escape(displayName(evaluation.studentName))} is asking for your OJT evaluation for <strong>${escape(title)}</strong>. It takes about 5 minutes, and your feedback goes straight to their coordinator.`,
      coordinatorNote ? `<span style="display:block;padding:12px 14px;border-left:3px solid ${C.blue};background:#F0F6FF;border-radius:8px;color:${C.ink}"><strong>Message from coordinator</strong><br>${escape(coordinatorNote).replace(/\r?\n/g, '<br>')}</span>` : ''],
    rows: [{ label: 'Student', value: evaluation.studentName }, { label: 'Company', value: evaluation.companyName }, { label: 'Link expires', value: `${expires} (Philippine time)`, chip: true }],
    button: { label: 'Open Evaluation', url: link },
    after: ['You’ll get a 6-digit code to confirm it’s you. The link can be submitted once — please don’t forward it.'],
    fallbackUrl: link, footerReason: 'You got this email because a student listed you as their OJT supervisor.' });
}

// Inline (CID) images: logo + animated guide for the given pose.
function logoAttachments(guide = 'writing') {
  const list = [];
  if (hostedBase()) return list;
  if (logoBuffer) list.push({ filename: 'pathway-logo.png', content: logoBuffer, cid: 'pathway-logo', contentType: 'image/png' });
  if (guideBuffers[guide]) list.push({ filename: `pathway-guide-${guide}.gif`, content: guideBuffers[guide], cid: 'pathway-guide', contentType: 'image/gif' });
  return list;
}

module.exports = { pathwayEmail, evaluationEmailHtml, verificationCodeHtml, logoAttachments };
