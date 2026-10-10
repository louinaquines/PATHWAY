from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from pypdf import PdfReader

path = 'C:/Users/Lenovo/PATHWAY-main/output/pdf/test-only-fictional-signature.pdf'
c = canvas.Canvas(path, pagesize=A4)
c.setTitle('TEST ONLY - Fictional signature upload fixture')
w, h = A4
c.setFillColor(HexColor('#075DC7'))
c.rect(0, h-105, w, 105, fill=1, stroke=0)
c.setFillColor(HexColor('#FFFFFF'))
c.setFont('Helvetica-Bold', 22)
c.drawString(48, h-54, 'TEST ONLY - NOT VALID')
c.setFont('Helvetica', 11)
c.drawString(48, h-78, 'PATHWAY document upload and preview test')
c.setFillColor(HexColor('#162238'))
c.setFont('Helvetica-Bold', 18)
c.drawString(48, h-155, 'Sample endorsement fixture')
c.setFont('Helvetica', 11)
lines = [
    'Student: Demo Student (fictional)',
    'Company: Demo Test Company (fictional)',
    'Purpose: Test PDF upload, preview, replacement, and attachment handling.',
    '',
    'This document is not an issued endorsement or an institutional approval.',
    'All names and the signature below are invented for software testing.',
    'Do not use this file to establish student eligibility or approve real records.',
]
y = h-193
for line in lines:
    c.drawString(48, y, line)
    y -= 23
c.setFillColor(HexColor('#F1F6FD'))
c.roundRect(48, 230, w-96, 155, 12, fill=1, stroke=0)
c.setFillColor(HexColor('#075DC7'))
c.setFont('Times-Italic', 32)
c.drawString(70, 325, 'Demo Signer')
c.setLineWidth(1)
c.line(70, 310, 285, 310)
c.setFillColor(HexColor('#162238'))
c.setFont('Helvetica-Bold', 11)
c.drawString(70, 284, 'FICTIONAL SIGNATURE - TEST ONLY')
c.setFont('Helvetica', 10)
c.drawString(70, 262, 'Decorative text only. Not a digital signature or a real person\'s signature.')
c.setFont('Helvetica-Bold', 10)
c.drawString(48, 70, 'NOT VALID FOR OFFICIAL USE | NO INSTITUTIONAL AUTHORIZATION')
c.save()
r = PdfReader(path)
assert len(r.pages) == 1
assert 'FICTIONAL SIGNATURE - TEST ONLY' in r.pages[0].extract_text()
print(path)
