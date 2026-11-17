# TD-0013 — перехідні контракти категорій

Дата: 2026-10-23. **Контракт, затверджений разом із TD-0013 (Approved, 2026-10-31; рішення власника 31.10 — розділ «Owner decisions» в кінці); реалізовано локально — див. датовані розділи нижче (27.10–31.10), production не змінено.**
Пов’язано: [TD-0013](TD-0013-general-catalog-and-seo.md), D05/D06 Plan-0010.

## 1. Read-модель дерева

Зберігаємо наявний `GET /categories` як сумісний масив; новий FE використовує
`GET /categories/tree` (маршрут перед `/:id`). Відповідь плоска, тому JSON і
клієнт не мають бути рекурсивними й не отримують довільної межі вкладеності:

```json
{
  "revision": 12,
  "items": [
    {"_id":"000000000000000000000001","parent_id":null,"kind":"group","name":"Електротовари","slug":"elektrotovary","order":0},
    {"_id":"000000000000000000000002","parent_id":"000000000000000000000001","kind":"product","name":"Автомати введення резерву","slug":"avtomaty-vvedennia-rezervu","order":0}
  ]
}
```

Public read повертає лише публічні вузли без прихованих предків. Admin read —
окремий ADMIN-ендпоїнт. Обсяг/пагінація flat-експорту визначені в розділі 6;
всі сторінки експорту мають одну revision, при її зміні клієнт перечитує дерево.
Повний зібраний експорт не втрачає батьків вузлів; окрема сторінка може їх не містити.

Category detail додає `parent_id`, `kind`, `revision`, `seo` і definitions.
Ancestors передаються як список, не вкладений об’єкт. Публічні атрибути — allowlist.
Category slug глобально унікальний; ~~однакові display names у різних гілках допустимі.
Поточний unique index name видаляється лише окремою перевіреною міграцією.~~

**Відхилення першого релізу (рішення власника 31.10.2026):** назва категорії унікальна глобально, як slug, —
унікальним індексом схеми (`category.schema.ts`, `name`) і перевіркою writer нової адмінки до запису
(`CATEGORY_IDENTITY_CONFLICT`, 409). Однакові назви в різних гілках — після релізу окремою задачею, якщо виникне
потреба. Відмова (P01, 02.11): 409 `CATEGORY_IDENTITY_CONFLICT` несе `details.conflict` — `field` (`name` чи `slug`)
і `category {id, name, slug}`, з якою збіглося; адмінка пише «Назва «X» вже є в іншої категорії (/x)…» або
«Адреса /x уже зайнята категорією «X»…». Стара адмінка (індекс бази) — як була: «Таке значення поля «name» уже
існує: <значення>».

## 2. Запис дерева

`POST /categories` (ADMIN): нові поля parent_id/kind опційні в перехідний період,
відсутність означає root/product. Порожні вузли group дозволені, але не рекламуються
в публічній навігації до появи корисного наповнення. Parent має існувати і бути group.

`PATCH /categories/:id/placement` (ADMIN), без зміни name/slug:

```json
{"parent_id":"000000000000000000000001","order":2,"expected_revision":12}
```

Відповідь — вузол і нова revision. Null parent переміщує до кореня. Клієнт не
пише parent_id через довільний загальний PATCH, оминаючи topology validation.
Операція не змінює URLs товарів/категорії. Самопосилання, нащадок як батько,
неіснуючий батько, product як батько — відхилення до першого запису.

HTTP: 400 невалідні дані; 401/403 auth; 404 відсутня ціль; 409 stale revision,
cycle, parent kind conflict чи непорожнє видалення. Machine-readable
`details.code`: `CATEGORY_REVISION_CONFLICT`, `CATEGORY_CYCLE`,
`CATEGORY_PARENT_NOT_GROUP`, `CATEGORY_NOT_EMPTY`. Внутрішні pure-tree errors
мапляться на публічні помилки в сервісі, не повертаються як необроблений 500.

`DELETE /categories/:id` відхиляється за наявності дітей, товарів або лендінгів.
Конвертація product→group — явна операція з перевіреним assignment plan для
товарів/лендінгів, без тихого cascade. Payload і recovery визначені в [протоколі D06](TD-0013-catalog-mutations.md).

## 3. Конкурентна безпека: обов’язкова гарантія

`expected_revision` сам по собі не захищає snapshot validation від двох
одночасних move. Не припускаємо транзакцій standalone MongoDB. Перед B02 потрібно
реалізувати й протестувати серіалізацію topology mutations разом із записами,
що змінюють category_id товарів, та операціями convert/delete.

Робочий напрям D06: глобальний catalog mutation journal/lock з атомарним
захопленням у MongoDB, перевіркою revision після захоплення і checkpoint перед
multi-document writes. Немає автоматичного TTL takeover, який дозволив би
старому процесу продовжити запис після нового власника. Після аварії — fail closed
для залежних writes до відновлення незавершеної операції; dependent reads
використовують epoch-бар’єр і 503, як уточнено в D06, без обіцянки snapshot storage. Recovery-протокол визначений у [D06](TD-0013-catalog-mutations.md); fault-тести потрібні **до**
підключення pure topology helper до write API. Це ще не реалізована гарантія.

## 4. Стабільні атрибути: сумісність

Нове поле `attribute_definitions` відділяється від legacy `required_attributes`:

```json
{
  "key":"rated_current",
  "label":"Номінальний струм",
  "value_type":"number",
  "unit":"А",
  "is_required":true,
  "filter_enabled":true,
  "filter_type":"range",
  "visible_in_specs":true,
  "order":0,
  "multiple":false
}
```

Key нового визначення присвоює сервер один раз, legacy key при backfill
зберігається. Оновлення існуючого визначення посилається на key і не регенерує
його з label. Nullable filter_type для disabled filter; range дозволений лише
для number. Number у новому контракті — JSON number, false/0 не є порожнім значенням.
Строкові legacy числа не приводяться автоматично до числа на читанні.

Write payload товару v2 використовує `attributes_v2:[{k,v}]`, label береться з визначення;
однакові k кількома записами підтримуються лише за multiple=true. Старий payload
`{l,v}` не повинен тихо створювати нові ключі після увімкнення v2-категорії.
Для цього явно перемикається contract version категорії: старі writes після
перемикання повертають 409 `ATTRIBUTE_CONTRACT_UPGRADE_REQUIRED`.

Порядок: BE із read adapter → offline mapping/verify → новий FE → перемикання
категорій на v2. До перемикання FE не пропонує rename key-independent labels.
**Реліз (рішення власника 31.10.2026, R02):** contract version категорій змінює міграція на місці в
порядку рунбука §3 (деплой BE → деплой FE → зупинка writers → backup → baseline → міграція → verify →
очищення кешів → відкриття writers → перевірка живих адрес); окремого прапорця v1/v2 і перемикання
routes/feed/sitemap немає — адреси, фід і sitemap лишаються на тих самих URL.
Усі старі product-only attributes спочатку інвентаризуються: їх не можна загубити
лише тому, що вони відсутні в required_attributes. Legacy label/key collisions
потребують явного mapping; неоднозначний перенос зупиняється.

Видалення використаного key, зміна type/unit з наявними даними чи landing pins —
409 до явного migration plan (одиниця: `DEFINITION_UNIT_LOCKED`, коли значення має хоч один товар чи SKU;
перетворення значень не виконується — рішення власника 31.10, узгоджено з catalog-mutations §11 і планом §7). Зміна category_id товару перевіряє definitions і
обов’язкові значення нової категорії; SKU/category_id денормалізація оновлюється
через той самий checkpointed процес, а не кількома незалежними PATCH.

## 5. Каталог і залишок D05

Наявний `GET /products/catalog?category_id=...` залишається; product category
означає вузол, group — множину товарних нащадків. Group не змішує всі локальні
атрибути: лише price/stock/brand/category за узгодженою семантикою.

V2 query encoding range/multivalue, brand/settings/relations DTO та перехід
споживачів визначені в розділі 6. D05 завершено як специфікацію; реалізація
DTO, адаптерів і contract tests належить B01–B11/F01.
Існуючий `openapi.json` не змінюється описом майбутніх endpoints: він має
відповідати виконуваному API й експортується при реалізації DTO/controllers.

## 6. Уточнений контракт D05 (2026-10-23)

Цей розділ уточнює попередні відкриті формулювання. Це специфікація для реалізації,
а не опис доступного API. Схеми Swagger додаються з runtime DTO, не наперед.

### Category та читання дерева

Category додає `parent_id`, `kind`, `status: draft|active|archived`,
`attribute_contract_version: 1|2`, `attribute_definitions`, `seo`.
`seo = {title, description, h1, intro_html, bottom_html}`; текстові поля nullable,
HTML очищується на записі; null використовує нейтральний категорійний fallback.
Legacy без status читається як active, без parent — root, без kind — product,
без contract version — 1. Значення зберігаються явно під час backfill.
`revision` відповіді — глобальна версія конфігурації каталогу, не timestamp.

