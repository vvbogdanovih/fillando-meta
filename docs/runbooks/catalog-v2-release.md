# Реліз нового каталогу (Plan-0010 D08)

- **Статус:** рунбук для виконання власником; кроки перевірені репетиціями R01 (27.10, 28.10 і двічі
  29.10.2026) на копії дампу 27.10 в окремому MongoDB. **На production нічого з описаного не
  виконувалося.** Не репетирувалось на Railway/Atlas (чек-лист Б) і на свіжому дампі ≤ 24 год до
  релізу (чек-лист В). Аудит 14–15.11.2026: виміряно час закритого каталогу з затримкою мережі, скрипт навчено
  продовжувати перервану міграцію й прив'язано теку релізу до цілі (§0 Г, §3.0, §7).
- **Коли:** лише коли код Plan-0010 закритий на 100 % за таблицями плану (рішення власника 29.10:
  перший реліз = увесь Plan-0010 без брендів) і закомічений у `dev` обох child-репозиторіїв.
- **Деплой:** Railway, сервіси `fillando-be` і `fillando-fe`, гілка **`production`** обох
  child-репозиторіїв ([deploy-railway.md](deploy-railway.md)). Рунбуки `old_deploy-*-lxc.md`
  застаріли — не використовувати.
- **Друкована форма:** [план дня релізу (PDF)](../reports/fillando-release-day.pdf) — після зміни цього
  рунбука оновити `scripts/export-release-day-pdf.py` і перегенерувати PDF ([інструкція](../reports/README.md)).
- **Доказова база:** [M0 evidence](../plans/plan-0010-m0-evidence.md), розділи R01;
  [Plan-0010](../plans/plan-0010-general-catalog-and-seo.md) R01/D08/R02.

## 0. Чек-лист власника

Кожен пункт — окремий крок; не переходити до наступного, доки попередній не дав очікуваного результату.

### А. Підготовка (до дня релізу)

- [ ] **А1. Код.** Трекер Plan-0010 показує код закритим; зміни закомічені в `dev` обох репо; BE unit
  та integration, FE vitest, typecheck і production-збірка зелені на цьому коміті.
- [ ] **А2. Railway Variables** (Railway → проєкт → сервіс → Variables). Нових змінних Plan-0010 не
  додає; перевірити наявні:
  - `fillando-be`: `DATABASE_URL` (Atlas, `/fillando-prod` перед query string), `FRONTEND_URL=https://fillando.com`,
    `PUBLIC_API_URL`, `RUN_CRON` (зараз — як є), `REVALIDATE_SECRET` і `INTERNAL_API_TOKEN` (≥ 32 символи),
    `RESEND_API_KEY` (обов’язковий — без нього BE не стартує), `SERVICE_EMAIL`;
  - `fillando-fe`: `NEXT_PUBLIC_API_BASE_URL=https://api.fillando.com`, `NEXT_PUBLIC_SITE_URL=https://fillando.com`
    (задані **до** збірки — вони вшиваються в бандл), `REVALIDATE_SECRET` і `INTERNAL_API_TOKEN` —
    **ті самі значення**, що на BE, і ніколи не `NEXT_PUBLIC_*`.
  Без однакового `REVALIDATE_SECRET` purge §3.8 відповість 401 і вітрина віддаватиме застарілі сторінки.
- [ ] **А3. Робоче місце оператора** (ноутбук): checkout `fillando-be` на тому самому коміті, що піде в
  `production`, `yarn install`; мета-репо з `scripts/catalog-rehearsal/`; Node ≥ 20; `mongodump`/`mongorestore`
  (`brew install mongodb-database-tools`); Docker; локальний MongoDB 27019 (`yarn db:up` у `fillando-be`);
  для перевірки PDF — `pdftotext` (`brew install poppler`, необов’язково).
- [ ] **А4. Тимчасовий partner-токен** для зондів: адмінка → «API-токени» → створити «Реліз каталогу
  (тимчасовий)», значення зберегти в менеджері паролів. Після релізу — відкликати (§3.10).

### Б. Репетиція на Railway/Atlas (один раз, до дня релізу)

Мета — те, чого локальні репетиції не показують: латентність Atlas (replica set) і збірки Railway.

1. Atlas: окремий кластер (або проєкт) `fillando-rehearsal` — **не** production-кластер. Відновити свіжий
   дамп під назвою `fillando-prod` (CLI в production-режимі приймає лише цю назву бази):
   `mongorestore --uri "<URI кластера репетиції>" --archive=<дамп> --gzip --nsInclude 'fillando-prod.*'`.
   Network access — для IP оператора й Railway.
2. Railway: нове середовище `rehearsal` (Project → Environments → New Environment), сервіси з гілки `dev`
   (код, що піде в реліз). Variables як у production, крім: `DATABASE_URL` → кластер репетиції,
   `RUN_CRON=false`, нові `JWT_SECRET`/`REFRESH_JWT_SECRET`/`INTERNAL_API_TOKEN`/`REVALIDATE_SECRET`,
   `FRONTEND_URL`/`PUBLIC_API_URL`/`NEXT_PUBLIC_*` → домени середовища Railway. У копії справжні
   персональні дані й платіжні налаштування: середовище нікому не давати, замовлення — лише на
   `SERVICE_EMAIL` за окремим рішенням, оплату не проводити.
3. Пройти §3.1–3.10 і відкат §5 (відновлення каталогу з бекапу) проти середовища репетиції з
   `DATABASE_URL=<URI кластера репетиції>` у `fillando-be/.env`. Записати час `apply` і відновлення, вердикт
   `release-check.cjs` і `seo-status.mjs`, p50 каталогу.
4. Видалити середовище Railway і кластер Atlas; архів дампу — лише в захищеному сховищі.

### В. Репетиція на свіжому дампі (≤ 24 год до релізу)

Те саме, що вже пройдено 29.10 (§7), але на дампі production, знятому щойно: так перевіряються
поточні кількості (товари могли додатися після 27.10) і mapping на поточних даних.

1. Дамп production (той самий `mongodump`, що в §3.4) → локально, `umask 077`.
2. Пройти локальну репетицію за §7 «Як повторити» з цим архівом.
3. Записати кількості з `backup-manifest` і dry-run: **саме вони**, а не числа 27.10, — очікування
   для §3.6 і stop-критеріїв §4 у день релізу. Будь-який невідомий атрибут, ключ лендінгу чи
   відмова mapping — зупинка: реліз переноситься, mapping виправляється й репетиція повторюється.
4. **Дотик по шеврону «Каталог» на Android** (рішення власника 31.10): на справжньому телефоні з
   Android (Chrome) на production-збірці репетиції один дотик по стрілці біля «Каталог» відкриває панель і
   вона лишається відкритою; другий дотик закриває; дотик по самому «Каталог» веде на `/catalog`.
   Тести jsdom відтворюють послідовність подій, але не замінюють пристрій.

### Г. День релізу

**Основний шлях — один скрипт** (рішення власника 02.11, §3.0): деплой BE → деплой FE → `RUN_CRON=false` →
`node scripts/catalog-release.mjs` → `RUN_CRON=true` → ручні перевірки. Ручні §3.4–3.9 нижче — те саме по кроках,
для довідки й на випадок, коли скрипт недоступний. §3.1 → §3.10 по порядку. Вікно обслуговування визначають зупинка writers, redeploy і перевірки.

