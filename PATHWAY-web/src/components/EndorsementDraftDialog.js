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
    style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: 'rgba(15, 23, 42, .55)' }}>
    <section role="dialog" aria-modal="true" aria-labelledby="endorsement-draft-title"
      style={{ width: 'min(820px, 100%)', maxHeight: '92vh', overflowY: 'auto', borderRadius: 16, background: '#F8FAFC', boxShadow: '0 24px 70px rgba(15,23,42,.28)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px', background: '#0B2540', color: '#fff' }}>
        <div><strong id="endorsement-draft-title">Endorsement letter draft</strong><div style={{ fontSize: 12, opacity: .8, marginTop: 3 }}>Draft {draft.draftVersion} · Template {draft.templateVersion} · Prepared {preparedDate}</div></div>
        <button type="button" onClick={onClose} aria-label="Close draft preview" style={{ border: 0, borderRadius: 8, padding: '8px 12px', background: '#244361', color: '#fff', cursor: 'pointer' }}>Close</button>
      </header>
      <div style={{ padding: 20 }}>
        <div role="alert" style={{ marginBottom: 14, padding: 12, border: '1px solid #F59E0B', borderRadius: 10, background: '#FFFBEB', color: '#92400E', fontWeight: 800, textAlign: 'center' }}>
          DRAFT ONLY — requires coordinator review and authorized signature. It has not been issued or sent.
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
        <p style={{ color: '#64748B', fontSize: 12, textAlign: 'center', margin: '12px 0 18px' }}>Printing or saving a PDF does not issue the letter or store a file in PATHWAY.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '10px 14px', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 700 }}>Close</button>
          <button type="button" onClick={printDraft} style={{ border: 0, borderRadius: 8, padding: '10px 14px', background: '#0284C7', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Print / Save draft as PDF</button>
        </div>
      </div>
    </section>
  </div>;
}