`GET /categories/tree` і `GET /categories/admin/tree` повертають
`{revision, items, next_cursor}`. Ліміт за замовчуванням 200, максимум 1000;
курсор містить revision і останній `_id`, перевіряється сервером. Наступна сторінка
іншої revision — 409 `CATEGORY_REVISION_CONFLICT`; клієнт починає спочатку.
Сторінки — фрагменти flat snapshot: клієнт збирає всі перед показом повного дерева.
Не обіцяємо наявність батька на тій самій сторінці. Для лінивого меню —
`GET /categories/children?parent_id=...` з тим самим cursor/limit;
відсутній parent_id означає root, непублічний батько на public API — 404.
Detail повертає `ancestors` root-first, без поточного вузла. Глибина не обмежується (з D06.4, 30.10: до 1 MiB шляху — вбудовано, далі `ancestors_paged` і `GET /categories/:id/ancestors` сторінками — розділ 30.10 нижче).
Сортування дітей `(order, _id)`; повторений order допустимий і детермінований.

Нові control routes реєструються перед `/:id`. Public API не повертає drafts,
службові журнал/конфлікти, внутрішні export rules. Public read v1 зберігає формат
масиву і повертає лише товарні категорії; groups доступні новому FE через tree.
Після активації дерева v1 також дотримується видимості всього ancestor chain.

### Запис і версії

Усі нові ADMIN-записи конфігурації містять `expected_revision` і заголовок
`Idempotency-Key` (UUID). Успіх короткої операції — 200/201
`{operation_id, revision, item}`; delete — 200 `{operation_id, revision, deleted_id}`.
Тривала операція — 202 `{operation_id, status:"pending"}` та Location на
`GET /catalog-operations/:id` (ADMIN). Status: pending/applying/verifying/
completed/recovery_required/rolled_back. Відповідь містить progress counts,
result_revision та error code, без before-images і секретів.

Повтор ключа з тим самим нормалізованим request повертає попередній результат
або стан операції. Інший request під тим самим ключем — 409
`IDEMPOTENCY_KEY_REUSED`. Зберігаємо результати щонайменше протягом міграції;
TTL/очищення активних або нерозв’язаних операцій заборонені.
Legacy-записи без revision допускаються лише до переходу конфігурації на v2,
але також проходять серіалізований writer. Після переходу — 409
`CATALOG_CONTRACT_UPGRADE_REQUIRED`, без silent last-write-wins.

`PATCH /categories/:id` не приймає parent_id/kind/slug/contract_version.
`PUT /categories/:id` не може їх скинути до default. Окремі операції:
placement, conversion, slug-change, attribute migration. Для delete revision
передається query-параметром, Idempotency-Key — заголовком.

Спільна помилка: `{statusCode, message, details:{code, operation_id?, revision?, fields?}}`.
400 — форма/тип/непідтримуваний filter; 404 — об’єкт; 409 — revision/dependency/
identity conflict; 503 `CATALOG_MAINTENANCE` + Retry-After — незавершене відновлення.
Повторювати mutation після втрати відповіді можна тільки з тим самим ключем.

### Визначення характеристик

`value_type = string|number|boolean|enum`, `filter_type = multi-select|range|null`.
Enum зберігає stable option ID, options мають `{id,label,order}`. Option ID і key
не редагуються; видалення використаного option блокується як видалення key.
`semantic = generic|color|size|material`; generic не експортується як color.
Number: finite JSON number, без NaN/Infinity; десятковий роздільник у UI
нормалізується до відправки. Unit — метадані, не частина числа.
Nullable unit; у boolean unit=null; range лише number, multiple=false.
Disabled filter має filter_type=null; enabled string/enum/boolean — multi-select.

Create definition не приймає key: сервер генерує стабільний opaque key `a_<id>`.
Після цього PATCH адресує визначення за key. Legacy keys зберігаються дослівно;
від нових назв більше не залежить query namespace. Copy definitions повертає
нові ключі й old→new mapping; конфігурації категорій незалежні.

Product v2 додає `attributes_v2:[{k,v}]`, залишаючи legacy attributes як read adapter.
Заміна повного масиву — явна; відсутність поля у PATCH нічого не очищує.
Для multiple=true повторені k означають кілька scalar values; дублікати значень
прибираються, порядок не впливає на фільтрацію. Null/порожній string не є значенням;
optional очищується видаленням запису, required перевіряється для active товару.
Draft може бути неповним, але не містити невідомих keys чи неправильних типів.
Невідомий key, object/array як v, string замість number — 400 з field path.
False та 0 зберігаються. Локальні значення атрибутів не успадковуються від group.

Для осі: `variant_axis:{key}|null`; key посилається на single-valued definition.
`variant_value` SKU — типізований scalar; legacy `v_value` залишається текстовим
read adapter для старих споживачів. Значення sibling SKU унікальні в межах товару;
для товару без осі рівно один SKU і variant_value=null. Required axis перевіряється
на SKU, не дублюється в product attributes. Назва SKU продовжує включати display
label значення; для color dictionary зберігається чинне українське відображення.
Міграція осі з legacy v_value вимагає явного mapping, без вгадування за назвою.

### Каталог v2 та фільтри

#### Локальний етап: редагування підготовлених чернеток товарів

У `/admin/categories` товарна v2 draft категорія має секцію «Товари категорії»:
список, форма за definitions і збереження через спільний pending-operation
механізм дерева. `GET /products/admin/typed-drafts?category_id=...&cursor=...`
повертає `{category_id,revision,items:[{id,name}],next_cursor}` по 25 товарів;
cursor прив'язаний до категорії/revision/epoch. Дрейф — 409, помилка читання
не маскується порожнім списком. У списку можуть бути ще не підготовлені
товари: спроба відкрити їх повертає явну помилку, не неявну міграцію.

`GET /products/:id/admin/typed-draft` повертає одну узгоджену ревізію:
назву, category_id, definitions, attributes_v2, variant_axis і всі SKU з їх
ідентичностями, назвами, slug та variant_value. Лише ADMIN, no-store; legacy
товар без явних v2 полів не мігрується під час читання.
`PATCH /products/:id/admin/typed-draft` приймає повну редаговану частину
`{expected_revision,name,attributes_v2,variant_axis,variants:[{id,variant_value}]}`
і UUID Idempotency-Key. Всі наявні SKU мають бути draft; категорія — v2 product
draft. Склад SKU та категорія незмінні, максимум 100 SKU на операцію.
Невідомі поля відхиляються. Неповні required атрибути допустимі для draft;
неправильні типи, дублікати значень осі, пропущені/чужі SKU — помилки.
За відсутності осі допускається рівно один SKU зі значенням null.
Назви SKU формуються з назви товару та display value (enum label, Так/Ні,
число з одиницею або текст). Slug, SKU, ціни, залишки, промо й images не
змінюються. Журнал оновлює лише назви та typed fields і підтримує точний
повтор запиту. Створення/видалення SKU, публікація, color dictionary adapter
підключаються окремо; цей endpoint не дозволяє редагувати SKU з
legacy color_id, доки відображення словника не підключене.


Окремий `GET /products/catalog/v2` усуває конфлікт між атрибутами й reserved keys.
Legacy `/products/catalog` з comma-синтаксисом лишається для v1; нові параметри
не передаються старому parser. Після переходу категорії legacy запит із
несумісними фільтрами повертає 409 `ATTRIBUTE_CONTRACT_UPGRADE_REQUIRED`.

Параметри v2: category_id (optional для всього каталогу), page (1+), limit
(1..100, default 20), sort (newest|price_asc|price_desc), filters (один JSON string).
Повторений scalar parameter, невідомий sort/key/operator або некоректний JSON —
400. Frontend передає filters через URLSearchParams, не конкатенацію рядків.
Декодований приклад filters для AVR:

```json
{"attributes":[{"key":"rated_current","min":16,"max":63}],"brand_ids":[],"in_stock":true}
```

Структура filters: `attributes:[{key,values:[scalar]}|{key,min?,max?}]`,
`brand_ids:[ObjectId]`, `category_ids:[ObjectId]`, `color_families:[string]`,
`price:{min?,max?}`, `in_stock:boolean`. Optional поля можна пропустити;
порожні arrays прибираються нормалізацією. Межі включні, min<=max.
Кома у string — частина значення: `["Чорний, білий"]` — одне значення.
OR усередині values, AND між keys. Повтор key, range разом із values — 400.
Максимум 50 dimensions, 100 values на dimension і 16 KiB decoded filters;
перевищення — 400 `FILTER_LIMIT_EXCEEDED`, ці ліміти не обмежують дерево.

Product scope використовує тільки definitions цієї категорії. Group/global scope
має price/stock/brand/category; локальні attribute/color filters там відхиляються,
щоб не змішувати несумісні характеристики різних категорій. category_ids
звужують scope лише до його product-нащадків, сторонній ID — 400.
Невідома/прихована category_id — 404; порожній результат — 200.