**Скільки каталог закритий.** Під час `apply` каталог і checkout відповідають 503 `CATALOG_MAINTENANCE` (замовлення не
записуються). Журнал пише по одній цілі, 4 запити до бази на кожну, один за одним (перевірки до й після запису —
пачками по 20, з 15.11.2026): 360 цілей — близько 1 500 запитів. Поруч із базою це 2–5 с (усі локальні репетиції); з
ноутбука до Atlas — **хвилина-дві**: з затримкою 40 мс на запит каталог був закритий 72 с (до читання пачками — 115 с;
виміри 15.11.2026 на вільній машині, §7). Скрипт сам міряє затримку до бази й після dry-run пише очікуваний
час — до того, як щось закриється. Реліз призначати на годину з найменшим трафіком. **Міграцію не переривати:**
Ctrl-C скрипт у цей час не приймає; якщо процес усе ж обірвався (сон ноутбука, мережа), каталог лишається закритим —
запустити ту саму команду ще раз, вона продовжить з місця зупинки (§3.0).

## 1. Що змінює реліз

Код: новий BE (дерево категорій, typed-каталог, адаптери читання, журнальні записи нової
адмінки) і новий FE (`/catalog`, typed-лістинги й лендінги, нова адмінка). Дані: одна журнальна
міграція `catalog-v2-migrate.cjs` переводить «Філамент» на v2 **на місці** — лише additive-поля
(`attribute_definitions` з порядком, видимістю в таблиці й позначками «бренд»/«матеріал», `attributes_v2`,
`variant_axis/value`, `filters_v2` лендінгів, `status`) і **дві навмисні зміни (рішення власника 05.11.2026)**:
до назви кожного товару й SKU дописується «— Філамент (пластик для 3D-друку)» перед варіацією
(`product_name_addition` мапінгу), а попередження про рефіл записується в сам товар (`purchase_notice`).
Legacy-поля, slug, SKU, ціни, залишки, замовлення не змінюються. Відкату на місці немає: відкат — відновлення
каталогу з бекапу релізу (§5, рішення власника 06.11.2026). Вільний текст «Матеріал» («PLA Silk Rainbow») міграція
**не переносить** (`removed_keys`, рішення власника 06.11.2026): він дублював «Тип пластику», «Ефект», «Армування»
й «Серію»; значення лишаються лише в legacy `attributes`, у партнерських картках рядка «Матеріал» більше немає.
Обидва прайси (публічний `/price-sheet` і PDF адмінки) будуються за категоріями: колонки — характеристики, за якими
категорія фільтрується, і колір; PDF — витяг наявності без оптових знижок.
Заголовок у фіді Merchant — назва SKU, тож після міграції він містить допис; highlights фіду — характеристики
з таблиці сторінки товару. Решта фіду та сама (до 05.11 перевірено на дампі 02.11: 301/301 побайтово).

Факти репетицій (дамп 27.10: 301 SKU, 44 товари, 14 лендінгів):

| Крок | Час | Що перевірено |
|---|---|---|
| dry-run | < 1 с | 360 цілей; `dropped_product_attributes: {kolir: 36}`; брендів 0; зв’язки 1/1/0 |
| apply, production-режим | 2,5–4,9 с разом із перевіркою SHA-256 архіву й знімка | `completed`, `legacy_fingerprint_unchanged: true` |
| verify (`release-check.cjs`) | ~10 с | 36 перевірок PASS: лістинг, фасети 6 комбінацій, 14 лендінгів, sitemap, рефіл, partner, прайс-лист, PDF, фід (29.10) |
| SEO-статуси (`seo-status.mjs`) | ~5 с | 37 перевірок PASS для браузера й Googlebot (29.10) |
| нова адмінка після міграції | — | правка товару й опублікованої категорії видна на вітрині; повернення |

> **З 04.11.2026 звʼязку «рефіл ↔ на котушці» немає** (рішення власника): міграція не пише `relations`, у
> звіті dry-run немає поля `relations`, а `release-check` не перевіряє «на котушці» й котушку (на 2 перевірки
> менше на кожен рефіл). Цифри в таблиці вище й у журналі §7 зняті до цього. `dry-run.json` репетиції В для
> `--expect` треба зняти заново — старий має `relations` і не збіжиться.
| замовлення на мігрованих даних | — | одне справжнє замовлення (самовивіз, готівка, лист на `SERVICE_EMAIL`), 28.10 |
| відкат §5 (06.11, бекап 05.11) | секунди + перезапуск BE | 20 колекцій дампу побайтово = бекапу; зонди = знімку «до»; повторна міграція — `completed` |

**Partner API (рішення власника 28.10).** У legacy-картках `products/lookup` товарів із віссю кольору
рядок «Колір» на рівні товару був застарілою копією (на копії дампу в 270 із 293 карток не збігався з
кольором SKU). Після міграції partner-адаптер бере «Колір» з **кольору самого SKU** на тому самому
місці. Ключі, мітки, порядок і `variant` ті самі, тож формат для партнерів не змінюється;
`release-check.cjs` дозволяє саме цю різницю й перевіряє, що нове значення — колір із назви SKU.

## 2. Передумови (перевірені локально)

1. **Ціль і production-режим CLI** (`scripts/catalog-cli-target.cjs`, рішення власника 02.11.2026): база —
   `DATABASE_URL` бекенду (з оточення, інакше з `fillando-be/.env`, як читає застосунок): локально там локальна
   копія, у день релізу підставляється production. Назва бази в команді = база в URI; віддалений сервер — лише з
   `--production` (у логах лише хости); база лише `fillando-prod`; кожна команда запису — з
   `--confirm=<команда>:fillando-prod[:<operation-id>]`; `apply` — з `--backup-manifest` перевіреного
   backup (SHA-256 архіву, restore-перевірка ≤ 24 год, знімок колекцій каталогу побайтово = живому,
   інакше `BACKUP_DOES_NOT_MATCH_CATALOG`); `resume/rollback` — з маніфестом того самого архіву.
2. **Перемикач записів нової адмінки:** `catalog-admin-writes.cjs status|enable|disable`; ідемпотентний,
   `enable` лише за наявного `catalog_control` і `phase: idle`; прапорець не обходить журнал.
3. **Самовідновлення фіду (29.10):** після запису іншим процесом (CLI) кешований фід застарілий; перший
   `GET /feeds/google-shopping.xml` відповідає 503 `CATALOG_FEED_STALE` (Retry-After 5) і ставить
   перебудову в чергу — на репетиції фід знову 200 через ~6 с. Раніше він лишався 503 до рестарту або
   ручної кнопки, бо в вікні релізу cron вимкнений.
4. **Production-URI у `fillando-be/.env` — лише на час релізу.** Поки він там, `yarn start:dev` на ноутбуці працює з
   production (cron, Prom sync, листи — як задано в `.env`): не запускати локальний бекенд у цей час і одразу після
   релізу повернути `DATABASE_URL` на локальну базу (скрипт нагадує). Після релізу —
   `unset INTERNAL_API_TOKEN PARTNER_TOKEN ADMIN_COOKIE REVALIDATE_SECRET`.

## 3. Порядок дня релізу

