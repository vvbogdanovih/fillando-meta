"""Printable release-day plan for the catalogue v2 release (Plan-0010 R02), the short version.

The runbook `docs/runbooks/catalog-v2-release.md` is the source of truth; this script lays its day out as
six steps around `scripts/catalog-release.mjs` (owner decision 02.11.2026: one script, short PDF), with
what the script prints when it stops, the rollback, and the preparation before and after the day.
Regenerate after every runbook change (see docs/reports/README.md):

    /tmp/fillando-pdf-venv/bin/python scripts/export-release-day-pdf.py
"""
import html
import re
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (PageBreak, Paragraph, Preformatted,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

root = Path(__file__).resolve().parents[1]
out = root / 'docs/reports/fillando-release-day.pdf'
export_date = date.today().strftime('%d.%m.%Y')
RUNBOOK = 'docs/runbooks/catalog-v2-release.md'

font_sets = [
    ('/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
     '/System/Library/Fonts/Supplemental/Courier New.ttf'),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
     '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'),
]
fonts = next((s for s in font_sets if all(Path(p).exists() for p in s)), None)
if fonts is None:
    raise SystemExit('Install Arial + Courier New or DejaVu Sans (+ Mono) with Cyrillic support')
for name, file in zip(('UA', 'UAB', 'Mono'), fonts):
    pdfmetrics.registerFont(TTFont(name, file))
pdfmetrics.registerFontFamily('UA', normal='UA', bold='UAB', italic='UA', boldItalic='UAB')

INK, MUTED, BRAND = '#253348', '#5b6878', '#153d35'
PHASES = {
    'prep': ('#526070', '#eef1f4', 'Підготовка'),
    'deploy': ('#174ea6', '#e8f0fe', 'Деплой'),
    'window': ('#8a5a00', '#fff4ce', 'Вікно обслуговування'),
    'open': ('#166534', '#e8f5e9', 'Відкриття'),
    'check': ('#0f5e6b', '#e3f4f6', 'Перевірки'),
    'danger': ('#b42318', '#fdecea', 'Аварійне'),
}
W = A4[0] - 2 * 44  # frame width


def S(name, **kw):
    base = dict(fontName='UA', fontSize=9.6, leading=13.6, textColor=colors.HexColor(INK))
    base.update(kw)
    return ParagraphStyle(name, **base)


st = {
    'body': S('body', spaceAfter=5),
    'small': S('small', fontSize=8.2, leading=11.4, textColor=colors.HexColor(MUTED)),
    'label': S('label', fontName='UAB', fontSize=8, leading=10, textColor=colors.HexColor(MUTED)),
    'title': S('title', fontName='UAB', fontSize=30, leading=36, textColor=colors.HexColor(BRAND)),
    'lead': S('lead', fontSize=12, leading=17, textColor=colors.HexColor(INK)),
    'h1': S('h1', fontName='UAB', fontSize=19, leading=24, spaceAfter=4, textColor=colors.HexColor(BRAND)),
    'h2': S('h2', fontName='UAB', fontSize=12.5, leading=16, textColor=colors.HexColor(BRAND)),
    'step': S('step', fontName='UAB', fontSize=11.5, leading=15),
    'num': S('num', fontName='UAB', fontSize=15, leading=18, alignment=1, textColor=colors.white),
    'check': S('check', leftIndent=15, bulletIndent=0, spaceAfter=3, bulletFontName='UA', bulletFontSize=11),
    'bullet': S('bullet', leftIndent=11, bulletIndent=0, spaceAfter=2.5),
    'box': S('box', fontSize=9, leading=12.6, spaceAfter=2),
    'tile_n': S('tile_n', fontName='UAB', fontSize=19, leading=22, textColor=colors.HexColor(BRAND)),
    'tile_t': S('tile_t', fontSize=8.6, leading=11.5, textColor=colors.HexColor(MUTED)),
    'cell': S('cell', fontSize=8.6, leading=11.6),
    'cellb': S('cellb', fontName='UAB', fontSize=8.6, leading=11.6),
}
code_style = ParagraphStyle('code', fontName='Mono', fontSize=7.3, leading=9.6,
                            textColor=colors.HexColor('#1f2933'))