Response: `{revision, items, page, limit, total, facets}`. Items — поточна public
SKU projection із additive brand/attributes_v2/variant_value. Один SKU — один
результат; facets рахують SKU так само, як total. Сортування має `_id` tie-breaker.
Facets: attributes `[{key,values:[{value,count}],min?,max?}]`, brands/categories
`[{id,label,count}]`, price `{min,max}`, in_stock counts. Self-exclusion з TD-0008
зберігається: dimension не обмежує свій лічильник, решта constraints застосовується.
Один $elemMatch на k+v/range не допускає збігу key і value з різних атрибутів.

Landing v2 використовує той самий typed filters object (`filters_v2`),
contract_version=2 та product category_id. Legacy filters залишаються read adapter;
невідтворюваний typed filter не сплощується з втратою семантики. Зміна pins
інвалідує landing/catalog; канонізація filters сортує keys і множини values та
прибирає duplicates. Точне співпадіння з лендінгом визначається після типізації,
а не порівнянням raw URL. Правила індексації залишаються в SEO-матриці.

### Бренд, зв’язки, вітрина та адреси

Brand — окрема сутність `{_id,name,slug,status}`; product.brand_id nullable.
vendor_id зберігає значення постачальника. Не створюємо brand із vendor автоматично.
ADMIN CRUD `/brands`, public active list/detail; used brand delete — 409.
Manufacturer-атрибут переноситься лише за затвердженим mapping D02.

Product relations: `[{type:"alternative_configuration",target_product_id,
variant_pairs:[{source_variant_id,target_variant_id}]}]`. Без self-links/duplicates;
SKU у pair належать відповідним продуктам. Mapping для refill фіксується явно,
не шукається за випадковим збігом тексту кольору. Legacy spooled_product_id
читається adapter до перевірки migration; ціни/stock читаються живими з цільового SKU.

> **Реалізовано локально (28.10, B08):** `GET|PUT /products/:id/admin/relations`, журнал (профіль
> `relations`), ≤ 1 `alternative_configuration` на товар. Поле `relations` (навіть `[]`) авторитетне —
> legacy `spooled_product_id` читається лише без нього; SKU без пари → найдешевший ACTIVE цілі
> («від»). Міграція v1→v2 пише зв’язок із парами за id кольору словника. Brand CRUD не робився:
> бренд = brand-сутність, якщо прив’язана, інакше характеристика «Виробник» (рішення власника).
>
> **Скасовано 04.11.2026 (рішення власника, локально):** product relations прибрано повністю — API
> `/products/:id/admin/relations`, профіль журналу `relations`, блок «Інша комплектація» в адмінці,
> запис `relations` міграцією й поле `spooled_counterpart` сторінки товару. Збережені
> `spooled_product_id` / `relations` ніхто не читає й не перевіряє при видаленні.

Category presentation: `{spec_order:[key],card_keys:[key],title_suffix:string|null,
variant_display:"text"|"color",alternative_label:string|null,alternative_help_html:string|null}`.
Color mode вимагає semantic=color. Суфікс «1.75 мм» переноситься лише до
конфігурації філаменту після аудиту.

> **Прибрано 05.11.2026 (рішення власника): категорійного presentation більше немає** — порядок і
> видимість рядків — у визначеннях (`order`, `visible_in_specs`, лише таблиця сторінки), попередження —
> поле товару `purchase_notice`, бренд/матеріал — `semantic: brand|material`. Нижче — історія 28.10.
>
> **Реалізовано локально (28.10, F08):** `GET|PATCH /categories/:id/admin/presentation` (профіль
> `presentation`) — фактична форма: `spec_order`, `hidden_spec_keys`, `emphasised_values`,
> `attribute_notes[{key,value,title,text,badge}]` (`alternative_label` прибрано 04.11.2026 разом
> зі зв’язками; `product_name_suffix` і `unit_required_keys` — 05.11.2026, рішення власника). Замість `alternative_help_html` — попередження за значенням (заголовок, текст,
> позначка на фото); `card_keys`/`variant_display` не знадобились (картка показує всі видимі
> й не приховані характеристики, кольорова вісь визначається семантикою). Export rules: `{google_product_category,
highlight_keys:[key],custom_labels:{label_0?,label_1?,label_2?,label_3?,label_4?}}`.
Значення labels — текст, жодного виконуваного шаблонного коду.

> **04.11.2026 (рішення власника):** з export rules лишилась тільки `google_product_category`. Ключі назви й
> highlights та статичні мітки прибрано — назва й highlights за одним правилом фіду для всіх категорій,
> мітки завжди обчислювані (див. блок «Feed export rules» нижче).

`GET /storefront-settings` — public sanitized projection;
`PATCH /storefront-settings` — ADMIN, revision/idempotency.
Settings: `{home_category_ids,featured_brand_ids,collections:[{id,title,
category_id,landing_id?,product_ids:[]}]}`. Вступ `/catalog` — не налаштування, а текст у коді
вітрини (рішення власника 03.11.2026). Посилання перевіряються;
непублічні елементи не видаються покупцю. Каталог — загальна ціль переходів,
а не зашитий /filament. Presentation/export category settings редагуються через
ADMIN category PATCH з тією самою перевіркою revision.

`POST /categories/:id/slug-change` та `/products/variants/:id/slug-change`:
`{slug,expected_revision}`, Idempotency-Key обов’язковий. Звичайне rename не змінює
slug. Реєстр routes резервує normalized path глобально серед canonical і aliases;
старий alias не можна зайняти іншою сутністю. Redirect зберігає target entity ID,
lookup обчислює поточний canonical path — без ланцюжка A→B→C.
`GET /routes/resolve?path=...` повертає `{kind:"canonical"|"redirect",path,target_path?,status?}`
або 404. Тільки внутрішні відносні paths; без scheme/host/fragment/query,
protocol-relative paths, control chars, dot segments чи encoded separators.
Slug-change journal атомарно для читача публікує reservation+slug+alias через
механізм розділу D06; не видаляє старий URL при частковому збої.

### Споживачі та критерії передачі в реалізацію

BE і новий FE переходять узгоджено по категоріях. Legacy read adapter зберігає
`attributes[].{k,l,v,unit}`, `v_value`, назву, SKU, ціни, promo і stock. Typed values
для старого відображення форматуються явно; enum ID ніколи не показується як label.
Partner API та price-sheet мають зберегти свої чинні поля/типи; нові поля лише
additive. PDF, feed і public mapper переходять на один semantic mapper;
Prom price/stock writes не змінюють definitions, category, identity або variant axis.
Cart/order зберігають чинні ID і snapshots; міграція їх не переписує.

Перед перемиканням v2 (тобто перед міграцією R02): contract tests на кожного споживача D01, новий FE,
перевірений mapping D02 (mapping перевірено на дампі 27.10; D02 лишається відкритим лише як baseline
Search Console/Merchant). Неоновлений клієнт отримує явну помилку запису;
read adapter не є дозволом повторно обчислювати keys з label.

## Проміжний HTTP interlock для legacy writers (24.10.2026)

До реєстрації нового write API чотири старі контролери categories/products/colors/
landings мають class-level interlock для POST/PUT/PATCH/DELETE. Після створення
`catalog_control/_id=catalog` вони повертають 503 із
`details.code=CATALOG_LEGACY_WRITES_DISABLED`, навіть при phase=idle. Це свідоме
блокування старого контракту після bootstrap, не journal adapter і не тимчасове
очікування завершення однієї операції. Винятки — read-only POST validate і PDF.
Блокуються також ручні promotion/images/stock PATCH цих контролерів.

До bootstrap старий контракт лишається доступним тільки для flat active v1 даних
(допускаються відсутні legacy metadata). Несумісне дерево без control дає 503
`CATALOG_CONTROL_MISSING`. JWT/RBAC працюють перед interceptor: 401/403 зберігаються.
GET/HEAD та не-каталожні контролери цим interlock не змінюються. Поточні legacy
GET ще не отримали загального read barrier — це окрема умова активації дерева.

Bootstrap проводиться тільки після зупинки/ізоляції всіх writers і завершення
запитів, які вже виконуються. Interlock не є lock/transaction та не зупиняє прямі
service/DB/CLI записи чи старі instances. Control не можна видаляти для обходу
блокування. Additive staging CLI вже створює control: на такій копії старий запис
через HTTP теж буде вимкнений. Це не готовий повний rollout; нові gated API та
сумісна адмінка потрібні до відкриття записів після міграції.

## Бар’єр legacy HTTP reads (24.10.2026, локальна реалізація)

Для тих самих чотирьох контролерів GET/HEAD, POST validate і POST PDF тепер
перевіряють control перед domain read та після нього. Приймається тільки idle
із незмінними revision/epoch; зміна initialized-state теж відкидає відповідь.
Без control допускається початковий flat active v1; initialized idle v1 підтримано.
Writing/published/recovering/recovery_required або некоректні counters дають
503 CATALOG_MAINTENANCE. Зміна stamp — 503 CATALOG_READ_CHANGED. Заголовки:
Retry-After: 5 та Cache-Control: no-store. Повтор усередині запиту не виконується.

