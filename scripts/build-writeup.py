"""Build the three-page submission write-up from its reviewed Markdown source."""
import re, sys
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'output/pdf/forge-agent-writeup.pdf'
out.parent.mkdir(parents=True, exist_ok=True)
source = (root / 'docs/WRITEUP.md').read_text(encoding='utf-8')
sections = re.split(r'^## ', source, flags=re.M)[1:]
if len(sections) != 8:
    raise ValueError('Expected eight ordered write-up sections')
navy = colors.HexColor('#123047')
body = ParagraphStyle('body', fontName='Helvetica', fontSize=8.5, leading=11.2, spaceAfter=5, textColor=colors.HexColor('#243849'))
heading = ParagraphStyle('heading', parent=body, fontName='Helvetica-Bold', fontSize=11, leading=14, spaceBefore=9, spaceAfter=5, textColor=navy)
cell = ParagraphStyle('cell', parent=body, fontSize=7.3, leading=9.1, spaceAfter=0)
small = ParagraphStyle('small', parent=body, fontSize=7.5, leading=10, textColor=colors.HexColor('#526677'))

def clean(t):
    return escape(t.replace('—', '-').replace('–', '-').replace('’', "'").replace('**', '').replace(' ', ' '))

story = [Paragraph('FORGE AGENT', ParagraphStyle('title', parent=heading, fontSize=22, leading=25)), Paragraph('TrueFoundry Forge-a-thon | Technical write-up | 29 October 2026', small), Paragraph('Validation report: Task A and failure recovery verified; Task B status is stated below. Video excluded by user. No competition score is claimed.', small)]
for i, section in enumerate(sections, 1):
    if i in (4, 6):
        story.append(PageBreak())
    title, content = section.split('\n', 1)
    story.append(Paragraph(clean(title.strip()), heading))
    blocks = re.split(r'\n\s*\n', content.strip())
    for block in blocks:
        if block.startswith('|'):
            rows = []
            for line in block.splitlines():
                values = [s.strip().replace('Maximum', 'Max') for s in line.strip().strip('|').split('|')]
                if all(re.fullmatch(r'[: -]+', s) for s in values):
                    continue
                rows.append([Paragraph(clean(v), cell) for v in values])
            table = Table(rows, colWidths=[117, 36, 65, 277], repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E9F1F5')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LINEBELOW',(0,0),(-1,0),0.7,navy),('LINEBELOW',(0,1),(-1,-1),0.3,colors.HexColor('#D7E0E5'))]))
            story.extend([table, Spacer(1,5)])
        elif block.startswith('- '):
            for line in block.splitlines():
                story.append(Paragraph(clean(line[2:]), body, bulletText='-'))
        else:
            story.append(Paragraph(clean(' '.join(block.splitlines())), body))

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#D7E0E5'))
    canvas.line(50, 39, A4[0]-50, 39)
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(colors.HexColor('#526677'))
    canvas.drawString(50, 27, 'Forge Agent | github.com/s2kumar2007/VS-CODE-EXTENSION')
    canvas.drawRightString(A4[0]-50, 27, str(doc.page))

SimpleDocTemplate(str(out), pagesize=A4, rightMargin=50, leftMargin=50, topMargin=35, bottomMargin=49, title='Forge Agent - Forge-a-thon write-up', author='Sunil Kumar').build(story, onFirstPage=footer, onLaterPages=footer)
print(out)