**Варіант А (рішення власника 28.10):** BE → FE → зупинка writers → backup → baseline → міграція →
verify → purge кешів → відкрити writers → перевірки. Причина: старий FE читає лістинг через
`GET /products/catalog`, а для v2-категорії новий BE відповідає 409
`ATTRIBUTE_CONTRACT_UPGRADE_REQUIRED`; новий FE працює і з v1, і з v2.

### 3.0 Одним скриптом (рекомендовано)

`scripts/catalog-release.mjs` (мета-репо) виконує §3.4–3.9 і перевірку SEO з §3.10 тими самими інструментами й у
тому самому порядку. На першому неочікуваному результаті він зупиняється й пише, що робити. Повторний запуск тієї самої
команди продовжує з кроку, на якому зупинився (стан — `~/fillando-release-YYYYMMDD/release-state.json`).

```bash
cd $META && node scripts/catalog-release.mjs          # після §3.1–3.3
```

Відкату в скрипті немає: на збої він зупиняється й показує архів цього релізу — далі §5.

- База — `DATABASE_URL` з `fillando-be/.env` (або з оточення), має називати `fillando-prod`; скрипт показує хост і питає
  підтвердження. Локальна база вимагає локальних `--api`/`--site`, віддалена — віддалених: інакше зупинка (перевіряли б
  не ту базу). Локальна репетиція — завжди у власній теці:
  `node scripts/catalog-release.mjs --api=http://localhost:9001 --site=http://localhost:9000 --dir=~/fillando-rehearsal-$(date +%Y%m%d)`.
- Питає приховано (або бере з оточення): `INTERNAL_API_TOKEN`, `REVALIDATE_SECRET`; необов'язково `PARTNER_TOKEN` (А4) і
  `ADMIN_COOKIE` — без них перевірки partner API і PDF показуються як SKIP; переданий, але відхилений токен чи cookie
  (401), а також будь-яка інша не-200 відповідь partner API — FAIL, не SKIP. До `mongodump` URI йде через тимчасовий
  файл конфігурації (0600), не в аргументах.
- Кроки: перевірка перед стартом (інструменти, коміт `fillando-be` = гілка `production` і без незакомічених змін,
  локальний 27019, стан каталогу в базі, новий BE на `$API` і новий FE на `$SITE`, затримка до бази, підтвердження
  зупинки writers) → бекап, відновлення в `fillando_release_check_YYYYMMDD` і маніфест → знімок «до» → dry-run
  (підтвердження кількостей або `--expect=<dry-run.json репетиції В>`; тут же — скільки каталог буде закритий) →
  apply з показом ходу («записано 127 з 360») → одразу очищення кешів → `release-check` + `phase: idle` → очищення
  кешів ще раз → `enable` → `seo-status` → список ручних перевірок і видалення перевірочної бази.
- **Тека релізу належить одній цілі** (аудит 14.11): стан записує базу, API і вітрину, для яких його почато. Запуск
  тієї самої теки проти іншої цілі — зупинка з підказкою. Репетицію завжди запускати з власною текою
  (`--dir=~/fillando-rehearsal-YYYYMMDD`): тека за замовчуванням названа за датою UTC (до 02:00 за Києвом — ще
  вчорашньою), і без `--dir` репетиція й реліз одного дня потрапили б в одну.
- **Перервана міграція** (аудит 14.11; перевірено 15.11 — §7). Ctrl-C під час кроку 4 скрипт не приймає. Якщо процес
  обірвався інакше, каталог закритий (`phase: writing`), покупці бачать 503: **запустити ту саму команду** — скрипт
  бачить у базі свою операцію, пропускає зроблені кроки й продовжує міграцію (`resume`), далі перевірки як завжди.
  Записане не втрачається й не дублюється: результат побайтово той самий, що без обриву. Якщо спробу відхилено до
  запису або відкочено вручну (`rollback`, §3.6), наступний запуск бере нову операцію сам.
- `ADMIN_COOKIE` живе `JWT_EXPIRATION` хвилин: якщо він спливає до знімка, скрипт попросить свіжий. Єдиний FAIL
  «pdf generated — 201 / 401» у `release-check` — прострочений cookie, не дефект міграції: запустити ту саму команду
  зі свіжим.
- Якщо після бекапу хтось записав у каталог (`BACKUP_DOES_NOT_MATCH_CATALOG`) або перевірка бекапу старша за 24 год,
  apply відмовляє до запису, а скрипт сам скидає бекап: наступний запуск зробить його заново. Знімок «до», на якому
  `release-check` згодом дав би FAIL (partner API чи прайс не 200, переданий токен або cookie відхилено), — зупинка до
  міграції, нічого не записано: виправити й запустити ту саму команду. FAIL у `release-check`
  — зупинка до відкриття адмінки, відкат — §5. 401 при очищенні — зупинка до відкриття адмінки. Після відкату
  та сама тека релізу не продовжується (скрипт бачить, що каталог знову не мігрований): новий реліз — новою `--dir`.
- Перевірено 02.11.2026 на копії дампу 27.10 у production-режимі (окремий MongoDB 27020, API з `dist`, production-збірка
  вітрини): повний прогін без токенів (SKIP partner/PDF) і з ними; зупинка й продовження; відкат тодішнім `revert`
  (прибрано 06.11; документи побайтово = дампу); повторний запуск на мігрованому каталозі; імітований запис після бекапу; невірний секрет очищення.
  Один прогін на копії — менше хвилини; на Atlas не вимірювалось (чек-лист Б).

Змінні сесії оператора для ручного шляху (один термінал до кінця релізу):

```bash
umask 077
D=$(date +%Y%m%d); W=~/fillando-release-$D; mkdir -p $W/before $W/after
META=~/шлях/до/fillando-meta; BE=$META/repos/fillando-be
API=https://api.fillando.com; SITE=https://fillando.com
read -rs INTERNAL_API_TOKEN && export INTERNAL_API_TOKEN   # Railway → fillando-be → Variables
read -rs PARTNER_TOKEN && export PARTNER_TOKEN             # тимчасовий токен з А4
read -rs ADMIN_COOKIE && export ADMIN_COOKIE               # необов’язково, для PDF: <ACCSESS_TOKEN_NAME>=<jwt>
read -rs REVALIDATE_SECRET && export REVALIDATE_SECRET     # Railway → fillando-fe → Variables
```

`ADMIN_COOKIE` — значення cookie доступу адміна для `api.fillando.com` (браузер → DevTools → Application
→ Cookies; назва = `ACCSESS_TOKEN_NAME` бекенду). Він живе `JWT_EXPIRATION` хвилин — брати перед
кожним знімком. Без нього `release-check.cjs` пропускає (SKIP) лише перевірку PDF; прострочений (PDF 401
при переданому cookie) — FAIL, знімок треба перезняти зі свіжим.

### 3.1 BE

- Merge `dev` → `production` у `fillando-be` (Railway деплоїть автоматично). `RUN_CRON` як зараз.
  На legacy-даних без `catalog_control` старий контракт працює: стара адмінка пише, legacy-читання 200.
- Smoke (кожен — 200): `curl -s -o /dev/null -w '%{http_code}\n' $API/categories`,
  `$API/catalog/sitemap`, `$API/feeds/google-shopping.xml`, `$API/products/price-sheet?limit=1`.

### 3.2 FE