Legacy projections ще не вміють повністю застосовувати v2 definitions/visibility,
тому будь-який v2/group/nested/hidden category snapshot блокує legacy reads:
503 CATALOG_READ_UPGRADE_REQUIRED при control, CATALOG_CONTROL_MISSING без нього.
Нові tree/children endpoints лишаються окремими зі своїм existing read barrier.

PDF handler повертає StreamableFile із готовим buffer; відправлення bytes та
PDF headers виконується Nest лише після after-read перевірки. Отже зібраний під
час зміни каталогу файл не встигає частково потрапити клієнту. Чинний MIME,
attachment filename та status збережені.

Це уточнює попередній опис доступних reads: вони доступні при стабільному legacy
стані, а не під час міграційних записів. Scope поки лише чотири HTTP controllers.
Feed/sitemap/partner exports, checkout, direct service calls, external caches та
visibility purge ACK ще потребують власної інтеграції. Без цього v2 не активувати.

## Захист експорту під час переходу каталогу (локально, 24.10.2026)

FeedService перевіряє legacy read stamp до збирання даних і після формування XML,
безпосередньо перед синхронною публікацією кешу. Та сама перевірка діє для cron,
bootstrap, ручного rebuild і queued rerun. Збій зберігає попередні XML/дату/summary;
не публікується ні частковий, ні порожній XML. Опис каналу тепер нейтральний:
«Каталог товарів Fillando».

Кеш зберігає initialized/revision/epoch генерації. Публічний GET використовує
getVerifiedXml: busy/несумісний каталог дає 503, а інший stamp — 503
CATALOG_FEED_STALE до успішної регенерації. Старий XML зберігається в пам’яті для
діагностики, але після зміни stamp не віддається. Maintenance/stale помилка має
Retry-After: 5 і Cache-Control: no-store; без першого XML чинний Retry-After: 60.
Стабільний download зберігає XML MIME, Last-Modified та max-age=300. Уже збережені
зовнішнім кешем відповіді потребують майбутнього purge/visibility release протоколу.
xml_ready у статусі означає наявність кешу, не live-перевірку його доступності.

Партнерські categories/skus/lookup/bulk availability/single availability тепер
використовують HTTP read barrier. POST читання явно позначені read-only та не
потрапляють під legacy write interlock. Auth/rate limit зберігаються перед читанням;
503 має Retry-After: 5/no-store. Чинні payload успішних відповідей не змінено.
Це узгодженість окремого запиту: revision-bound partner cursor між сторінками
ще не реалізований, як і typed v2/ancestor visibility adapters.

Ці зміни не активують v2. Legacy exports блокуються на несумісних категоріях.
Checkout, sitemap, direct partner service calls, external cache invalidation та
нові write API залишаються окремою роботою. Feed generation захищено на рівні
service, partner — на рівні HTTP interceptor.

## Checkout catalog read barrier (локально, 24.10.2026)

OrderService.loadOrderableVariants перевіряє catalog stamp до й після читання
SKU; guard діє і для create, і для admin revise items. При busy/changed/несумісному
legacy snapshot — 503 до order write, номера замовлення чи читання/використання
купона. Не додаємо post-write interceptor, який міг би віддати 503 вже після
створення замовлення й спровокувати повторний checkout. Повідомлення barrier
українською; machine-readable details.code збережено. Автоповтору mutation немає.

Admin збільшення кількості чи додавання нової позиції читає каталог і блокується
під час переходу. Зменшення/видалення збережених позицій, контактні дані, статуси,
платіжні результати та invoice/report на order snapshots не потребують цього
каталожного читання. Збережені ціни й назви не перераховуються через нову таксономію.
Gateway result для вже існуючого замовлення не залежить від catalog control.

Це узгодженість прочитаного snapshot перед side effects, не резерв stock і не
транзакція від читання до commit. Каталог може змінитися після успішного finishRead;
перевірений snapshot залишається основою цього замовлення. Ціни/stock Prom не
серіалізуються catalog gate. Legacy v2/ancestor visibility adapter ще потрібен
до активації нового контракту; цей guard наразі відхиляє несумісні дані.

## Спільний sitemap export (локально, 24.10.2026)

GET /catalog/sitemap повертає {initialized, revision, epoch, variants, categories,
landings}. Усі три набори читаються під одним legacy read stamp до/після queries,
із primary. SKU лише active; landings лише active з існуючою категорією. Поля
обмежені slug/category_slug/updatedAt, немає приватних category/product полів.
Busy, changed stamp або несумісний v2 — 503, не частковий набір. Справді порожній
legacy каталог повертає три явні порожні arrays. Cache-Control: no-store.

Frontend робить один запит до цього endpoint замість незалежних slug/category/
landing reads. Валідатор відкидає null/404, відсутню array, неправильну дату чи
небезпечний slug: помилка не стає статичним sitemap без товарів. Реальні updatedAt
використовуються для lastModified; при відсутності дати поле пропущене, замість
поточного часу генерації. Legacy URLs зберігаються до redirect-backed migration.

Один щоденний unstable_cache artifact з tags SITEMAP/PRODUCTS/CATEGORIES замінює
count-key і другий force-static route cache. Route force-dynamic, тому live API
не потрібне під час build; готовий artifact кешується на рівні даних. Старий
перевірений artifact може залишатися доступним при невдалій регенерації; cold
metadata-route failure не обіцяє спеціального HTTP 503 mapper. Для visibility
release потрібні purge ACK; це не реалізовано цим пакетом. ~~Перший реліз — без ACK (рішення власника
31.10.2026).~~ Змінено 02.11.2026 (P12): outbox очищень до підтвердження 2xx, з відлунням,
TD-0013-catalog-mutations §4.

Порядок deploy: backend endpoint → frontend. Немає fallback на три незалежні
джерела. Unbounded all-URLs legacy scope збережено; sitemap splitting, великий
каталог, v2 ancestor visibility та persisted route registry ще потребують роботи.

## Початковий ADMIN draft-placement API (25.10.2026)

PATCH /categories/:id/draft-placement, ADMIN, Idempotency-Key UUID,
{parent_id:null|ObjectId, order, expected_revision}. Успіх 200:
{operation_id, revision, category_id}; це receipt зміни, не новий category detail.
Повтор key+payload повертає попередню revision. Key з іншим payload — 409.

За замовчуванням API вимкнений: потрібен явно підготовлений control із
admin_draft_writes_enabled=true. Bootstrap та дозволи не створюються HTTP-запитом.
Прапорець дозволено вмикати лише в ізольованому середовищі після зупинки legacy
writers; це не дозвіл production activation. Він повторно перевіряється під gate.
Переміщується тільки draft branch без active/archived descendants. Жодної зміни
name/slug/visibility. V1 вимагає окремої міграції. Body не змінює flags/control.

Невалідний payload/key — 400; відсутня category/parent — 404; topology/revision/
identity/unfinished-operation conflict — 409; disabled/maintenance/recovery — 503.
Після непередбаченої помилки клієнт зберігає ключ і не створює новий автоматично.
Операторське recovery та загальний operation-status UI залишаються необхідними.

### ADMIN operation status (25.10.2026)

GET /catalog-operations/:UUID тепер повертає тільки {operation_id, status,
result_revision, error_code}, без owner/hash/token/journal images. Доступ ADMIN,
Cache-Control: no-store, невідомий key — 404. Працює і при вимкненому draft flag
та закритому gate: діагностика не є public catalog read.

Status pending означає незавершений receipt; він не відрізняє живий writer від
процесу після збою. Recovery_required відображає явний recovering/recovery_required
control для цієї операції. Completed/rejected/aborted/rolled_back беруться з receipt.
Жодних takeover, retries або зміни control цей GET не виконує. State є діагностикою
на момент запиту, не обіцянкою, що pending завершиться самостійно. Operation-status
UI та operator recovery workflow ще попереду.


### ADMIN draft workspace contract — 2026-10-25

Extend the opt-in draft placement API with POST `/categories/drafts` (name, slug,
kind, parent_id, order, expected_revision) and PATCH `/categories/:id/draft-details`
(name, expected_revision). Both use Idempotency-Key and the same journal receipt.
Creation derives its ObjectId from the operation UUID, so a retry never inserts
a second category. Slug and kind are immutable in the details operation; structural
placement remains separate. Definitions start empty and their editor is a later block.
The flag is checked before acquisition and again under the gate for every HTTP write.
GET `/categories/admin/capabilities` reports draft-write availability without enabling
it; admin tree items include the attribute contract version. The UI loads all cursor
pages before allowing a parent choice, rejects mixed revisions and preserves an
unconfirmed operation key across reloads. It never retries a mutation automatically.
Active/legacy categories remain read-only in the new workspace; publication and
storefront activation still require the v2 reader rollout.


### Draft workspace, implemented locally — 2026-10-25

