const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function evaluationEmailHtml(evaluation, message, link) {
  const expires = new Date(evaluation.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  const title = evaluation.formDefinition?.title || 'Supervisor evaluation request';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8fc;font-family:Arial,Helvetica,sans-serif;color:#152238">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fc"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dbe5f2;border-radius:16px">
<tr><td style="padding:24px 28px;border-bottom:1px solid #e4eaf3"><span style="font-size:24px;font-weight:bold;letter-spacing:2px;color:#075fc9">PATHWAY</span><div style="margin-top:6px;font-size:12px;color:#697991">OJT Management System · Supervisor Portal</div></td></tr>
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
module.exports = { evaluationEmailHtml };
