import sys, zipfile, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
with zipfile.ZipFile('C:/Users/Lenovo/PATHWAY-main/PATHWAY-OJT-Management-System-with-AI-Analytics-1.docx') as z:
    root = ET.fromstring(z.read('word/document.xml'))
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    paragraphs = root.findall('.//w:body//w:p', ns)
    start, end = map(int, sys.argv[1:3])
    for i, p in enumerate(paragraphs):
        if start <= i < end:
            text = ''.join(t.text or '' for t in p.findall('.//w:t', ns))
            if text.strip(): print(f'{i}: {text}')