- POST `/categories/drafts`: ADMIN; body `name, slug, kind, parent_id, order, expected_revision`; required UUID Idempotency-Key; 201 receipt. Definitions start empty, status always draft. ID derives deterministically from the UUID; identical replay returns the same category.
- PATCH `/categories/:id/draft-details`: ADMIN; `name, expected_revision`; 200 receipt. v2 draft only; slug, kind and visibility remain unchanged. Names must be unique.
- GET `/categories/admin/capabilities`: ADMIN, no-store; `{draft_writes_enabled, legacy_writes_enabled}`. Advisory UI state, not permission to bypass the gate. Missing control does not initialize it.
- Existing draft-placement and operation status are now consumed by the admin workspace. Admin tree items additionally expose `attribute_contract_version` (1 or 2); public shape unchanged.

All HTTP writes check `admin_draft_writes_enabled` before acquisition and again under
the gate. The flag remains disabled by default; it must only be enabled in an isolated
prepared rehearsal while legacy writers are stopped. A v2 draft still causes the legacy
storefront adapters to fail closed; this block is **not** permission to enable it on prod.
Rename journals only `name`, preserving slug and all unrelated category data. The new
editor has no publication, deletion, conversion or image writes. Attribute-definition
writes and ADMIN filter checks were added in the next block described below; public
storefront filters are not enabled by draft creation.

Frontend must follow deployment of these backend endpoints. For a browser rehearsal,
start disposable Mongo on 27018 and run from the sibling frontend checkout:
`yarn test:e2e --config playwright.categories.config.ts`. The backend fixture uses the
real controllers, service, journal and Mongo in `fillando-test-category-workspace-browser`,
with role-header authentication, loopback-only HTTP and a fixed local CORS origin.
It never connects to DATABASE_URL or to the restored production dump.


### Draft attribute configuration contract — 2026-10-25

GET `/categories/:id/admin/configuration` returns a stamp-verified v2 configuration
with revision, category_id, kind/status, definitions and derived fields/filters/specs/
variant_axes. ADMIN, no-store, no implicit bootstrap or v1 inference.
PATCH `/categories/:id/draft-definitions` replaces up to 100 definitions (200 options
each), using expected_revision and Idempotency-Key. Existing keys and option IDs must
belong to this category; omit them for additions. New identities derive from operation
UUID and input position, so identical replay is stable, independently of labels.
Only draft product categories; group/active/v1 mutations are rejected. All writes use
the shared journal and rollout flag. Copying is an explicit UI action that strips keys
and option IDs before saving a separate target configuration.
Any product/SKU/landing reference is conservatively treated as usage until the typed
writers are deployed: reject removal/type/unit/multiple/semantic/required/filter changes
and removed options; permit label/order/spec changes and optional additions. This is
stricter than the later per-key dependency check, not permission to invalidate values.
The editor previews form controls and filter controls from saved configuration. It does
not publish categories or claim existing legacy storefront facets support typed values.


## Typed definitions and filter preview — 2026-10-25

GET `/categories/:id/admin/configuration` is ADMIN/no-store and returns one verified
revision: category_id/kind/status/definitions plus controls.fields/filters/specs/variant_axes.
Legacy v1 is not inferred from labels; 409 upgrade required. Missing/busy control or
a read that changed mid-flight returns 503.

PATCH `/categories/:id/draft-definitions` replaces up to 100 definitions, each with up
to 200 options. Required expected_revision and UUID Idempotency-Key; rollout flag
checked before acquisition and under the gate. Existing key/option IDs must belong
to the category/definition. Additions omit identities; server derives them from operation
UUID + position, making retries deterministic. Changing label never changes the key.
The journal patches only attribute_definitions; URLs, legacy attributes and unrelated
metadata remain intact. Active/v1/group writes are rejected. Invalid types/operators/
foreign IDs are 400; dependency/revision conflicts 409; disabled/busy/recovery 503.

Until typed product/landing writers land, ANY referenced product/SKU/landing marks
the category in use. Existing definitions/options cannot be removed, nor type/unit/
multiple/semantic/required/filter behavior changed; labels/order/spec visibility and
optional additions are allowed. This conservative check protects pins too, but can
block removal of an actually unused key; exact per-key dependency resolution is pending.
Copy reads the source configuration, strips all key/option IDs and saves independently
under the target's expected revision. It does not link categories or modify the source.

POST `/categories/:id/admin/filter-preview` is a read-only ADMIN/no-store endpoint
(200). Body `{attributes:[{key,values:[scalar]}|{key,min?,max?}]}`; limits 50 dimensions,
100 values per dimension, 16 KiB JSON. Only enabled category attributes; no price,
brand, stock, group/global or pinned-filter contract yet. Empty selections are removed.
Booleans/numbers remain typed; comma-containing strings remain single values. OR
inside values, AND between keys; range bounds inclusive. Filtered SKU counts and
self-excluding facet counts operate on the same row and never cross-match sibling SKU.
The engine indexes each row once and tracks failed dimensions, avoiding a full filter
re-evaluation per facet. This is not the future paginated Mongo aggregation public API.

Preview reads at most 5 001 products / 20 001 SKU to enforce bounds of 5 000/20 000
without returning partial success. Only active/draft SKU of the selected product
category; archived SKU excluded. Product attributes_v2 and axis/variant_value are
validated; absent/malformed typed data returns 503 CATALOG_PREVIEW_DATA_UNAVAILABLE.
Over-limit returns 400 PREVIEW_LIMIT_EXCEEDED. A gate stamp brackets the entire
read/compute; configuration must have the same revision. Response contains revision,
category_id, total_variants, total_products, <=50 sample_variant_ids and attribute facets.
The endpoint never writes, publishes, initializes control or enables draft writes.

The browser rehearsal now seeds a disposable typed AVR category with 16/32/63 A SKU,
a boolean field and an enum. It verifies numeric + false filtering, self-excluding
range, copy to an empty draft with new keys/option IDs, persistence after reload,
and the earlier category-move/acknowledgement-loss scenario. Auth remains a fixture.

### Категорійний допис до назви товару (26.10.2026) — скасовано 05.11.2026

> **Скасовано (власник, 05.11.2026):** «Філамент (пластик для 3D-друку) — воно просто в назві
> товару, його не треба ніяким чином додатково вставляти»; «я просив міграцією додати в тайтл» — тож
> міграція один раз записує фразу в назви товарів і SKU (`product_name_addition`), а не категорія
> дописує її під час читання. `product_name_suffix` прибрано з
> категорії, mapping міграції, адмінки й сторінки товару; на v2-сторінці title, H1, кошик і
> Product JSON-LD — назва товару як записана + значення варіанта. Текст нижче — історія
> рішення 26.10.

`presentation.product_name_suffix?: string` (до 200 символів, порожній рядок
вимикає допис) повертається у product detail `category_presentation`.
Фронтенд додає його до базової назви ПЕРЕД значенням варіанта у H1 і передає той самий display name
у Product JSON-LD. SEO title використовує цей допис замість дублювання назви
категорії. Не виводимо тип товару зі slug чи назви категорії. Значення для
filament задається даними: «Філамент (пластик для 3D-друку)». Новим категоріям
та АВР значення за замовчуванням не встановлюється. Поле доступне у попередньому
редакторі presentation; mapping staging містить значення для filament.
Постійні product/variant names, slug, SKU і комерційні поля не змінюються.

Порядок назви за уточненням власника: **base product name → category addition →
variant display value**. Приклад: «Kingroon PETG (CoPET) 3 кг — Філамент
(пластик для 3D-друку) — Чорний (Black)». Суфікс `product_name_suffix` стосується
базової назви товару, не повної назви SKU. Для міграції зберігаємо допис у
конфігурації категорії; не дописуємо його до готового variant.name. Поточний
additive staging не переписує names/slugs; це перевіряє окремий regression test.
Якщо допис уже присутній у базовій назві, повторно його не додаємо. Варіант
береться з окремого поля/словника, а не вирізається з назви евристикою.
Майбутня повна міграція назв і експортів повинна застосовувати цей самий порядок.

### Створення typed product draft (локальний етап)

`POST /products/admin/typed-drafts` — ADMIN, opt-in draft flag, UUID
Idempotency-Key, `{expected_revision,category_id,vendor_id,name,attributes_v2,
variant_axis,variants:[{variant_value,price,stock}]}`. Strict payload, 1–100 SKU;
у категорії без осі — один SKU з null. Типи/унікальність значень перевіряються
за definitions так само, як при редагуванні. Категорія — v2 product draft;
vendor повинен існувати. Нові SKU завжди draft, images порожні; публікації немає.

IDs детерміновані від operation UUID та індексу SKU. SKU резервуються одним
атомарним збільшенням існуючого єдиного numbers.sku; формат FL-000001
зберігається. Резервація не відкочується: після збою можливі пропуски номерів,
але номер не видається знову. Відсутній/невалідний/дубльований лічильник — явна
помилка підготовки середовища, не вгадування значення. Конфлікт зі збереженим
SKU не перезаписує товар.

Slug генерується один раз із базової назви та display value варіанта, без
presentation-допису. Однакові slug (включно з різними значеннями, що однаково
транслітеруються) отримують суфікс зарезервованого SKU. Вже зайнятий кінцевий
slug відхиляється; зарезервовані redirect paths також не перевикористовуються.
Назви та URL наявних товарів не перегенеровуються.

