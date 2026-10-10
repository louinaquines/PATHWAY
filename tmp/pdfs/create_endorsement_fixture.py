from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

out = Path('output/pdf')
out.mkdir(parents=True, exist_ok=True)
target = out / 'test-only-endorsement.pdf'
c = canvas.Canvas(str(target), pagesize=A4)
c.setTitle('TEST ONLY - Endorsement workflow fixture')
c.setFillColorRGB(0.02, 0.25, 0.5)
c.setFont('Helvetica-Bold', 22)
c.drawString(48, 780, 'PATHWAY - TEST ONLY')
c.setFont('Helvetica-Bold', 13)
c.drawString(48, 745, 'NOT AN ISSUED ENDORSEMENT')
c.setFillColorRGB(0.15, 0.15, 0.15)
c.setFont('Helvetica', 11)
lines = [
    'Purpose: upload, private preview, and attachment workflow testing.',
    'Student: dexter tampus',
    'Company: TEST ONLY - Placement QA Company',
    'Training role: TEST Intern',
    'Test schedule: October 13, 2026 to December 29, 2026',
    '',
    'This file is synthetic and intentionally unsigned.',
    'It does not authorize placement, satisfy institutional requirements,',
    'or represent a verified signed endorsement.',
    '',
    'Approved test inboxes: dex@gmail.com and louinaquines@gmail.com.',
    'Do not forward or use this file for a real application.',
]
for i, line in enumerate(lines):
    c.drawString(48, 690 - i * 24, line)
c.setFont('Helvetica', 9)
c.drawString(48, 48, 'TEST FIXTURE | October 11, 2026 | Page 1 of 1')
c.save()
pdf = PdfReader(target)
assert len(pdf.pages) == 1
assert 'intentionally unsigned' in pdf.pages[0].extract_text()
print('Created and validated test-only PDF; no signature or official authorization.')