def inline(s):
    s = html.escape(s)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`([^`]+)`', r'<font name="Mono" size="8.4" color="#17664e">\1</font>', s)
    return s


def P(s, k='body'):
    return Paragraph(inline(s), st[k])


def checks(items):
    return [Paragraph(inline(i), st['check'], bulletText='□') for i in items]


def bullets(items, k='bullet'):
    return [Paragraph(inline(i), st[k], bulletText='•') for i in items]


def code(text, width):
    t = Table([[Preformatted(text.strip('\n'), code_style, maxLineLength=100, newLineChars='    ')]],
              colWidths=[width])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f3f5f7')),
        ('LINEBEFORE', (0, 0), (0, -1), 2, colors.HexColor('#c5ccd4')),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def box(kind, title, lines, width):
    fg, bg = {'ok': ('#166534', '#e8f5e9'), 'stop': ('#b42318', '#fdecea'),
              'note': ('#8a5a00', '#fff4ce'), 'info': ('#174ea6', '#e8f0fe')}[kind]
    head = ParagraphStyle('bh', parent=st['box'], fontName='UAB', textColor=colors.HexColor(fg))
    body = [Paragraph(inline(title), head)]
    body += [Paragraph(inline(l), st['box'], bulletText='•') if len(lines) > 1 else Paragraph(inline(l), st['box'])
             for l in lines]
    t = Table([[body]], colWidths=[width])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(bg)),
        ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor(fg)),
        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


STRIPE = 34
INNER = W - STRIPE - 18


def card(num, phase, title, where, blocks):
    """A step: coloured stripe with the number, then rows of content (rows split across pages)."""
    fg, bg, _ = PHASES[phase]
    head = [Paragraph(inline(title), st['step'])]
    if where:
        head.append(Paragraph(inline(where), st['small']))
    rows = [[Paragraph(str(num), st['num']), head]]
    for b in blocks:
        kind, val = b
        if kind == 'p':
            cell = P(val)
        elif kind == 'checks':
            cell = checks(val)
        elif kind == 'bullets':
            cell = bullets(val)
        elif kind == 'code':
            cell = code(val, INNER)
        elif kind in ('ok', 'stop', 'note', 'info'):
            cell = box(kind, val[0], val[1], INNER)
        else:
            raise ValueError(kind)
        rows.append(['', cell])
    t = Table(rows, colWidths=[STRIPE, W - STRIPE])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor(fg)),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor(bg)),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (1, 0), (1, -1), 10), ('RIGHTPADDING', (1, 0), (1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 7), ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
        ('TOPPADDING', (0, 1), (-1, -1), 4), ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 9),
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#d5dbe1')),
        ('NOSPLIT', (0, 0), (-1, min(1, len(rows) - 1))),
    ]))
    return [t, Spacer(1, 12)]


def section(title, phase, intro=None):
    fg, bg, label = PHASES[phase]
    bar = Table([[Paragraph(inline(label.upper()), ParagraphStyle('sl', parent=st['label'],
                                                                   textColor=colors.HexColor(fg)))],
                 [Paragraph(inline(title), st['h1'])]], colWidths=[W])
    bar.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 4, colors.HexColor(fg)),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, 0), 8),
    ]))
    flow = [bar]
    if intro:
        flow.append(P(intro))
    flow.append(Spacer(1, 8))
    return flow


def table(header, rows, widths, phase_col=None):
    data = [[Paragraph(inline(h), st['cellb']) for h in header]]
    for r in rows:
        data.append([Paragraph(inline(c), st['cell']) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e0eee8')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#dce3e7')),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    if phase_col:
        for i, phase in enumerate(phase_col, start=1):
            style.append(('BACKGROUND', (0, i), (0, i), colors.HexColor(PHASES[phase][1])))
    t.setStyle(TableStyle(style))
    return t


story = []

# ---------------------------------------------------------------- page 1: the day in six steps
story += [
    P('FILLANDO · РЕЛІЗ НОВОГО КАТАЛОГУ (PLAN-0010 R02)', 'label'),
    Spacer(1, 4),
    P('План дня релізу', 'title'),
    Spacer(1, 4),
    P('Шість кроків. Бекап, міграцію, перевірки й очищення кешу робить один скрипт. Якщо щось не так, '
      'він зупиняється сам і пише, що робити.', 'lead'),
    Spacer(1, 12),
]
story.append(box('note', 'Дату призначати лише після цього (стан на 02.11.2026)', [
    'Код Plan-0010 закомічений у `dev` обох репо (§8 і попередні пакети), тести зелені.',
    'Тексти вітрини (D07/F11): ваше рішення, що продаємо, і правка чернеток.',
    'Репетиція на Railway/Atlas (Б) і на свіжому дампі ≤ 24 год до релізу з перевіркою на Android (В) — с. 4.',
], W))
story.append(Spacer(1, 12))
story += card(1, 'deploy', 'Оновити бекенд', 'GitHub → Railway', [
    ('checks', ['Merge `dev` → `production` у `fillando-be`; дочекатися успішного деплою в Railway.']),
])
story += card(2, 'deploy', 'Оновити вітрину й адмінку', 'GitHub → Railway', [
    ('checks', ['Merge `dev` → `production` у `fillando-fe`; дочекатися деплою.',
                'Відкрити `/filament` і товар — сайт працює як раніше (дані ще старі).']),
])
story += card(3, 'window', 'Зупинити записи в каталог', 'з цього моменту — вікно обслуговування', [
    ('checks', ['Railway → `fillando-be` → Variables: `RUN_CRON=false` → Redeploy (зупиняє Prom sync і cron).',
                'Адмінам: не редагувати товари, категорії, кольори й лендінги до кроку 5.',
                'Ноутбук: у `fillando-be/.env` підставити production — `DATABASE_URL=…/fillando-prod` (Atlas). '
                'Локальний бекенд у цей час не запускати: він працюватиме з production.']),
])
story += card(4, 'window', 'Запустити скрипт релізу', 'ноутбук на живленні, сон вимкнено; кілька хвилин', [
    ('code', 'cd ~/шлях/до/fillando-meta\nnode scripts/catalog-release.mjs'),
    ('p', 'Базу скрипт бере з `DATABASE_URL` у `fillando-be/.env`, показує її хост і питає «так/ні». Приховано питає '
          '`INTERNAL_API_TOKEN` (Railway → fillando-be) і `REVALIDATE_SECRET` (Railway → fillando-fe); partner-токен і '
          'cookie адміна — за бажанням (без них дві перевірки — SKIP). Ще двічі «так/ні»: чи зупинено записи і чи '
          'кількості dry-run = репетиція В.'),
    ('note', ('Міграцію не переривати', [
        'Поки вона йде, каталог і checkout відповідають 503. Поруч із базою це секунди, з ноутбука до Atlas — '
        'хвилини: скрипт міряє затримку й називає очікуваний час після dry-run, а під час міграції показує хід '
        '(«записано 127 з 360»). Ctrl-C у цей час він не приймає.',
        'Якщо процес усе ж обірвався (сон ноутбука, мережа) — запустити ту саму команду: вона продовжить '
        'міграцію з місця зупинки.'])),
    ('ok', ('Очікується в кінці', ['«Автоматична частина релізу пройшла» і список ручних перевірок.'])),
    ('stop', ('Якщо скрипт зупинився', ['Прочитати, що він пише (с. 3), виправити причину й запустити ту саму '
                                       'команду — він продовжить з того самого кроку.'])),
])
story += card(5, 'open', 'Увімкнути записи назад', 'Railway, адмінка — кінець вікна обслуговування', [
    ('checks', ['Railway → `fillando-be`: `RUN_CRON=true` (один інстанс) → Redeploy.',
                'Адмінка → перший Prom sync → дочекатися «done». Адмінам: можна редагувати.']),
])
story += card(6, 'check', 'Перевірити руками', '~10 хвилин', [
    ('checks', [
        'Як покупець: головна → «Каталог» → «Філамент» → «Чорний» + PLA → лендінг → товар → кошик → checkout.',
        'Нова адмінка: змінити характеристику товару — видно на сторінці; повернути. У логах `fillando-be` — '
        '`cache purged` і через 10 с `after echo`.',
        'Ліміти запитів — з двох різних мереж (ноутбук і телефон): `19`, `18`, `17`, а з другої знову `19`:',
    ]),
    ('code', r'''
U=https://api.fillando.com/discount-coupons/validate
for i in 1 2 3; do curl -s -o /dev/null -D - -X POST $U -H 'Content-Type: application/json' \
  --data '{"code":"RELEASECHECK"}' | grep -i x-ratelimit-remaining; done
'''),
    ('checks', ['Повернути `DATABASE_URL` у `fillando-be/.env` на локальну базу (скрипт нагадає).',
                'Відкликати тимчасовий partner-токен; архів бекапу — у захищене сховище.']),
])

story += card('!', 'danger', 'Відкат', 'якщо реліз треба скасувати', [
    ('p', 'Відновити з бекапу цього релізу **лише колекції каталогу** — замовлення, користувачі й кошики не зачіпаються '
          '(архів — у теці релізу, скрипт показує шлях, коли зупиняється):'),
    ('code', r'''
read -rs DATABASE_URL && export DATABASE_URL      # той самий, що в fillando-be/.env
mongorestore --uri "$DATABASE_URL" --gzip --drop \
  --archive=$HOME/fillando-release-YYYYMMDD/fillando-prod-YYYYMMDD.archive \
  --nsInclude 'fillando-prod.categories' --nsInclude 'fillando-prod.products' \
  --nsInclude 'fillando-prod.product_variants' --nsInclude 'fillando-prod.landings' \
  --nsInclude 'fillando-prod.colors' --nsInclude 'fillando-prod.brands'
'''),
    ('p', 'Потім **обовʼязково** Railway → `fillando-be` → Redeploy з `RUN_CRON=true` (без перезапуску фід лишається мігрованим) '
          'і очищення кешу вітрини (рунбук §3.8). Повний відкат застосунків — спершу відновлення, потім Railway rollback BE і FE.'),
    ('note', ('Якщо адміни вже змінили каталог', [
        'Їхні правки після відкриття записів пропадуть. Через дні після релізу не відкочувати — виправляти вперед.'])),
])

# ---------------------------------------------------------------- page 2: the script, stops, rollback
story.append(PageBreak())
story += section('Що робить скрипт і що робити, якщо він зупинився', 'window',
                 'Ті самі інструменти й порядок, що в рунбуку §3.4–3.10. Перевірено 02.11.2026 на копії дампу 27.10 '
                 'у production-режимі: повний прогін, зупинка й продовження, запис після бекапу, невірний секрет; '
                 'відкат відновленням з бекапу — 06.11.2026 на бекапі 05.11; обрив міграції посеред запису з '
                 'затримкою мережі 45 мс і продовження тією самою командою — 15.11.2026 на бекапі 08.11.')
steps = [
    ('0', 'Перевірка перед стартом', 'інструменти, ноутбук на коміті `production` без незакомічених змін, локальний MongoDB 27019, '
     'стан каталогу в базі, новий BE і нова вітрина відповідають, затримка до бази'),
    ('1', 'Бекап', '`mongodump` production → відновлення в локальну перевірочну базу → маніфест (без нього міграція не запуститься)'),
    ('2', 'Знімок «до»', 'партнерський API, прайс-лист, PDF, фід, лістинги, лендінги, sitemap'),
    ('3', 'Dry-run', 'кількості: товари, SKU, лендінги, цілі (на дампі 27.10 — 44 / 301 / 14 / 360); скільки каталог буде закритий'),
    ('4', 'Міграція', 'каталог і checkout — 503 «каталог оновлюється»: секунди поруч із базою, хвилини з ноутбука до Atlas '
     '(360 цілей × 4 запити × затримка: 72 с при 40 мс); одразу після неї — перше очищення кешу вітрини'),
    ('5', 'Знімок «після»', '`ALL CHECKS PASSED` (зокрема стрічка товарів головної): усе як було, крім допису «Філамент (пластик для 3D-друку)» у назвах '
     'і заголовках фіду, «Матеріалу», якого більше немає, і прайсів за категоріями; каталог у `phase: idle`'),
    ('6', 'Очищення кешу вітрини', 'три запити, кожен 200'),
    ('7', 'Адмінка', 'відкриває записи нової адмінки'),
    ('8', 'SEO', 'статуси, переадресації, canonical для браузера й Googlebot; рекламний клік із `gclid` і `gad_source` — 200'),
]
story.append(table(['№', 'Крок', 'Що перевіряє'], steps, [26, 120, W - 146]))
story.append(Spacer(1, 12))
stops = [
    ('Немає `mongodump` / MongoDB 27019 недоступний', '`brew install mongodb-database-tools` / `yarn db:up` у `fillando-be`; запустити знову'),
    ('Ноутбук не на коміті `production`', 'Перейти на задеплоєний коміт `fillando-be` (`git checkout`, `yarn install`)'),
    ('Новий BE / нову вітрину ще не задеплоєно', 'Дочекатися кроку 1 / кроку 2'),
    ('Тека від іншого запуску', 'У цій теці стан репетиції або іншої бази. Додати `--dir=<нова тека>`, як радить скрипт; '
     'репетиції завжди запускати з власним `--dir`'),
    ('Міграцію перервано: каталог закритий, покупці бачать 503', '**Запустити ту саму команду ще раз** — вона продовжить з місця '
     'зупинки; записане не втрачається. Лише якщо й це не вдається — відкат (с. 2) після `rollback` (рунбук §3.6, §5)'),
    ('Каталог закритий операцією, яка не з цієї теки', 'Міграція з іншої теки — та сама команда з `--dir=<та тека>`; '
     'перерване збереження адмінки — рунбук §5, `catalog-recover.cjs`'),
    ('Кількості dry-run не збігаються з репетицією В', '**Реліз переноситься.** `RUN_CRON=true`, адмінам можна редагувати; '
     'нічого не змінено'),
    ('`BACKUP_DOES_NOT_MATCH_CATALOG` або бекапу понад 24 год', 'Хтось писав у каталог (cron? адмінка?). Переконатися, що записи '
     'зупинено, і запустити знову — бекап буде зроблено заново'),
    ('Знімок «до»: partner / PDF / price-sheet не 200', 'Нічого не записано. 401 — токен чи cookie відхилено: взяти '
     'дійсний; інше — API не відповідає. Виправити й запустити знову'),
    ('`release-check` має FAIL', 'Єдиний FAIL «pdf generated — 201 / 401» — прострочений cookie адміна: та сама команда зі '
     'свіжим. Інакше відкат (с. 2); реліз переноситься. Наступна спроба — новою текою `--dir`'),
    ('Очищення кешу відповіло 401', 'Різні `REVALIDATE_SECRET` на BE і FE: виправити, або Redeploy `fillando-fe`; запустити знову'),
    ('apply не завершився, каталог відкритий', 'Нічого не записано; причина — у повідомленні. Виправити й запустити знову '
     '(скрипт сам візьме нову операцію); `apply-failure.json` — розробнику'),
    ('`seo-status` має FAIL', 'Записи адмінки вже відкриті: відкат (с. 2) або виправлення вперед — за stop-критеріями рунбука §4'),
]
story.append(table(['Скрипт пише', 'Що робити'], stops, [W * 0.42, W * 0.58]))
story.append(Spacer(1, 12))
# ---------------------------------------------------------------- page 3: before and after
story.append(PageBreak())
story += section('До і після дня релізу', 'prep')
story += card('А', 'prep', 'Підготовка', 'за кілька днів', [
    ('checks', [
        'Railway Variables: на `fillando-be` і `fillando-fe` **однакові** `REVALIDATE_SECRET` і `INTERNAL_API_TOKEN` '
        '(≥ 32 символи, не `NEXT_PUBLIC_*`); на FE `NEXT_PUBLIC_API_BASE_URL` і `NEXT_PUBLIC_SITE_URL` задані до збірки; '
        'на BE є `RESEND_API_KEY` і `SERVICE_EMAIL`.',
        'Ноутбук: мета-репо з `repos/fillando-be` на коміті, що піде в `production`, `yarn install`; Node ≥ 20; '
        '`brew install mongodb-database-tools`; Docker і `yarn db:up` (локальний MongoDB 27019).',
        'За бажанням: тимчасовий partner-токен (адмінка → «API-токени») — для повної перевірки партнерського API.',
    ]),
])
story += card('Б', 'prep', 'Репетиція на Railway/Atlas', 'один раз', [
    ('checks', ['Окремий кластер Atlas зі свіжим дампом під назвою `fillando-prod` і середовище Railway `rehearsal` з гілки `dev` '
                '(інші секрети, `RUN_CRON=false`, домени середовища).',
                'Ті самі кроки 1–6 і відкат (відновлення каталогу з бекапу) проти нього: `DATABASE_URL` кластера в `fillando-be/.env`, `--api=`, '
                '`--site=` — адреси середовища. Записати час.',
                'Видалити середовище й кластер: у копії справжні персональні дані.']),
])
story += card('В', 'prep', 'Свіжий дамп', 'не раніше ніж за 24 год', [
    ('checks', ['Локальна репетиція на щойно знятому дампі (рунбук §7); зберегти її `dry-run.json` — у день релізу '
                'передати скрипту `--expect=<цей файл>`, і він звірить кількості сам. Локально той самий скрипт: '
                '`--api=http://localhost:9001 --site=http://localhost:9000 --dir=<тека репетиції>` при локальному '
                '`DATABASE_URL` — завжди з власною текою, не з текою релізу.',
                'Android: на справжньому телефоні дотик по стрілці біля «Каталог» відкриває панель, другий — закриває.']),
])
story += card('»', 'check', 'Після релізу', 'наступні дні', [
    ('checks', ['R03: Search Console, Merchant Center, URL Inspection — порівняти зі знімком до релізу (D02).',
                'Архів бекапу — лише в захищеному сховищі; локальні копії видалити.']),
])
story.append(P(f'Повна версія з усіма командами, очікуваннями й stop-критеріями — `{RUNBOOK}` (якщо PDF і рунбук '
               f'розходяться, правий рунбук). Згенеровано {export_date} скриптом `scripts/export-release-day-pdf.py`.', 'small'))


def footer(c, doc):
    c.saveState()
    c.setStrokeColor(colors.HexColor('#dce3e7'))
    c.line(44, 40, A4[0] - 44, 40)
    c.setFont('UA', 7.8)
    c.setFillColor(colors.HexColor(MUTED))
    c.drawString(44, 28, f'Fillando · План дня релізу каталогу v2 · {export_date} · джерело: {RUNBOOK}')
    c.drawRightString(A4[0] - 44, 28, str(doc.page))
    c.restoreState()


doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=44, rightMargin=44, topMargin=42, bottomMargin=56,
                        title='Fillando — план дня релізу каталогу v2', author='Fillando')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(out)