Журнал підтримує insert-only product + draft SKU images. Порядок apply —
product перед SKU, rollback — навпаки. Цілий документ перевіряється перед
видаленням: зміна ціни/залишку зупиняє rollback конфліктом, не втратою даних.
Посилання з orders/carts/routes блокують видалення створених сутностей (relations — до їх скасування 04.11.2026).
Повтор запиту повертає один receipt без повторної резервації SKU. В адмінці
новий product-create command використовує спільний pending UUID/body механізм.
Додавання/видалення рядків до першого збереження підтримується; зміна складу
вже збереженого товару та публікація — наступні операції.

### Draft product details — 2026-10-26

Extend typed-draft GET with `details` (snapshot token, nullable description,
variants with id/price/stock/weight_g/images). PATCH accepts optional `details`
with the same shape. Existing typed-only edits stay unchanged. Creation remains
unchanged; details are edited after allocating product/variant identities.
Token hashes raw description and variant commerce/media fields, including
price/stock timestamps; stale token returns 409 before any domain write.
Validate exact membership, strict numeric bounds and HTTP(S) image URLs; sanitize
HTML. Journal only changed detail fields with before-image compare-and-set;
explicit draft-product-details profile permits them, default journal scope does
not. Rollback refuses concurrent edits to changed fields. Unchanged commerce is
not included in patches. Record price/stock timestamps only on actual changes.
UI uses existing rich-text and upload controls; files upload before mutation,
failed uploads block save, removal only detaches URL (does not delete S3 files).
Public publication, variant lifecycle and external storage acceptance are separate.

### Existing draft variant lifecycle — 2026-10-27

Typed-draft PATCH accepts optional `variant_action`: add{variant_value,price,stock,
weight_g}, archive{id}, restore{id}. It uses the existing revision/idempotency
contract and pending command. The supplied typed variants still describe exact
existing membership; action adds at most one new SKU or changes one status.
Read accepts draft/archived siblings, never active in this editor, and returns
status. Restore means archived→draft, not automatic publication. Archiving is a
status update, never deletion; IDs, URL and order/cart references persist.
Uniqueness includes archived values: restore an existing value instead of adding
another. No-axis products cannot add a second SKU. Total membership limit is 100,
including archives. Allocate SKU/slug using the same logic as product creation;
new ID derives from operation UUID. Existing URLs/commerce remain unchanged.
Journal supports bounded status patches only in the draft writer profile.
Mutation failure/replay/recovery keep the existing guarantees; counter gaps are
allowed. Public archived-page semantics and active publication remain separate.

### Product admin navigation

The Products index/create/edit entry points select legacy vs typed workspace from
ADMIN capabilities. Legacy components must not mount when legacy writes are
fenced. A typed product deep link loads its category and selects that product;
unsupported legacy/active data gets an explicit message and a link back to the
new index. Product workspace reuses category-tree pending-operation/recovery
state, but hides category editing and definitions; settings stay in Categories.

### Draft data readiness

Typed-draft GET includes a read-only `readiness` report: data_ready, issues and
warnings with stable code, field and optional variant_id. Check required non-axis
attributes, nonempty sanitized description, at least one nonarchived draft,
positive price, valid stock and at least one HTTP(S) image for each draft.
Unknown shipping weight is a warning, not a fabricated zero. These are shop
publication requirements, not a promise of Google rankings or Merchant approval.
The UI explicitly separates data readiness from publication: the public v2
pipeline is still disabled. No status or database writes occur during validation.

### Public category read adapter — 2026-10-27 implementation scope

Existing GET categories/list, slug and ID routes gain a v1/v2 allowlist adapter.
List remains an array of visible product categories; group detail is available by
slug/ID and navigation uses the existing public tree. Every ancestor must be active.
Detail includes revision, parent/kind/status/version, root-first ancestors, typed
public definitions and nullable SEO fields. V2 does not fabricate legacy filter
keys: required_attributes is empty; typed consumers use attribute_definitions.
No supplier/export configuration is exposed. Legacy presentation/timestamps and
Google taxonomy fields remain compatible. No write/publish is performed.
Only these adapted GET handlers may bypass the legacy-shape interlock; revision/
epoch and maintenance checks remain. All unadapted product/feed/checkout paths
retain their existing barrier. Missing control with nonlegacy data remains 503.

### Public catalog query implementation — 2026-10-27

GET `/products/catalog/v2` is now implemented locally. Category/group/global scope
resolves only active product categories with active ancestors. Strict query parser,
JSON filters, typed scalar validation, same-SKU matching, self-excluding facets,
price promotion parity, deterministic ID tie-breaker, pagination and public
allowlist run in Mongo aggregation. Items include id/product_id/category_id,
name/slug/SKU, price/stock/timestamp, v_value/variant_value, attributes_v2,
brand_id, main_image and derived promotion fields. Native Mongo facet limits and
15-second maxTimeMS apply; large-catalog load acceptance has not been performed.
**Bounds (owner decision 31.10.2026):** `facets.price` and the `min`/`max` of number characteristics are the
whole scope's (active SKUs of the category/group, effective price) whatever else is selected — TD-0008 §4 F7 and
the legacy `findCatalog`; only the counts are self-excluding over the narrowed listing. Pinned by
`public-catalog.int-spec.ts` («keeps the price and number bounds of the whole category…»).

Implementation boundary: local attribute filters require a v2 product category;
group/global/v1 scopes reject them instead of guessing conversions. Nonempty
color_families is explicitly rejected until the dictionary-semantic adapter is
implemented. Existing active brand documents can supply brand labels/counts;
brand CRUD/mapping remains pending. No public publishing or status change occurs.
Existing legacy product/feed/checkout APIs retain their interlock. OpenAPI reflects
this implemented endpoint and the adapted category response DTOs. UI consumers,
public product detail and release revalidation are the next dependent work.

### Storefront adapters, publication, checkout and feed — 2026-10-27 (local)

Visibility for every adapted public reader is the public category projection: an
active product category whose ancestors are all active. Implemented and covered by
integration tests on the disposable Mongo; not deployed:

- `GET /products/by-slug/:slug` — v1 payload unchanged; v2 answers the same shape
  through a read adapter (definitions-formatted specs, axis label, `color: null`,
  brand entity as `manufacturer`; no name suffix since 05.11.2026). Additive
  `category_path` (root-first, incl. own category). Hidden branch/draft SKU → 404.
- Legacy `GET /products/catalog` only for a visible v1 product category; v2 → 409
  `ATTRIBUTE_CONTRACT_UPGRADE_REQUIRED`, group/hidden/unknown → 404 (previously an
  unknown id produced an empty catalogue). Search, landings (v1 only), colours,
  sitemap (non-empty visible nodes only) are adapted; price sheet, PDF and partner
  API keep the legacy barrier.
- Checkout: adapted stamp + visibility; hidden-branch SKU → `VARIANT_UNAVAILABLE`
  before number/coupon/order writes. Feed: only public categories; v2 rows adapted
  (no colour for a generic axis, brand from active brand entity or the SKU is excluded).
- `POST /categories/:id/admin/publication` — `{action: publish|unpublish,
  expected_revision}`, UUID Idempotency-Key, `admin_draft_writes_enabled`; journal
  profile `publication` may change only `status` of categories and SKUs. Publish
  requires a public parent; product category publishes SKUs of ready products only
  (`skipped_products` lists the rest). Unpublish requires no active children and
  returns active SKUs to draft. Receipt replay returns `changed_variants: null`.
  Published products are no longer editable by the draft editor (active edits remain
  separate work).

Frontend URL contract of typed listings: `f.<key>` repeated values, `f.<key>.min/max`,
`category`, `brand`, `price.min/max`, `in_stock=1`, `sort`, `limit`, `page`; unknown
parameters fail (404), tracking parameters are ignored. Remaining before release:
colour dictionary adapter and filament v1→v2 migration (B04/B08), active edits,
typed landings, price sheet/PDF/partner adapters, export rules (B10), redirects (B07),
status verification on a production build and load acceptance.

### Colour adapter, typed landings and the filament migration — 2026-10-27 (local)

- Colour axis: definition `semantic: color`, `value_type: string`, filter disabled;
  `variant_value` = `colors._id` string; legacy `color_id/color_family/v_value` retained.
  `/catalog/v2` supports `color_families` only with such an axis, `facets.colors`
  (self-excluding, legacy swatch rule), `items[].color`. Product page and feed keep the
  dictionary colour; the axis spec row is printed from the dictionary, never the id.
- Typed landing = `filters_v2` + `contract_version: 2`; public under a v2 category only
  with them. FE: pinned keys removed from the visitor parser and applied over the request;
  exact match and the legacy v1 query format each answer one permanent redirect.