- Merge `dev` → `production` у `fillando-fe`. Перевірити `/filament`, `/filament/pla`, товар, кошик,
  checkout до оплати — на legacy-даних це стара сторінка категорії з кольорами й лендінгами.
- Збірка вітрини завантажує шрифти з Google Fonts. Якщо деплой упав на збірці з `next/font/google` /
  `NextFontGoogleFontFileReplacer` у логах — це збій завантаження шрифтів, а не коду: Railway → Redeploy
  (15.11 локально так упали три збірки з дванадцяти, повтор проходив). Попередній деплоймент тим часом працює далі.

### 3.3 Зупинка writers

- Повідомити адмінів: не редагувати товари, категорії, кольори, лендінги до кінця §3.9.
- Railway BE: `RUN_CRON=false` і redeploy (зупиняє Prom sync, фід-cron, promo-expiry cron).
- Переконатися, що немає ручного Prom sync у процесі (адмінка → Dashboard).

### 3.4 Backup і маніфест перевіреного backup

```bash
read -rs DATABASE_URL && export DATABASE_URL   # URI Atlas production (або той самий, що в fillando-be/.env)
mongodump --uri "$DATABASE_URL" --db fillando-prod --archive=$W/fillando-prod-$D.archive --gzip
# перевірка restore — у нову порожню локальну базу (назва саме fillando_release_check_YYYYMMDD), без --drop
mongorestore --uri mongodb://127.0.0.1:27019 --archive=$W/fillando-prod-$D.archive --gzip \
  --nsFrom 'fillando-prod.*' --nsTo "fillando_release_check_$D.*"
# backup-manifest читає лише локальну копію на 27019, що б не було в DATABASE_URL
cd $BE && node scripts/catalog-v2-migrate.cjs backup-manifest fillando_release_check_$D \
  --archive=$W/fillando-prod-$D.archive
```

- Вивід маніфесту = кількості з репетиції В (каталог / товари / SKU / лендінги / кольори / бренди 0).
- Архів зберегти також поза ноутбуком (зашифровано). Після релізу видалити
  `fillando_release_check_$D` (персональні дані) — архів лишається.
- Цей архів і є відкат (§5): з нього відновлюються лише колекції каталогу, тож замовлення, користувачі
  й кошики, створені після бекапу, не зачіпаються.

### 3.5 Baseline (новий BE, legacy-дані, до міграції)

```bash
cd $META
node scripts/catalog-rehearsal/capture.mjs        $API $W/before/capture.json
node scripts/catalog-rehearsal/facets.mjs         $API legacy $W/before/facets.json
node scripts/catalog-rehearsal/release-verify.mjs $API $W/before/verify.json
```

Очікування: `partner skus N errors 0 lookup N sheet N pdf 201 feed 200` (N — SKU з репетиції В; `pdf 401`
без `ADMIN_COOKIE`; без `PARTNER_TOKEN` — `skus 0 errors 2`, обидві 401), `legacy 200`, `strip 200/8` (стрічка товарів
головної й хаба), `landings 14`, `sitemap 200`, `refills 1`. `errors` > 0 з токеном — зупинка: `release-check.cjs`
однаково дасть FAIL. `facets.mjs` завершується помилкою, якщо будь-який лістинг відповів не 200.

### 3.6 Міграція

```bash
cd $BE
OP=filament-v2-$D
M=--backup-manifest=$W/fillando-prod-$D.archive.manifest.json
node scripts/catalog-v2-migrate.cjs dry-run fillando-prod $OP --production | tee $W/dry-run.json
node scripts/catalog-v2-migrate.cjs apply   fillando-prod $OP --production --writers-stopped \
  --confirm=apply:fillando-prod:$OP $M
```

`dry-run.json` поруч із `before/` потрібен `release-check.cjs` (§3.7): з нього він бере SKU, які отримують колір;
без файла перевірки цих SKU дадуть хибний FAIL. На шляху скрипта `$OP` — поле `op` у `release-state.json`.

`apply` тримає каталог закритим хвилини, якщо база далеко (§0 «Скільки каталог закритий»); хід видно в другому
терміналі: `node scripts/catalog-v2-migrate.cjs inspect fillando-prod $OP --production` (`counts.after` з `targets`).
**Перерваний `apply`** (процес обірвався, `phase: writing`) продовжує `resume` — та сама операція, з місця зупинки:

```bash
cd $BE && node scripts/catalog-v2-migrate.cjs resume fillando-prod $OP --production --writers-stopped \
  --confirm=resume:fillando-prod:$OP $M
```

Очікування dry-run = репетиція В (на дампі 27.10: 1 категорія, 44 товари — 36 з віссю, 8 без, 301 SKU,
14 лендінгів, 360 цілей, `dropped_product_attributes: {kolir: 36}`, `brands: {}`). Apply: у stderr — ціль без облікових даних і SHA-256 mapping; у stdout —
`status: completed`, `legacy_fingerprint_unchanged: true`, нова revision.

Якщо `apply` відмовив **до запису**, CLI звільняє gate сам (`nothing was written and the
catalogue gate is released`) — каталог лишається відкритим. Після такої відмови чи після `rollback` той самий `$OP`
більше не приймається (журнал бере ідентифікатор один раз): наступна спроба — з новим `OP` (скрипт §3.0 бере новий сам).
Операцію, що лишилась захопленою без плану, звільняє `rollback <op-id>` (`status: aborted_before_writes`); він же
відкочує перервану міграцію до стану «до» замість `resume` — у production-режимі повністю:

```bash
cd $BE && node scripts/catalog-v2-migrate.cjs inspect fillando-prod $OP --production
cd $BE && node scripts/catalog-v2-migrate.cjs rollback fillando-prod $OP --production --writers-stopped \
  --confirm=rollback:fillando-prod:$OP $M
```

### 3.7 Verify (до відкриття writers)

```bash
cd $META
node scripts/catalog-rehearsal/capture.mjs        $API $W/after/capture.json
node scripts/catalog-rehearsal/facets.mjs         $API v2 $W/after/facets.json
node scripts/catalog-rehearsal/release-verify.mjs $API $W/after/verify.json
node scripts/catalog-rehearsal/release-check.cjs  $W/before $W/after      # має бути ALL CHECKS PASSED, exit 0
cd $BE && node scripts/catalog-admin-writes.cjs status fillando-prod --production   # phase: idle
```

