import re, html
from datetime import date
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

root=Path(__file__).resolve().parents[1]
export_date=date.today().strftime('%d.%m.%Y')
src=root/'docs/plans/plan-0010-general-catalog-and-seo.md'
out=root/'docs/reports/fillando-implementation-plan.pdf'
font_pairs = [
    (Path('/System/Library/Fonts/Supplemental/Arial.ttf'), Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')),
    (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
]
fonts = next((pair for pair in font_pairs if all(p.exists() for p in pair)), None)
if fonts is None:
    raise SystemExit('Install Arial or DejaVu Sans with Cyrillic support')
for name, file in zip(('UA', 'UAB'), fonts):
    pdfmetrics.registerFont(TTFont(name, str(file)))
pdfmetrics.registerFontFamily('UA',normal='UA',bold='UAB',italic='UA',boldItalic='UAB')
styles={
 'body':ParagraphStyle('body',fontName='UA',fontSize=10,leading=14.5,spaceAfter=9,textColor=colors.HexColor('#253348')),
 'h1':ParagraphStyle('h1',fontName='UAB',fontSize=24,leading=30,spaceAfter=18,textColor=colors.HexColor('#153d35')),
 'h2':ParagraphStyle('h2',fontName='UAB',fontSize=17,leading=22,spaceAfter=13,keepWithNext=True,textColor=colors.HexColor('#153d35')),
 'h3':ParagraphStyle('h3',fontName='UAB',fontSize=12,leading=17,spaceAfter=8,spaceBefore=7,keepWithNext=True,textColor=colors.HexColor('#153d35')),
 'small':ParagraphStyle('small',fontName='UA',fontSize=8.5,leading=12,spaceAfter=6,textColor=colors.HexColor('#536275')),
}
def inline(s):
    s=re.sub(r'\[([^]]+)\]\(([^)]+)\)',lambda m:m[1],s)
    s=html.escape(s).replace('☐','□')
    s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'<font color="#17664e">\1</font>',s)
    return s
def para(s,k='body'): return Paragraph(inline(s),styles[k])
status_palette = {
    'Виконано': ('#166534', '#e8f5e9'),
    'У роботі': ('#174ea6', '#e8f0fe'),
    'Частково виконано': ('#805500', '#fff4ce'),
    'Заплановано': ('#526070', '#eef1f4'),
}
def status_kind(label):
    label = label.replace('**', '').strip()
    for kind in status_palette:
        if label.startswith(kind):
            return kind
    raise ValueError(f'Unknown task status: {label}')

def status_badge(label):
    fg, bg = status_palette[status_kind(label)]
    style = ParagraphStyle('badge', parent=styles['small'], fontName='UAB',
                           textColor=colors.HexColor(fg), spaceAfter=0)
    badge = Table([[Paragraph(inline(label), style)]], colWidths=[499])
    badge.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg)),
        ('LINEBEFORE', (0,0), (0,-1), 3, colors.HexColor(fg)),
        ('LEFTPADDING', (0,0), (-1,-1), 9),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    return badge

story=[]
plan=src.read_text()
task_statuses = [line.strip().strip('|').split('|')[-1].strip()
                 for line in plan.splitlines() if re.match(r'^\| [DBFR]\d{2} \|', line)]
status_counts = {kind: sum(status_kind(label) == kind for label in task_statuses)
                 for kind in status_palette}
status=re.search(r'^- \*\*Status:\*\* ([^—\n]+)',plan,re.M).group(1).strip()
evidence=root/'docs/plans/plan-0010-m0-evidence.md'
raw=plan+'\n\n'+evidence.read_text()
# Join Markdown soft line breaks, including wrapped bullet text.
lines=[]
for line in raw.splitlines():
    structural=bool(re.match(r'^(#|\||- |\d+\. )',line))
    if line.strip() and not structural and lines and lines[-1].strip() and not lines[-1].startswith(('#','|')):
        lines[-1]+=' '+line.strip()
    else:
        lines.append(line)
out.parent.mkdir(parents=True,exist_ok=True)
i=0
while i<len(lines):
    line=lines[i].strip()
    if not line: i+=1; continue
    if line.startswith('# '):
        if story: story.append(PageBreak())
        story += [para('FILLANDO / ПЛАН РЕАЛІЗАЦІЇ','small'),para(line[2:],'h1'),para(f'Оновлено {export_date} • План і актуальний звіт виконання M0','small')]
        if line.startswith('# Plan-0010 '):
            story.append(para(f'Статуси завдань плану — всього {len(task_statuses)}. Кожне завдання враховано один раз.', 'small'))
            for kind, count in status_counts.items():
                story.extend([status_badge(f'{kind} — {count}'), Spacer(1,5)])
            story.append(para('Статуси стосуються пунктів плану. Виконаний дизайн або локальний аудит не означає запуск можливості для покупців.', 'small'))
        i+=1; continue
    if line.startswith('## '):
        # Objective and scope stay together; all other major sections begin on a fresh page.
        if not line.startswith('## 2.'): story.append(PageBreak())
        story.append(para(line[3:],'h2')); i+=1; continue
    if line.startswith('### '):
        if line.startswith('### M') and not line.startswith('### M0'):
            story.append(PageBreak())
        story.append(para(line[4:],'h3')); i+=1; continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            vals=[x.strip() for x in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?',x) for x in vals): rows.append(vals)
            i+=1
        head=rows[0]
        if head[0]=='ID':
            # Task cards preserve the full content and dependencies without cramped columns.
            # Status is the last column; the pre-release table (§8) has no dependency column.
            for row in rows[1:]:
                story.append(KeepTogether([
                    status_badge(row[-1]),
                    para(f'{row[0]} · {row[2]}','h3'),
                    para(row[1]),
                    *([para(f'Залежить від: {row[3]}','small')] if len(row) >= 5 else []),
                    Spacer(1,4)]))
        else:
            widths=[110,230,159] if head[0]=='Етап' else [128,240,131]
            data=[[para(x,'small') for x in r] for r in rows]
            t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
            t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e0eee8')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),0.4,colors.HexColor('#dce3e7'))]))
            story += [t,Spacer(1,12)]
        continue
    if line.startswith('- '): line='• '+line[2:]
    story.append(para(line)); i+=1

def footer(c,doc):
    c.setStrokeColor(colors.HexColor('#dce3e7')); c.line(48,43,A4[0]-48,43)
    c.setFont('UA',8); c.setFillColor(colors.HexColor('#657184'))
    c.drawString(48,29,f'Fillando • Plan-0010 • {status} • {export_date}')
    c.drawRightString(A4[0]-48,29,str(doc.page))
doc=SimpleDocTemplate(str(out),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=43,bottomMargin=58,title='Plan-0010 — Універсальний каталог із пріоритетом SEO',author='Fillando / Codex')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