- Migration of one flat v1 category (journal profile `migration`: adds `categories.status`,
  `products.brand_id` to the default allowlist). Mapping (filament, owner-confirmed): `vyrobnyk` stays an ordinary
  characteristic (JSON-LD/feed brand read from it; since 2026-11-08 no badge above the title and not hidden in specs); `vaha`, `diametr` → numbers; axis key `color`;
  product-level `kolir` dropped on axis products (stale single-SKU copy), kept as text on the
  8 axis-less products; `material` kept, hidden by presentation; presentation from the
  former staging mapping. All legacy fields stay as the rollback image.
- Rehearsed on the stand: dry-run 360 targets → apply → revert (clean) → corrected apply.
  Counts, facets, 15 colour families, 14 landings and 301 feed items match the legacy
  baseline. Storefront caches must be purged after apply/revert.

### Published product editing — 2026-10-27 (local, owner-approved rules)

The typed product editor now edits products of a published (active) v2 category in place:
characteristics (required ones enforced), names, description, photos, commerce fields as
before, axis values (a colour axis via the dictionary, keeping `color_id/color_family/v_value`
consistent). Variant status follows the old admin: `add.status` (default active when
published), `archive`, `restore` (to the category's state) and a generic `status` action.
Storefront `products` cache and the feed are signalled after each write. Archived categories
stay read-only. Slugs and SKU codes are never rewritten; names follow `variantName`.

### Legacy-shaped exports, Prom sync and catalogue cost — 2026-10-28 (local, B11/R01)

- **One legacy read adapter for the exports.** Partner API (categories, skus, lookup, bulk and
  single availability), the admin price list PDF and the public price sheet are `@CatalogAdaptedRead`
  over the public category projection. Partner categories stay flat (`parent_id: null`, product
  categories only); SKUs, cards and availability come from visible categories only. A v2 product
  is rendered in the frozen v1 shape by `legacyShapeOf`: characteristics in stored order with the
  definition label and a text value (enum label, «Так»/«Ні», number as written), `visible_in_specs:
  false` not exported, a linked active brand entity first as «Виробник»; a colour axis keeps the
  v1 identity (`kolir`, dictionary `name_en`), any other axis its key and formatted value. The only
  observable change on the migrated filament is the product-level «Колір» row of colour-axis
  products, already dropped by the owner-approved mapping (293 cards, 267 of them stale).
- **Prom sync.** Unchanged narrow patch (price/stock, Prom snapshot, timestamps), no adapter needed;
  writes are deferred (`deferred` in the summary) while `catalog_control.phase` is not `idle`, so a
  Prom write cannot land inside a journal operation that edits the same price/stock and leave it
  unverifiable. Not a lock: one control read right before each write. The typed editor reads and
  writes `prom_id` and `vendor_product_sku` (profile `draft-product-details`); a new variant without
  an article gets the SKU, as in the old admin.
- **`/products/catalog/v2` cost and facets.** The product join projects only the four fields the
  pipeline uses; the item colour is joined after pagination; the colour facet looks the dictionary
  up per distinct colour. While any filter narrows the listing, multi-select facets list every
  value of the scope with a self-excluding count, zeros included (TD-0008 parity). On the 27.10
  dump: catalogue ~20 rps vs legacy 20–21, filters ~21.5 vs ~33 rps (16 parallel), facets of 6
  filter combinations identical to legacy.
- **Release facts (R01).** The migration CLI targets only local databases; production mode and the
  `admin_draft_writes_enabled` switch are release prerequisites. An old frontend against migrated
  data gets 409 on the filament listing, the new one serves both contracts — see the D08 draft
  (`docs/runbooks/catalog-v2-release.md`).

### Release tooling, stable characteristic order, partner colour row — 2026-10-28 (local, D08 §2)

- **Migration CLI production mode** (`--production`, `scripts/catalog-cli-target.cjs`): ~~the URI comes
  only from `CATALOG_MIGRATION_URI` in the process environment (never a dotenv file; the local stand
  MongoDB is refused)~~ — owner decision 02.11.2026: the URI is the backend's `DATABASE_URL` (environment,
  else `fillando-be/.env`: the local copy for a rehearsal, production on release day), the database in the
  command must be the one in the URI, and a remote server is refused without `--production`; the database must be `fillando-prod`, every write needs
  `--confirm=<command>:fillando-prod:<op>`, and `apply` needs a manifest of a restore-checked backup
  (`backup-manifest`: archive SHA-256, restore check ≤ 24 h, a byte snapshot of the catalogue
  collections that must equal the live ones). Recovery ~~/revert~~ needs the manifest of the same archive —
  owner decision 06.11.2026: `revert` is removed; a failed release restores the catalogue collections from
  its own backup (runbook §5).
  Local mode is unchanged. `scripts/catalog-admin-writes.cjs` switches
  `catalog_control.admin_draft_writes_enabled` idempotently (`enable` only with control and `idle`).
- **Refused plans release the gate.** A CLI `apply` refused by `journal.prepare` used to keep
  `phase: writing`; it now aborts before writes, as the HTTP writers do, and lists the changed targets.
- **Stored characteristic order is kept** by the typed product writer (`keepStoredOrder`); an
  unchanged save is a byte-level no-op and the partner card keeps its row order ~~, so the migration
  revert recognises untouched products~~ (`revert` removed 06.11.2026).
- **Partner card «Колір»** (owner decision 2026-10-28): for a colour axis the legacy-shaped partner
  card carries a `kolir` characteristic with the SKU's own dictionary `name_uk`, where the legacy image
  had the stale product-level copy. On the 27.10 dump: 270 of 293 values corrected, nothing else
  changes. The PDF and the price sheet are unaffected.
- **Rehearsal** in a separate MongoDB holding the dump as `fillando-prod`: backup → manifest → dry-run →
  apply (4.9 s) → admin writes on → a characteristic edited in the new admin and visible on the product
  page → one real order on the migrated data → clean-up → revert; afterwards 19 collections / 67 002
  documents and indexes equal the reference byte for byte.


### Product transfer and draft deletion/conversion — 2026-10-28 (local, F04/B02/F02)

- `GET /products/:id/admin/transfer?target_category_id=` — read-only proposal: characteristics carried
  over by key, else by normalised label and a compatible type (copied categories get new keys); no
  unit/type guessing; the axis prefers the same semantic; colour ids unchanged. Returns `mapped`,
  `dropped[{key,label,value,value_label,reason}]`, `missing_required`, `axis_problem`,
  `variants_to_draft`, `proposal`.
- `POST /products/:id/admin/transfer` — `{expected_revision,target_category_id,attributes_v2,variant_axis,
  variants,confirm_dropped}` + Idempotency-Key. The plan is rebuilt under the gate; `confirm_dropped`
  must equal its lost keys (`409 TRANSFER_PLAN_CHANGED`); target rules validate the values (published:
  required ones). One journal plan moves the product and every SKU; identity and commerce fields never
  change; active SKUs entering a draft category become drafts. Receipt adds `category_id` (target).
- `POST /categories/:id/admin/deletion` `{expected_revision}` and `/conversion` `{kind,expected_revision}` —
  empty v2 drafts only (`CATEGORY_IN_USE`, `CATEGORY_DELETE_REQUIRES_DRAFT`,
  `CATEGORY_CONVERSION_REQUIRES_DRAFT`, `CATEGORY_KIND_UNCHANGED`). Deviation from §5 of the mutations
  design: no stored conversion plan with assignments yet; an admin empties a category explicitly (transfer
  products, move subcategories) and then converts or deletes it — data are never moved implicitly.

### Typed landing writes — 2026-10-28 (local, F07)

Landings of a v2 product category are written by a separate ADMIN controller through the catalogue gate
and journal (profile `landing`), because their pins depend on the category definitions (mutations §9):
`GET /landings/admin/typed?category_id=`, `POST /landings/admin/typed`, `PATCH /landings/:id/admin/typed`,
`POST /landings/:id/admin/deletion` (drafts only). Pins (`filters_v2`) are validated against the
definitions (filterable keys, values, colour axis, active brands; no category/stock pins), at least one
pin, unique canonical pins and slug per category, a published slug is locked (B07), publishing needs a
matching active SKU. Counts use the `/products/catalog/v2` conditions (`countTypedLandings`), also for the
public landing list, so a landing created in the new admin (no legacy `filters`) counts correctly.

### Managed SEO and storefront settings — 2026-10-28 (local, B09/F05/F11)

- `GET/PATCH /categories/:id/admin/seo` — `{expected_revision, seo:{title,description,h1,intro_html,
  bottom_html}}`, v2 draft/published categories, sanitized, journal profile `seo` (the `seo` object only),
  `409 SEO_UNCHANGED`; revalidates `categories`.
- `GET /storefront-settings` (public projection), `GET /storefront-settings/admin`, `PATCH
  /storefront-settings` — implemented as specified above except `featured_brand_ids` (no brand entities in
  use) and `collections[].product_ids` (a collection is a category or a typed landing); journal profile
  `settings`; the storefront reads it under the `categories` tag.

### Feed export rules — 2026-10-28 (local, B10)

