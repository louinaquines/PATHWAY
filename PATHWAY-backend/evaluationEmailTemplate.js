const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function logoUrl() { try { return new URL('/pathway-logo1.png', process.env.EVALUATION_WEB_URL).href; } catch { return ''; } }
function brandHeader() {
  const logo = logoUrl();
  return `<tr><td style="padding:22px 28px;border-bottom:1px solid #e4eaf3;background:#ffffff;border-radius:16px 16px 0 0"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${logo ? `<td style="padding-right:12px;vertical-align:middle"><img src="${escape(logo)}" width="40" height="40" alt="PATHWAY" style="display:block;border:0;width:40px;height:40px"></td>` : ''}<td style="vertical-align:middle"><span style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#075fc9">PATHWAY</span><div style="margin-top:2px;font-size:12px;color:#697991">OJT Management System · Supervisor Portal</div></td></tr></table></td></tr>`;
}
function verificationCodeHtml(code) {
  const digits = String(code).split('').map(d => `<td style="width:44px;height:52px;background:#f0f6ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;font-size:26px;font-weight:bold;color:#0f172a;font-family:'Courier New',monospace">${escape(d)}</td>`).join('<td style="width:8px"></td>');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f6f8fc;font-family:Arial,Helvetica,sans-serif;color:#152238;color-scheme:light only">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fc"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="width:100%;max-width:480px;background:#ffffff;border:1px solid #dbe5f2;border-radius:16px">
${brandHeader()}
<tr><td style="padding:28px;background:#ffffff">
<span style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#075fc9">VERIFICATION CODE</span>
<h1 style="margin:8px 0 8px;font-size:22px;color:#152238">Confirm it’s you</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#52647d">Enter this code on the evaluation page to open the form.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 14px"><tr>${digits}</tr></table>
<p style="margin:0 0 6px;font-size:12px;color:#697991">Or copy the code:</p>
<div style="display:inline-block;padding:10px 16px;background:#f7f9fc;border:1px dashed #94a3b8;border-radius:8px;font-family:'Courier New',monospace;font-size:20px;font-weight:bold;letter-spacing:4px;color:#0f172a;user-select:all;-webkit-user-select:all">${escape(code)}</div>
<p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#697991">This code expires in 10 minutes and works for this evaluation only. Do not share it with anyone.</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f7f9fc;border-top:1px solid #e4eaf3;font-size:12px;color:#697991;border-radius:0 0 16px 16px">PATHWAY OJT Coordination Office</td></tr>
</table></td></tr></table></body></html>`;
}
function evaluationEmailHtml(evaluation, message, link) {
  const expires = new Date(evaluation.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const title = evaluation.formDefinition?.title || 'Supervisor evaluation request';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light only}</style></head>
<body style="margin:0;padding:0;background:#f6f8fc;color-scheme:light only;font-family:Arial,Helvetica,sans-serif;color:#152238">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fc"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dbe5f2;border-radius:16px">
${brandHeader()}
<tr><td style="padding:28px"><span style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#075fc9">EVALUATION INVITATION</span>
<h1 style="margin:10px 0 20px;font-size:24px;line-height:1.35;color:#152238">${escape(title)}</h1>
<p style="font-size:14px;line-height:1.7;margin:0 0 12px">Dear ${escape(evaluation.supervisorName)},</p>
<p style="font-size:14px;line-height:1.7;color:#52647d">You’re invited to review your intern’s performance. Complete the coordinator’s evaluation using the secure button below.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f9fc;border:1px solid #e4eaf3;border-radius:10px;margin:20px 0"><tr><td style="padding:16px;font-size:13px;line-height:1.8"><span style="color:#697991">Student intern</span><br><strong>${escape(evaluation.studentName)}</strong><br><span style="color:#697991">Company / Organization</span><br><strong>${escape(evaluation.companyName)}</strong></td></tr></table>
${message.trim() ? `<div style="margin:18px 0;padding:14px 16px;border-left:3px solid #075fc9;background:#f0f6ff;font-size:14px;line-height:1.7"><strong>Message from coordinator</strong><br>${escape(message.trim()).replace(/\r?\n/g, '<br>')}</div>` : ''}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td style="background:#075fc9;border-radius:10px"><a href="${escape(link)}" style="display:inline-block;padding:15px 24px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">Open Evaluation →</a></td></tr></table>
<p style="font-size:12px;line-height:1.7;color:#697991">Expires ${escape(expires)} (Philippine time). This link can be submitted once. Keep it private and do not forward it.</p>
<p style="font-size:12px;line-height:1.7;color:#697991">Button not working? <a href="${escape(link)}" style="color:#075fc9">Open the secure evaluation link</a>.</p></td></tr>
<tr><td style="padding:18px 28px;background:#f7f9fc;border-top:1px solid #e4eaf3;font-size:12px;color:#697991;border-radius:0 0 16px 16px">PATHWAY OJT Coordination Office<br>Helping students and industry partners stay connected.</td></tr>
</table></td></tr></table></body></html>`;
}
module.exports = { evaluationEmailHtml, verificationCodeHtml };
