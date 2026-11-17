import './EndorsementDraftDialog.css';
import React from 'react';
import PathwayLogo, { PATHWAY_LOGO_SOURCE } from './PathwayLogo';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function buildPrintDocument(draft) {
  const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, escapeHtml(value)]));
  const startDate = escapeHtml(formatDate(draft.startDate));
  const endDate = escapeHtml(formatDate(draft.endDate));
  const preparedDate = escapeHtml(new Date(draft.preparedAt).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
  }));
  const logo = escapeHtml(PATHWAY_LOGO_SOURCE);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DRAFT Endorsement Letter — ${values.studentName}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17243a; font: 14px/1.65 Arial, sans-serif; }
    .page { max-width: 780px; margin: 28px auto; padding: 0 24px; }
    .draft-banner { padding: 10px 14px; border: 2px solid #b45309; background: #fffbeb; color: #92400e; text-align: center; font-weight: 800; letter-spacing: .08em; }
    .draft-meta { margin: 7px 0 22px; color: #64748b; text-align: center; font-size: 10px; }
    .header { display: flex; align-items: center; gap: 16px; margin: 26px 0 32px; padding-bottom: 18px; border-bottom: 2px solid #0b2540; }
    .logo { width: 64px; height: 64px; object-fit: contain; }
    .brand { color: #0b2540; font-size: 21px; font-weight: 800; letter-spacing: .18em; }
    .school { margin-top: 3px; color: #52647c; font-size: 12px; }
    .program { color: #52647c; font-size: 12px; font-weight: 700; }
    .date { margin: 24px 0; text-align: right; }
    .recipient { margin: 20px 0; }
    .subject { margin: 24px 0 18px; font-weight: 700; }
    .body-copy { margin: 0 0 16px; text-align: justify; }
    .placement { margin: 18px 0; padding: 14px 18px; border-left: 3px solid #0284c7; background: #f0f9ff; }
    .placement div { margin: 3px 0; }
    .signature { margin-top: 54px; }
    .signature-line { width: 260px; max-width: 70%; margin-top: 42px; border-top: 1px solid #334155; }
    .signature-note { color: #92400e; font-size: 12px; font-weight: 700; }
    .footer { margin-top: 38px; padding-top: 10px; border-top: 1px solid #cbd5e1; color: #92400e; text-align: center; font-size: 11px; font-weight: 800; }
    .screen-actions { display: flex; justify-content: center; gap: 10px; margin: 24px auto; }
    .screen-actions button { border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; font-weight: 700; }
    @media print { .page { max-width: none; margin: 0; padding: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <div class="draft-banner">DRAFT — FOR COORDINATOR REVIEW</div>
    <div class="draft-meta">Draft ${values.draftVersion} · Template ${values.templateVersion} · Prepared by ${values.preparedBy} · ${preparedDate}</div>
    <header class="header">
      <img class="logo" src="${logo}" alt="PATHWAY logo" />
      <div><div class="brand">PATHWAY</div><div class="school">University of Cebu – Lapu-Lapu and Mandaue</div><div class="program">On-the-Job Training Program</div></div>
    </header>
    <div class="date">${preparedDate}</div>
    <section class="recipient"><strong>${values.companyName}</strong><br />${values.companyAddress}<br />Attention: ${values.supervisorName}, Company Supervisor</section>
    <div class="subject">Subject: Student endorsement for On-the-Job Training</div>
    <p>Dear ${values.supervisorName},</p>
    <p class="body-copy">The University of Cebu – Lapu-Lapu and Mandaue respectfully endorses <strong>${values.studentName}</strong>, from ${values.department}${values.sectionName ? `, ${values.sectionName}` : ''}, for the approved on-the-job training placement at <strong>${values.companyName}</strong>.</p>
    <p class="body-copy">The student’s approved assignment is <strong>${values.internshipRole}</strong>, under your supervision, for the period from <strong>${startDate}</strong> to <strong>${endDate}</strong>. We request your support in providing appropriate workplace guidance and in coordinating the student’s training with the OJT program.</p>
    <div class="placement">
      <div><strong>Student:</strong> ${values.studentName}</div>
      <div><strong>Company:</strong> ${values.companyName}</div>
      <div><strong>Supervisor:</strong> ${values.supervisorName}</div>
      <div><strong>Training role:</strong> ${values.internshipRole}</div>
      <div><strong>Training period:</strong> ${startDate} – ${endDate}</div>
    </div>
    <p class="body-copy">Thank you for providing the student with an opportunity to complete the required internship experience.</p>
    <p>Respectfully,</p>
    <div class="signature">
      <div class="signature-line"></div>
      <strong>Authorized OJT Coordinator</strong><br />
      ${values.department}<br />
      <span class="signature-note">Authorized name, signature, and official designation must be added before issuance.</span>
    </div>
    <footer class="footer">DRAFT ONLY · NOT SIGNED · NOT ISSUED · NOT SENT</footer>
  </main>
</body>
</html>`;
}

export default function EndorsementDraftDialog({ draft, onClose }) {
  if (!draft) return null;

  const preparedDate = new Date(draft.preparedAt).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const printDraft = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      window.alert('Allow pop-ups for this site to print or save the draft as PDF.');
      return;
    }
    printWindow.opener = null;
    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
    printWindow.document.open();
    printWindow.document.write(buildPrintDocument(draft));
    printWindow.document.close();
  };

  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    className="edd-overlay">
    <section role="dialog" aria-modal="true" aria-labelledby="endorsement-draft-title"
      className="edd">
      <header className="edd-head">
        <div><h2 id="endorsement-draft-title">Endorsement letter <b className="edd-chip">Draft v{draft.draftVersion}</b></h2><p>Prepared {preparedDate}<span title={`Template ${draft.templateVersion}`}> · {draft.preparedBy || 'Coordinator'}</span></p></div>
        <button type="button" className="edd-x" onClick={onClose} aria-label="Close draft preview"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="edd-body">
        <div role="alert" className="edd-note">
          <strong>Draft only.</strong> It needs the coordinator’s signature and hasn’t been issued or sent.
        </div>
        <article style={{ maxWidth: 700, margin: '0 auto', padding: '30px clamp(18px, 5vw, 48px)', background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 4px 14px rgba(15,23,42,.06)', color: '#17243A', lineHeight: 1.65 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '2px solid #0B2540' }}>
            <PathwayLogo size={56} />
            <div><div style={{ color: '#0B2540', fontSize: 20, fontWeight: 900, letterSpacing: '.16em' }}>PATHWAY</div><div style={{ fontSize: 12, color: '#52647C' }}>University of Cebu – Lapu-Lapu and Mandaue</div><div style={{ fontSize: 12, color: '#52647C', fontWeight: 700 }}>On-the-Job Training Program</div></div>
          </div>
          <p style={{ textAlign: 'right', marginTop: 24 }}>{new Date(draft.preparedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><strong>{draft.companyName}</strong><br />{draft.companyAddress}<br />Attention: {draft.supervisorName}, Company Supervisor</p>
          <p><strong>Subject: Student endorsement for On-the-Job Training</strong></p>
          <p>Dear {draft.supervisorName},</p>
          <p style={{ textAlign: 'justify' }}>The University of Cebu – Lapu-Lapu and Mandaue respectfully endorses <strong>{draft.studentName}</strong>, from {draft.department}{draft.sectionName ? `, ${draft.sectionName}` : ''}, for the approved on-the-job training placement at <strong>{draft.companyName}</strong>.</p>
          <p style={{ textAlign: 'justify' }}>The student’s approved assignment is <strong>{draft.internshipRole}</strong>, under your supervision, for the period from <strong>{formatDate(draft.startDate)}</strong> to <strong>{formatDate(draft.endDate)}</strong>. We request your support in providing appropriate workplace guidance and in coordinating the student’s training with the OJT program.</p>
          <div style={{ margin: '18px 0', padding: '12px 16px', borderLeft: '3px solid #0284C7', background: '#F0F9FF' }}>
            <div><strong>Student:</strong> {draft.studentName}</div><div><strong>Company:</strong> {draft.companyName}</div><div><strong>Supervisor:</strong> {draft.supervisorName}</div><div><strong>Training role:</strong> {draft.internshipRole}</div><div><strong>Training period:</strong> {formatDate(draft.startDate)} – {formatDate(draft.endDate)}</div>
          </div>
          <p>Thank you for providing the student with an opportunity to complete the required internship experience.</p>
          <p>Respectfully,</p>
          <div style={{ marginTop: 48 }}><div style={{ width: 260, maxWidth: '70%', borderTop: '1px solid #334155', paddingTop: 8 }}><strong>Authorized OJT Coordinator</strong><br />{draft.department}</div><p style={{ color: '#92400E', fontSize: 12, fontWeight: 700 }}>Authorized name, signature, and official designation must be added before issuance.</p></div>
        </article>
        </div>
      <footer className="edd-foot">
        <span>Printing doesn’t issue the letter or save it in PATHWAY.</span>
        <div>
          <button type="button" className="edd-btn" onClick={onClose}>Close</button>
          <button type="button" className="edd-btn edd-primary" onClick={printDraft}>Print or save as PDF</button>
        </div>
      </footer>
    </section>
  </div>;
}