`GET/PATCH /categories/:id/admin/export` — `{expected_revision, google_product_category:{id,path}|null,
export_rules:{title_keys,highlight_keys,custom_labels:{label_0..label_4}}}`, v2 product categories,
definition keys only, journal profile `export`, early feed rebuild. The feed applies a rule only where it is
set (filament has none — unchanged output and campaign labels); `g:size`/`g:material` come from definitions
with that semantic (product value or axis value).

**04.11.2026 (owner):** `export_rules` removed — the body is `{expected_revision, google_product_category}`
only. Title and highlights follow the one feed rule for every category, custom labels are always computed;
Google Ads splits campaigns by `product_type` and the Google category instead. The filament feed stays byte
for byte (02.11 dump: legacy, after the migration and after its revert — 301/301).

### Redirect-backed slug change and route resolution — 2026-10-28 (local, B07/F10)

Implemented over the real storefront paths (category `/{slug}`, landing `/{category}/{landing}`, SKU
`/products/{slug}`), not the `/catalog/{slug}` scheme the planner was drafted for: `catalog_routes` stores
aliases only (canonical = current slug), each pointing at its entity, so there are no chains.
`POST /routes/{variants|categories|landings}/:id/slug-change` `{slug, expected_revision}` + Idempotency-Key
(journal profile `routes`; a category also keeps `/{old}/{landing}` for its landings; own aliases are
reclaimed; reserved roots refused). `GET /routes/resolve?path=` → `{kind:'redirect', path, target_path,
status:301}` only for a public target, else 404. The FE asks it in its 404 branches and redirects once.

### Published category editing and admin parity — 2026-10-29 (local, B03/F03, release blocker)

The draft-only `PATCH /categories/:id/draft-definitions` and `/draft-details` (never deployed) are replaced by
`PATCH /categories/:id/admin/definitions` and `PATCH /categories/:id/admin/details` (`{name, image?}`) for draft **and
published** v2 categories, plus `GET /categories/:id/admin/definition-usage` (per key: products, axis SKUs, landing
pins, card/feed settings, products without a value, per enum option). `draft-placement` also changes the order of a
published category among its siblings. Refusals are 409 with `details: {code, key, label, option, usage}` —
`DEFINITION_IN_USE`, `DEFINITION_TYPE_LOCKED`, `OPTION_IN_USE`, `FILTER_PINNED`, `REQUIRED_VALUES_MISSING`,
`DEFINITION_CHANGE_INVALIDATES_DATA`; the exact rules are in [TD-0013 mutations §11](TD-0013-catalog-mutations.md).
Admin tree items carry `image`.

Parity with the interlocked legacy admin: `GET|POST /colors/admin/entries`, `PATCH /colors/:id/admin`,
`POST /colors/:id/admin/deletion` (journal profile `colors`); typed product `details.variants[].promo_percent/
promo_ends_at` and read-only `variants[].supplier_price`; optional `vendor_id` in the typed edit (read answers it);
`variant_action` `archive_all` and `delete`; `POST /products/:id/admin/deletion`. Publication accepts colour-axis SKUs
(`COLOR_AXIS_MISMATCH` otherwise). OpenAPI exported; consumers: the FE admin only.

### Published moves, conversion by plan, curated product lists — 2026-10-29, second session (local, B02/F02, B09/F05)

- `PATCH /categories/:id/draft-placement` — a published category moves under a published group or to the root
  (`409 CATEGORY_PARENT_NOT_PUBLIC` otherwise; `CATEGORY_MOVE_REQUIRES_DRAFT_BRANCH` removed).
- `POST /categories/:id/admin/conversion-plan` (ADMIN, read-only) — `{target_kind: 'group', assignments[],
  landing_assignments[], adopt_targets}` → `{plan_id|null, category_id, revision, executable, counts, products,
  landings, problems, warnings}`; `400 CONVERSION_ASSIGNMENTS_INVALID`, `409 CONVERSION_TARGET_INVALID`.
- `POST /categories/:id/admin/conversion` — additionally `{kind: 'group', plan_id, expected_revision}` + Idempotency-Key
  → receipt `{operation_id, revision, category_id}`; `409 CONVERSION_PLAN_STALE | CONVERSION_PLAN_CHANGED |
  CONVERSION_PLAN_BLOCKED`, `404 CONVERSION_PLAN_NOT_FOUND`. Without `plan_id` — the empty-draft conversion as before.
- `storefront_settings.collections[]` — a category/landing **or** `{category_id: null, landing_id: null, product_ids}`
  (≤ 24, in order; `409 SETTINGS_PRODUCT_INVALID | SETTINGS_DUPLICATE_PRODUCT`); the public projection answers such a
  collection with `category_id: null`, `path: null`, `filters: {product_ids}` (visible products only).
- `GET /products/catalog/v2` — `filters.product_ids` (≤ 24): SKUs of those products in visible categories; under the
  default sort the list's order (in-stock SKUs first). Typed landing pins refuse it (`LANDING_FILTERS_INVALID`).
- Out of scope by the owner's decision (2026-10-29): brand entities, `featured_brand_ids`, brands on the home page.

### Large catalogue reads — 2026-10-30 (local, D06.2–D06.5)

- `GET /categories/options` (public) — product categories for selects, `{revision, items: [{_id, name, slug,
  kind, attribute_contract_version, order, image, attribute_count}], next_cursor}`, `limit` ≤ 1000 (default 200),
  cursor bound to revision and scope; definitions — by id. The old `GET /categories` list stays unchanged for the
  previous storefront until R04; the new FE does not read it.
- `GET /categories/:id/ancestors` (public) — the path root first, `{revision, total, items, next_cursor}`,
  `limit` ≤ 1000; a detail embeds the path up to 1 MiB of JSON, past it `ancestors: []`, `ancestors_paged: true`,
  `ancestors_total` (a product: `category_path_paged`, `category_path_total`). Renamed ancestor or new revision →
  409, garbage cursor → 400, unknown/hidden → 404, root → empty.
- `GET /products/catalog/v2/category-counts` (public, 120/min) — active SKUs per visible product category over the
  whole catalogue, `{revision, categories: [{id, count}], next_cursor}`, `limit` ≤ 20 000 (a plain positive integer
  since 31.10), cursor bound to the computation (409 `CATEGORY_COUNTS_CHANGED`).
- Errors of the cursor reads are in OpenAPI since the 31.10 audit: 400 (limit/cursor), 404 (unknown/hidden parent
  or category), 409 (`CATEGORY_REVISION_CONFLICT`), 503 (maintenance, missing control, data needing repair).

### Audit 31.10.2026 (local)

- **Failure of a write**: before the first domain write the gate is always released (also when `execute` refuses
  on its pre-check); after it the operation is `recovery_required` and the HTTP answer stays 503
  `CATALOG_OPERATION_REQUIRES_INSPECTION` with `operation_id`. `GET /catalog-operations/:id` then reports
  `recovery_required`. Recovery is an operator step — `fillando-be/scripts/catalog-recover.cjs
  inspect|resume|rollback` (TD-0013-catalog-mutations §3).
- **Creation** of a category refuses `ROUTE_PATH_RESERVED` / `ROUTE_PATH_TAKEN` (409), of a typed landing an old
  address of another entity — `LANDING_SLUG_TAKEN` (409), as a slug change already did (B07).
- **Deletion** of a product listed in a storefront collection — 409 `PRODUCT_IN_USE` (was 503).
- **OpenAPI**: the 2xx response of 39 operations changed by Plan-0010 restored; `CategoryPublicDto` documents
  `ancestors_paged` / `ancestors_total`; `/routes/resolve` 400/503, `/storefront-settings` 503.

### Owner decisions 31.10.2026 (local)

The owner's answers to the 15 audit questions are written into the four TD-0013 documents (general §4.6).
Decisions 2 (unit lock, section 4), 4 (facet bounds, `/products/catalog/v2`), 10 (no v1/v2 switch, section 4)
and 11 (category name, section 1) are recorded in place above; the two below are API-wide.

- **Sitemap rate limit (decision 12).** `GET /catalog/sitemap` and `GET /catalog/sitemap/part` go through the
  per-IP throttler — 10 requests a minute, then 429 with `Retry-After`; a request carrying the internal token
  (`x-internal-token`, the storefront and the release probes) is exempt. Behind Cloudflare with `trust proxy 1`
  the key is the edge address, so the limit is approximate until the real client IP is fixed. After release:
  keep the built sitemap in memory until the catalogue revision changes.
- **Security in the OpenAPI document (decision 13).** Three schemes: `access-cookie` (apiKey in cookie, the
  canonical name `access_token` from `docs/runbooks/env-template.env`, never the generating process's env),
  `partner-token` (bearer) and `internal-token` (header `x-internal-token`). The cookie is the document's
  default requirement; every operation states exactly one of four marks, read from its guards
  (`fillando-be/src/common/swagger/openapi-document.ts`): public `security: []`, the cookie (admin routes name
  the role at the start of the description), or the partner token. No route requires the internal token — it
  only exempts from the per-IP limits — so the scheme is declared and named on the throttled routes. A spec
  fails if any route is unmarked or the committed `openapi.json` carries other marks; Swagger UI shows the lock
  and the Authorize button, «Try it out» works as before.