`release-check.cjs` перевіряє: legacy-лістинг до 200 / після 409; v2 total = legacy, 15 родин кольорів; стрічка
товарів головної й хаба (`/products/catalog/v2/strip`) — 200, ті самі товари, кожна картка з групою;
6 комбінацій фільтрів — ті самі тотали, SKU першої сторінки (у наявності першими) і фасети; 14 лендінгів
200 з `contract_version: 2` і `filters_v2`, ті самі лічильники й H1/title; `/catalog/sitemap` без змін;
рефіл — попередження з позначкою; partner categories/skus/availability і прайс-лист без змін, крім допису в назвах
(усі назви прайсу після міграції його містять); PDF — ті самі SKU, назви з дописом (текст PDF не порівнюється
порядково: довші назви переносяться інакше); у `lookup` різниться лише значення «Колір» (і допис у назві), і воно —
колір із назви SKU; фід — ті самі позиції, різниця лише в датах, дописі в заголовках і highlights (кожна позиція їх має);
мітка продажів `g:custom_label_4` не порівнюється за значенням — її рахують з оплачених замовлень за 90 днів при кожній
генерації, тож одне оплачене між знімками замовлення змінило б її без жодного стосунку до міграції.
Фасети: «Glow» злито з «Luminous» (`value_aliases` мапінгу, рішення власника 05.11) — перевірка зливає їх і в
знімку «до», як і значення в партнерських картках. Вісім SKU з одним варіантом без кольору стають на вісь
кольору (`colored_skus` у `dry-run.json`): п'ять — з характеристики «Колір» товару, три — з кольору, який назвав
власник 06.11 (`sku_colors`: FL-000224 «Натуральне дерево (Natural Wood)», FL-000180 і FL-000248 «Чорний (Black)»);
після міграції колір мають усі 44 товари, а «Колір» — обов’язкова характеристика (правила варіації, рішення
власника 06.11.2026). У них інші назва, колір у прайсі й фіді, а фасет кольору й лістинги з
фільтром кольору отримують рівно їх — перевірка порівнює ці SKU окремо (колір є), решту — як раніше.
Без «Матеріалу» (`removed_keys`): у знімку «до» його рядки прибираються з партнерських карток, а рядок «Колір»
стоїть там само, де стояв (після найближчої характеристики, що лишилась). Прайс звіряється за рядками без `values`
і застарілого `material`; окремо: кожна категорія має колонки, кожен рядок — значення, «Матеріалу» немає. PDF
звіряється за SKU, а допис у назвах шукається в тексті `pdftotext -raw` (у `-layout` колонки таблиць
перемішуються). Тип пластику, ефект, армування й серія стають списками з підписами (`enum_labels`): у партнерських картках і
`g:material` замість «Silk»/«TPU» — «Шовковий (Silk)»/«TPU (Flex)»; перевірка друкує знімок «до» так само. `release-check.cjs` бере допис і злиття з мапінгу (третій
аргумент, `catalog-release.mjs` передає його сам). Фід перші
секунди після apply відповідає 503 і перебудовується сам — `capture.mjs` чекає до 30 с.

### 3.8 Purge кешів вітрини

CLI кеші вітрини не чистить:

```bash
for r in categories products landings; do
  curl -fsS -X POST "$SITE/api/revalidate" \
    -H 'Content-Type: application/json' -H "x-revalidate-secret: $REVALIDATE_SECRET" \
    --data "{\"resource\":\"$r\"}"
done
```

Кожен виклик — 200. На стенді без purge Next віддавав закешовану v1-категорію, і сторінка падала 500.
Альтернатива — redeploy FE (новий контейнер починає з порожнього data cache).

### 3.9 Відкрити writers

```bash
cd $BE && node scripts/catalog-admin-writes.cjs enable fillando-prod --production --confirm=enable:fillando-prod
```

- Очікування: `result: changed`, `after.new_admin_can_write: true`. Потім Railway BE `RUN_CRON=true`
  (один інстанс) і redeploy. Перший Prom sync — вручну з адмінки, дочекатися `done` (на стенді: 301/301,
  `deferred: 0`, помилок 0).

### 3.10 Перевірки після релізу

```bash
cd $META && node scripts/catalog-rehearsal/seo-status.mjs $SITE   # ALL CHECKS PASSED, exit 0
```

- `seo-status.mjs` для браузера й Googlebot: `/`, `/catalog`, `/filament`, `/filament/pla`, `?page=2`, товар —
  200, self-canonical, без noindex; рекламний клік `?gclid=…&gad_source=1&gad_campaignid=…&utm_source=…` на `/filament`,
  `/filament/pla` і `/catalog` — 200, canonical без параметрів, без noindex (аудит 14.11: Google Ads дописує `gad_*`
  поруч із `gclid`, і без них у списку дозволених клік отримував 404); `?page=1` → 308 `/filament`; `?polymer=PLA` і `?f.polymer=PLA` → 308
  `/filament/pla`; `?color_family=black` → 308 `?color=black` (200, `noindex, follow`, без canonical);
  `?color=plaid`, `?bogus=1`, `?page=99`, невідомий лендінг/розділ/товар → 404; sitemap містить товари,
  лендінги (зонд перевіряє, що вони є; кількість — у виводі, на дампі 27.10 — 14), `/filament`, `/catalog`;
  JSON-LD товару з брендом і пропозицією.
- Сценарій покупця вручну: головна → «Каталог» → «Філамент» → фільтри «Чорний» + PLA → лендінг → товар →
  кошик → checkout. Справжнє замовлення — одне, лише на `SERVICE_EMAIL`, за рішенням власника.
- Нова адмінка: `/admin/products` → «Філамент» → товар — зміна характеристики видна на сторінці товару,
  потім повернути; «ID на Промі», кнопка «Прайс-лист». `/admin/categories` → «Філамент»: банер
  «Категорія опублікована», лічильники використання біля характеристик. `/admin/colors` зберігає.
- «API-токени»: відкликати тимчасовий токен із А4. `unset` змінних сесії (§2.4). Видалити
  `fillando_release_check_$D` з локального MongoDB.
- **Секрет `/api/revalidate` між BE і FE на проді** (рішення власника 31.10; outbox P12 зберігає непідтверджене
  очищення, але сторінки застарілі, доки секрет не виправлено): після відкриття writers зберегти дрібну правку в
  новій адмінці (і повернути) — у логах `fillando-be` на Railway має бути `Storefront … cache purged after …` і
  через 10 с `… after echo`, а не `… not acknowledged after 3 attempts: 401 …`; 401 означає різні
  `REVALIDATE_SECRET` на BE і FE (А2) — виправити змінну й перезапустити сервіс: накопичені очищення підуть самі.
  Колекція `storefront_purges` за хвилину після правки порожня (`db.storefront_purges.countDocuments()` → 0).
- **Ліміти запитів рахуються на відвідувача, а не на Cloudflare** (P11, рішення власника 02.11): з двох різних
  мереж (ноутбук і телефон через мобільний інтернет) — без побічних дій, перевірка купона не пише нічого:

  ```bash
  for i in 1 2 3; do curl -s -o /dev/null -D - -X POST "$API/discount-coupons/validate" \
    -H 'Content-Type: application/json' --data '{"code":"RELEASECHECK"}' | grep -i x-ratelimit-remaining; done
  ```

  Із першої мережі — `19`, `18`, `17` (лічильник один на відвідувача, а не на вузол Cloudflare, який
  міняється між запитами); одразу з другої — знову `19`. Однакове спадання з обох мереж — ключ є адресою
  проксі: перевірити, що `fillando-be` на Railway отримує трафік лише через Cloudflare (оранжева хмара на
  записі `api`), і що в `src/main.ts` довіряється один hop (`trust proxy 1`).
  Обхід Cloudflare: якщо в сервісу `fillando-be` на Railway є публічний домен `*.up.railway.app` (Settings →
  Networking), тричі надіслати той самий запит на нього з `-H 'X-Forwarded-For: 162.158.1.1'` і щоразу
  іншим `-H 'CF-Connecting-IP: 203.0.113.<n>'` — очікується `19`, `18`, `17` (рахується власна адреса). Три
  `19` означають, що проксі Railway не дописує адресу в `X-Forwarded-For` і ключ можна обрати заголовком —
  тоді вимкнути публічний домен Railway (трафік лише через Cloudflare) і повторити.
- Search Console / Merchant / URL Inspection — окремий етап R03.

## 4. Stop-критерії

Зупинитися й не відкривати writers, якщо:

- `backup-manifest` або `apply` повідомляє розбіжність з backup (writers не зупинені) — знову §3.3–3.4,
  не обходити;
- dry-run показує інші кількості, ніж репетиція В, або будь-який невідомий атрибут/ключ лендінгу;
- apply не `completed` або `legacy_fingerprint_unchanged` ≠ true. Сам час не є критерієм: `apply` триває стільки,
  скільки скрипт назвав після dry-run (хвилини, якщо база далеко), і поки `inspect` показує, що `counts.after` росте, —
  чекати, не переривати. Якщо процес обірвався — `resume` (§3.6; скриптом — та сама команда), без ручних правок control;
- `release-check.cjs` має хоч один FAIL (exit 1) — далі §5;
- 5xx на будь-якому кроці §3.10, FAIL у `seo-status.mjs`, падіння checkout або оплати;
- p50 каталогу/фільтрів на production помітно гірший за baseline (локальна репетиція, 16 паралельних:
  каталог ~20 rps проти legacy 20–21, фільтри ~21,5 проти ~33, товар p50 ~30 мс проти ~18 мс; один
  запит каталогу 53 мс проти 49 мс).

## 5. Відкат

**Відкату міграції на місці немає** (рішення власника 06.11.2026, `revert` прибрано): відкат — відновлення
колекцій каталогу з бекапу цього релізу (§3.4). Перевірено 06.11 на бекапі 05.11 в окремому MongoDB з API на
тому самому коді: міграція → відкриття записів адмінки → відновлення → перезапуск API — 20 колекцій дампу
побайтово = бекапу, зонди `capture`/`facets`/`release-verify` = знімку «до» (у фіді лише дата початку акції =
час генерації), повторна міграція на відновленому каталозі — `completed`, 360 цілей.

- **Коли.** За stop-критеріями §4. До відкриття writers (§3.9) нічого не втрачається; після — пропадають
  правки каталогу в новій адмінці. Через дні після релізу не відкочувати: бекап уже не описує каталог —
  лишитися на новому каталозі й виправляти вперед.
- **Змінні** (шлях скрипта їх не задає; `$W` і дата — з повідомлення скрипта про зупинку, там повний шлях архіву):

  ```bash
  W=~/fillando-release-YYYYMMDD; D=YYYYMMDD; mkdir -p $W/restored
  META=~/шлях/до/fillando-meta; BE=$META/repos/fillando-be; API=https://api.fillando.com; SITE=https://fillando.com
  read -rs DATABASE_URL && export DATABASE_URL   # production — той самий, що в fillando-be/.env; не лишок репетиції
  cd $BE && node scripts/catalog-admin-writes.cjs status fillando-prod --production   # хост production і phase
  ```

  `mongorestore` пише туди, куди вказує `DATABASE_URL`, без жодних перевірок цілі: спершу `status` — у його
  `target.hosts` має бути хост production. Якщо `phase` не `idle` (міграцію перервано), відновлення саме каталог не
  відкриє: спершу `rollback` з §3.6 (відкочує записане й відкриває каталог); лише якщо він відмовляє — відновити
  колекції кроком 2 і виконати `rollback` ще раз.
- **Кроки:**
  1. Writers зупинені: `RUN_CRON=false` (у вікні релізу вже так), адмінам — не редагувати каталог.
  2. Відновити з архіву **лише колекції каталогу** — замовлення, користувачі, кошики й лічильники номерів не
     зачіпаються:

     ```bash
     mongorestore --uri "$DATABASE_URL" --archive=$W/fillando-prod-$D.archive --gzip --drop \
       --nsInclude 'fillando-prod.categories' --nsInclude 'fillando-prod.products' \
       --nsInclude 'fillando-prod.product_variants' --nsInclude 'fillando-prod.landings' \
       --nsInclude 'fillando-prod.colors' --nsInclude 'fillando-prod.brands'
     ```

     Очікування: `N document(s) restored`, де N — сума колекцій каталогу з маніфесту (бекап 05.11: 482).
  3. Railway → `fillando-be` → Redeploy (тепер з `RUN_CRON=true`). **Обов'язково:** процес тримає фід і кеші в
     пам'яті — без перезапуску фід далі віддає мігровані назви (перевірено 06.11).
  4. Purge кешів вітрини (§3.8).
  5. Перевірка: `node scripts/catalog-rehearsal/release-verify.mjs $API $W/restored/verify.json` → `legacy 200`;
     за бажанням `capture.mjs`/`facets.mjs … legacy` у `$W/restored` і `compare.cjs` з `$W/before` — усе `SAME`.
- **Ціни й залишки** — на момент бекапу; перший Prom sync після `RUN_CRON=true` їх оновлює.
- **Після відкату** службові `catalog_control` і журнал `catalog_*` лишаються (у бекапі їх немає): стара адмінка
  заблокована, нова не редагує товари філаменту — до повторного релізу (новою текою `--dir`) або повного відкату
  застосунків. Не видаляти `catalog_control` вручну.
- **Повний відкат застосунків:** Railway rollback на попередні деплойменти BE і FE гілки `production`; дані спершу
  відновити кроками вище.
- **Перервана операція нової адмінки після відкриття writers** (аудит 31.10). Ознака: вітрина й checkout
  відповідають 503 «каталог оновлюється» довше хвилини, адмінка після збереження показала «Операція потребує
  перевірки» з `operation_id`. Збереження, відхилене до першого запису, gate звільняє сам; решта:

  ```bash
  # 1. Зупинити writers (Railway: BE replicas = 0 або stop; cron і Prom sync — у тому самому процесі)
  # 2. Подивитися стан і журнал (без запису; токен власника не друкується)
  cd $BE && node scripts/catalog-recover.cjs inspect fillando-prod --production
  # 3. Відкотити (рекомендовано: адмін повторить збереження) або довести до кінця
  cd $BE && node scripts/catalog-recover.cjs rollback fillando-prod <operation_id> --production \
    --writers-stopped --confirm=rollback:fillando-prod:<operation_id>
  # 4. Запустити BE (фід перебудовується при старті), purge кешів §3.8
  ```

  Вивід `rolled_back` / `completed` / `aborted_before_writes` / `publication_reconciled` / `already_finished`
  і `control.phase: idle`. Відмова `RECOVERY_CONFLICT` означає, що ціль змінив хтось поза журналом:
  нічого не записано, gate лишається закритим — не правити `catalog_control` вручну, звернутися до
  розробника з виводом `inspect`. Операції міграції CLI відхиляє (`MIGRATION_OR_STAGING_RUN`) — для них
  `catalog-v2-migrate.cjs resume|rollback` вище.

## 6. Відомі обмеження

- **Публікація великої категорії — частинами** (P13, 02.11): понад 499 SKU вони перемикаються пачками по 500
  окремими операціями, категорія — останньою; одна публікація 1100 SKU — три ревізії. Збій посередині лишає
  категорію чернеткою (SKU не видно); повторна публікація завершує. Мігрований філамент (301 SKU) — одна операція.
- Не репетирувалось на Railway/Atlas (чек-лист Б): інша латентність, Atlas — replica set (журнал написаний
  без транзакцій і працює на обох; gate пише з `w: 1, j: true`, не `majority`; CLI читають лише з primary).
- **Час закритого каталогу залежить від затримки до бази** (виміри 15.11, §7): 4 запити на ціль, послідовно.
  Справжній час на Atlas покаже лише чек-лист Б або сам реліз; скрипт називає оцінку після dry-run. Перевірки до й
  після запису читаються пачками (рішення власника 15.11: −37 %, 115 → 72 с при 40 мс). Далі скоротити можна, лише
  змінивши сам цикл запису журналу або запустивши міграцію поруч із базою — не робилось.
- Кількості й mapping перевірені на дампі 27.10; дамп у день релізу — чек-лист В.
- Замовлення в production-режимі репетиції оформлювали один раз (28.10); 29.10 — лише сценарій покупця до
  оформлення (`POST /orders` перехоплено), бо кожне замовлення шле справжні листи.
- Порожній `<main>` під час клієнтського переходу (наслідок прибраного `loading.tsx`) закрито смугою
  прогресу без Suspense-межі (рішення власника 28.10).
- **Адреси не перемикаються** (рішення власника 31.10): URL категорій, лендінгів і товарів, фід і sitemap
  лишаються тими самими й після деплою генеруються новим кодом; прапорця v1/v2 немає.
- **Старі адреси (B07): код у релізі, реєстр порожній** — він заповнюється першою явною зміною slug після
  релізу (адмінка, `POST /routes/*/slug-change`); карта старих Prom-slug у реліз не входить.

## 7. Репетиції production-режиму (локально)

### Як повторити (на свіжому дампі — чек-лист В)

Копія — в окремому тимчасовому MongoDB на `127.0.0.1:27020` (tmpfs) під назвою `fillando-prod`, щоб
пройти саме production-гілку CLI, не торкаючись локальної `fillando-prod` на 27019.

```bash
umask 077; D=$(date +%Y%m%d); W=$(mktemp -d); META=…; BE=$META/repos/fillando-be
docker run -d --rm --name fillando-r01-$D -p 127.0.0.1:27020:27017 --tmpfs /data/db:rw,size=2g mongo:8.0
mongorestore --uri mongodb://127.0.0.1:27020 --archive=<свіжий дамп> --gzip --nsInclude 'fillando-prod.*'
# тимчасові секрети (JWT_SECRET, REFRESH_JWT_SECRET, INTERNAL_API_TOKEN, REVALIDATE_SECRET) — у $W/secrets.env
cd $BE && yarn build && set -a && . $W/secrets.env && set +a && \
  DATABASE_URL=mongodb://127.0.0.1:27020/fillando-prod PORT=9003 FRONTEND_URL=http://localhost:9100 \
  RUN_CRON=false ACCSESS_TOKEN_NAME=fillando_r01_access REFRESH_TOKEN_NAME=fillando_r01_refresh node dist/main &
```

ADMIN для PDF і partner-токена — JWT з тимчасовим `JWT_SECRET` (`{id, email, name, role: 'ADMIN'}`;
стратегія JWT не читає користувача з бази); partner-токен — `POST /admin/api-tokens` з цим cookie.
Далі §3.4–3.7 з `API=http://localhost:9003` і `DATABASE_URL=mongodb://127.0.0.1:27020/fillando-prod`;
§3.10 — на production-збірці FE (`NEXT_PUBLIC_API_BASE_URL=http://localhost:9003
NEXT_DIST_DIR=.next-e2e/r01 yarn build`, потім `yarn next start -p 9100` з тими самими секретами);
`enable` → §5 (відновлення каталогу, перезапуск API) → зонди в `restored`. Наприкінці: видалити partner-токен із копії,
`NODE_PATH=$BE/node_modules node scripts/catalog-rehearsal/db-compare.cjs <URI еталона> <база еталона>
mongodb://127.0.0.1:27020 fillando-prod` — усі колекції дампу `identical`, `different: {}` (додатково
лише службові `catalog_*`); зупинити контейнер, видалити `fillando_release_check_$D`, `$W` і `.next-e2e/r01`.

### 14–15.11.2026 — затримка мережі, обрив міграції, продовження (аудит)

Бекап 08.11 → тимчасовий MongoDB 27020 (tmpfs) → API 9003 на поточному коді (`RUN_CRON=false`, тимчасові
секрети) → production-збірка вітрини, зібрана проти **ще не мігрованих** даних (так збиратиме Railway у §3.2), на 9100.
Затримку до бази імітував TCP-проксі (20 мс у кожен бік, скрипт міряв 45–47 мс на запит).

| Що | Результат |
|---|---|
| Вікно між деплоєм і міграцією (новий BE і FE, старі дані) | `/`, `/catalog`, `/filament`, лендінг, `?page=2`, товар, прайс-лист, sitemap, пошук — 200 без помилок; `GET /products/catalog/v2/strip` на v1-даних — 200 з картками |
| `apply` без затримки / з затримкою 40 мс | секунди / каталог закритий **115 с** на вільній машині (32 с перевірка плану, 82 с запис 360 цілей; перший вимір 14.11 під навантаженням машини дав 181 с — завищено); увесь цей час API каталогу — 503 |
| Те саме після читання пачками в журналі (рішення власника 15.11) | каталог закритий **72 с** (3 с перевірка, 69 с запис); результат побайтово = прогону до зміни (6 колекцій, 483 документи); обрив на 150-й цілі → `inspect` 3 с → `resume` `completed`, каталог побайтово = неперерваному |
| Обрив `apply` посеред запису (`kill -9` на 127-й цілі з 360) | `phase: writing`, 11 із 44 товарів уже переведені; повторний `apply` з тим самим id — відмова `CATEGORY_NOT_FLAT_V1`; **`resume` — `completed`**, 5 колекцій каталогу (482 документи) побайтово = неперерваному прогону (`db-compare.cjs`) |
| Скрипт релізу, основний шлях | 22 с; `release-check` ALL CHECKS PASSED (зі стрічкою товарів); `seo-status` — FAIL лише на шести нових рядках рекламного кліку (вітрина була зібрана до виправлення списку параметрів — це й був дефект) |
| Скрипт релізу з затримкою: Ctrl-C під час міграції | відмова з поясненням, міграція триває |
| Скрипт релізу: `kill -9` міграції на 243-й цілі, потім **та сама команда** | перший запуск: «міграцію перервано: каталог закритий… запустіть ту саму команду»; другий: бачить свою операцію, пропускає бекап/знімок/dry-run, `resume`, очищення кешу, ALL CHECKS PASSED, `enable` |
| Скрипт релізу: `kill -9` на 61-й цілі → ручний `rollback` (§3.6) → та сама команда | `rolled_back`, каталог відкритий і побайтово = бекапу (маніфест прийнято знову); скрипт бере нову операцію сам, міграція `completed`, ALL CHECKS PASSED, `enable` |

Контейнер (tmpfs) зупинено; знімки, секрети, збірку вітрини й перевірочну базу на 27019 видалено.

### 06.11.2026 — «Матеріал» не переноситься, прайси за категоріями

Бекап 05.11 → тимчасовий MongoDB 27020 → API 9003 на поточному коді з тимчасовими `JWT_SECRET`/`REFRESH_JWT_SECRET`,
ADMIN-cookie з тимчасовим секретом, тимчасовий partner-токен → зонди «до» (partner 301 / lookup 301, прайс 301,
PDF 201, фід 200) → dry-run (360 цілей, `removed_attributes: {material: 44}`, 9 визначень) → apply → зонди «після» →
`release-check.cjs` з мапінгом і `dry-run.json`. Того ж дня — третій прогін з кольорами трьох SKU (`sku_colors`):
44 товари з віссю кольору, 0 без, 8 `colored_skus`, ALL CHECKS PASSED. Четвертий — з правилами варіації («Колір»
обов’язковий): ALL CHECKS PASSED; нова адмінка через API — обов’язковість кольору не знімається (409
`AXIS_REQUIRED`, 301 SKU), товар зберігається без змін (200), колір текстом у товарі — 400 `COLOR_VALUE_ON_SKU`,
товар без кольору — 400 `REQUIRED_VALUE`. Перший прогін знайшов два дефекти, обидва виправлено: (1) рядок
«Колір» партнерської картки ставав після «Матеріалу», якого вже немає, і з'їжджав у кінець — тепер після найближчої
характеристики, що лишилась; (2) допис у назвах PDF не знаходився в `-layout`-тексті нових таблиць — тепер
`pdftotext -raw` і перенос після дефіса. Повторний прогін: **ALL CHECKS PASSED** без жодного SKIP — partner lookup
296 карток (26 ідентичних, 270 лише значення «Колір»), прайс: 1 категорія, 9 колонок, 301 рядок зі значеннями,
PDF 301 SKU, допис у 47 комірках назв. Контейнер (tmpfs) зупинено; секрети, токен і знімки видалено.

### 06.11.2026 — відкат відновленням з бекапу

Бекап 05.11 → окремий MongoDB 27020 (дві копії: `fillando-prod` і еталон) → API 9003 на поточному коді,
`RUN_CRON=false` → знімок «до» (legacy 200, 301 SKU, 14 лендінгів) → apply (360 цілей) → `enable` → відновлення
колекцій каталогу командою §5 (482 документи) → без перезапуску API лістинг уже legacy, але фід — 301 позиція з
мігрованими назвами → перезапуск API → `compare.cjs` з «до»: усе `SAME`, у фіді лише дата початку акції →
`db-compare.cjs` з еталоном: 20 колекцій побайтово, `different: {}`, додатково лише `catalog_*` → повторний apply
на відновленому каталозі `completed` (360 цілей). Контейнер (tmpfs) зупинено, знімки видалено.

Записи нижче відкочували тодішньою командою `revert` (прибрано 06.11.2026).

### 28.10.2026

`mongodump` → restore у `fillando_release_check_20261028` → `backup-manifest` → dry-run (360 цілей) → apply
без підтвердження відхилено → apply (4,9 с) → `enable` (`changed`, повторно `unchanged`) → тимчасовий API +
production-збірка FE: правка характеристики в новій адмінці видна на сторінці товару, значення повернуто;
одне замовлення на `SERVICE_EMAIL` → прибирання (замовлення, лічильник, тимчасовий ADMIN і його токен) →
`disable` → revert. Знайдено й виправлено: revert після збереження товару старою версією редактора
відмовляв і лишав gate у `writing` (тепер gate звільняється, редактор зберігає порядок характеристик,
`rollback` звільняє захоплену операцію без плану). Після revert: 19 колекцій / 67 002 документи й індекси
побайтово = еталону.

### 29.10.2026 — mapping 28.10, нова адмінка опублікованої категорії

backup → restore у `fillando_release_check_20261029` → `backup-manifest` (каталог 1 / 44 / 301 / 14 / 122 / 0)
→ dry-run (360 цілей, `kolir: 36`, брендів 0, зв’язки 1/1/0) → apply без підтвердження відхилено → apply
**2,5 с** → `enable` → правка опублікованого філаменту тим самим writer, що й адмінка (підпис «Серія», назва
категорії; спроба прибрати «Тип пластику» відхилена з 44 товарами / 11 лендінгами) → `disable` → revert
**відмовив** (`RECOVERY_CONFLICT … categories:<id>:attribute_definitions`, gate `idle`) → правку повернуто →
`revert-2` **2,2 с** → 19 колекцій / 67 002 документи й індекси побайтово = еталону.

### 29.10.2026 (друга сесія) — повна verify §3.7 у production-режимі

Тимчасовий MongoDB 27020 з копією еталона як `fillando-prod`, тимчасовий API 9003 (новий BE, `RUN_CRON=false`,
одноразові секрети), тимчасовий partner-токен, ADMIN — JWT із тимчасовим секретом.

| Крок | Результат |
|---|---|
| baseline (новий BE, legacy-дані) | partner 301 SKU / lookup 301, прайс-лист 301, PDF 201, фід 200; legacy 200; 14 лендінгів; sitemap 301/1/14; рефіл 1 |
| backup → restore у `fillando_release_check_20261029` → `backup-manifest` | 67 003 документи (з тимчасовим токеном); каталог 1 / 44 / 301 / 14 / 122 / 0 |
| dry-run / apply без `--confirm` / apply | 360 цілей, `kolir: 36`, зв’язки 1/1/0 / відмова / `completed` **2,6 с**, legacy-відбиток незмінний |
| перша verify | **знайдено два дефекти**: (1) `/catalog/v2` не ставив товари в наявності першими — перша сторінка філаменту після міграції відрізнялася від legacy (3 з 6 комбінацій); (2) фід після apply — 503 `CATALOG_FEED_STALE` без перебудови: CLI пише з іншого процесу, а cron у вікні релізу вимкнений, тож фід лишався б 503 до рестарту |
| виправлення | v2-лістинг сортує `_out_of_stock` першим під будь-яким порядком; застарілий штамп фіду ставить перебудову в чергу (`feedRefresh`) |
| повторна verify (`release-check.cjs`) | **36/36 PASS**: v2 total 301, 15 родин, 6 комбінацій (тотали, SKU першої сторінки, фасети), 14 лендінгів, sitemap, рефіл, partner (31 ідентична картка + 270 лише зі значенням «Колір», 270/270 = колір із назви SKU), прайс-лист, PDF, фід 301 позиція (1 рядок — дата) |
| `catalog-admin-writes status` / `enable` | `phase: idle` / `changed`, `new_admin_can_write: true`, capabilities API `draft_writes_enabled: true` |
| production-збірка FE 9100 → API 9003, `seo-status.mjs` | **37/37 PASS** для браузера й Googlebot; sitemap 325 URL (301 товар, 14 лендінгів) |
| сценарій покупця (Playwright) | головна → `/catalog` → `/filament` → «Чорний» → PLA + «Чорний» (9 товарів) → `/filament/petg` → товар → «В кошик» → `/checkout`; 0 помилок консолі, 0 відповідей 5xx; `POST /orders` перехоплено (без листів) |
| `disable` → revert | `filament-v2-20261029v-revert` **2,4 с**; фід: 503 перші ~4 с, **200 з 6-ї секунди** без рестарту |
| після revert | зонди = baseline (у фіді лише час початку акції = час генерації) |
| звірка з еталоном після видалення токена | 19 колекцій / 67 002 документи побайтово (`different: {}`), додатково лише службові `catalog_*` |

Контейнер зупинено; база перевірки restore, архів, маніфест, секрети, знімки й збірка FE видалені.
