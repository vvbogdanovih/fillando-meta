# Plan-0010 — M0: докази й залишок

Дата: 2026-10-23. Локальна гілка BE: `feature/general-catalog-m0`.
Production не змінено. Не запускалися міграції, деплой, рекламні кампанії чи імпорт.

## D01 — інвентар коду виконано

| Споживач | Поточна залежність | Наслідок для переходу |
|---|---|---|
| BE category.service + DTO | Key виводиться з label; required_attributes управляє фасетами/одиницями | Новий write-контракт і сумісний read adapter |
| BE product.service create/update | Перезаписує k із l; variant_type.key зберігається окремо | Змінювати разом із категорійними визначеннями |
| FE ProductForm/ProductEditForm/AttributesBlock/products.utils | Повторно генерують key через toAttrKey | Новий FE має брати стабільний key з API |
| BE product-public.mappers | Unit join по key; allowlist публічної відповіді | Не втратити одиниці та не відкрити admin-поля |
| BE product-variant.repository | Каталог/фасети прив’язані до одного category_id | Окрема group-scope вибірка; зберегти self-excluding counts |
| BE feed builder + feed repository | requiredness, поля матеріалу/кольору, глобальні highlights/typeFamily, group ID | Нові правила семантики та групування, стабільні ID |
| BE price-list + public price-sheet | Manufacturer за label, fallback color=v_value | Універсальний read mapper; суфікс назви залишається |
| BE partner-api / Prom | Public projections та product/SKU identity; Prom оновлює ціну/stock | Перевірити сумісність projection, не міняти SKU/prom_id |
| FE landings | Pinned filters використовують key; landing-attributes читає definitions | Не ламати existing pins під час rename |
| FE seo.utils / robots / sitemap | noindex параметрів, base canonical, tracking теж вважається параметром | Застосувати єдину нову SEO-матрицю, врахувати tracking/page |
| FE ProductPage / VariantSwitcher | Суфікс філаменту, спеціальний refill, router.push без href | Категорійні правила та crawlable variant links |
| Cache/revalidation | Category/product/landing tags; feed rebuild | Дерево змінює залежні parent pages, breadcrumbs, sitemap |

Код локально підтверджує ці залежності. Тестова перевірка їх зміни ще не виконана,
бо runtime-контракти на цьому кроці не змінюються.

## D02 — локальну копію production відновлено; mapping ще відкритий

Додано [read-only audit](../../repos/fillando-be/scripts/catalog-audit.cjs)
і [7 тестів](../../repos/fillando-be/scripts/catalog-audit.test.cjs).
Перевіряє ID/slug/SKU, orphan links, keys/requiredness/range, коми в значеннях,
невідомі landing keys, drift категорії SKU, parent cycles та route candidates.
Повторені product keys дозволені як legacy multivalue.

Початковий запуск до отримання дампа: `--local` прочитав лише `127.0.0.1:27019/fillando`: categories/products/
product_variants/landings/colors — **0 документів у кожній колекції**. Це не
готовий каталог і не доказ готовності міграції. Порожній snapshot має finding
`incomplete_inventory`; зафіксовано окремим тестом. Читання не є транзакційним
snapshot: під час наступного аудиту зупинити редагування або використати
узгоджений offline-export. Існуючі дані/індекс production не перевірялися.

Власник надав дамп від 2026-10-23. Відновлено локально через mongorestore --gzip
із namespace mapping fillando-prod → fillando_rehearsal_20261023 на localhost:27019.
Перед записом перевірено, що окрема цільова база порожня; --drop не застосовувався.
Відновлено 19 колекцій / 66 983 документи, failed=0, індекси відновлені.
Поточна локальна fillando та production не змінювалися. Застосунок і jobs не
підключалися до копії. Дані/детальні звіти зберігаються локально в gitignored .local.

Read-only auditCatalog на проєкції п’яти колекцій: categories=1, products=44,
product_variants=301, landings=14, colors=122. Знайдено 85 входжень product-only
attributes: material=44, kolir=41. Це не автоматичний дозвіл видаляти поля:
потрібно визначити mapping до definitions/семантики, не втратити характеристики
і не сплутати старий kolir з віссю варіанта. Інших findings поточний аудит не виявив.

Сформовано 316 route candidates; це ще не затверджений old→new redirect registry.
D02 лишається в роботі: потрібні mapping характеристик і перевірка адрес,
Search Console/Merchant baseline. Повна міграція на цій копії ще не запускалася:
міграційний writer/recovery та сам скрипт ще розробляються.

## D03/D04 — дизайн SEO закрито

Рішення та офіційні джерела: [SEO-матриця](../designs/TD-0013-seo-matrix.md).
Вибрано multi-page SKU, self-canonical, ProductGroup без group URL, відсутність
optional canonical_link у фіді. Для нестандартних осей не вигадується color/size.
Уточнено tracking-параметри, pagination, порожні результати та перехідне керування
обходом фасетів. Це дизайн, не підтверджена індексація.

## D05 — специфікацію визначено; реалізація попереду

[API transition](../designs/TD-0013-api-transition.md), розділ 6, містить
конкретні поля/запити/відповіді, помилки та правила переходу. Перевірено проти
чинних Category schema/service, product catalog parser, create-product DTO,
create-landing DTO та OpenAPI. Нові endpoints поки не доступні.

- Дерево — плоский список із revision/cursor; довільна глибина й окремий admin read.
- Стабільні keys, типізовані values/options, окремі attributes_v2 та variant_value.
- Каталог v2 — структуровані фільтри без неоднозначного розділення комами.
- Окремий brand_id; vendor не перейменовується у бренд автоматично.
- Явні relations для комплектації, category presentation/export та storefront settings.
- Незалежні rename/slug-change; резервування адрес і прямий redirect на актуальний URL.
- Legacy read adapters; старий клієнт не може непомітно перезаписати v2 keys.

### Приклади «було → буде»

1. Перейменування «Номінальний струм» могло змінити ключ, який використовує фільтр.
   Буде: label можна змінити, key залишається; товари й фільтри продовжують збігатися.
2. Значення «Чорний, білий» у comma-query розбивається на два значення.
   Буде: один string у масиві values; вибір двох значень — два елементи масиву.
3. Для AVR: rated_current від 16 до 63 — числовий range із включними межами.
   Для електроковдри: розмір — значення осі, яке дописується в назву, без fake color.
4. «Електротовари → Живлення → Резервне живлення → Автомати введення резерву»
   підтримується від початку; перенесення гілки не змінює URLs товарів.
5. Назва товару змінюється без зміни slug. Явна зміна адреси створює alias;
   повторна зміна веде зі старої адреси одразу на останню, без ланцюжка redirects.

## D06 — протокол визначено; перевірки та дані попереду

[Протокол змін каталогу](../designs/TD-0013-catalog-mutations.md) визначає
ownership, журнал before/after, checkpoints, повторення запиту, recovery,
конвертацію категорій, rollback, cache/outbox і числові цілі продуктивності.

Простими словами: перед структурною зміною перевіряємо весь план, фіксуємо
що саме зміниться, застосовуємо та перевіряємо результат. Після збою операція
не запускається вдруге навмання — продовжується або відкочується за журналом.
Покупцю не віддається напівоновлений каталог: uncached залежне читання під час
запису може коротко отримати 503. Тривалі міграції потребують окремого вікна.

Це дизайн, не перевірений DB-протокол. Для завершення D06 потрібні реальний
реєстр old→new URL із D02 і репрезентативні API/DB заміри. Fault/integration tests
та репетиція backup/restore/migration — обов’язкові для B02/B04/R01 перед запуском.
Не знімати блокування за таймером: відновлення починається зі зупинки попередніх writers.

### Перевірка цього пакета

Звірено поточні legacy DTO/parser/service з описом переходу. JSON-приклади
перевіряються синтаксично; Markdown links і PDF перевіряються після експорту.
Runtime code, API та production цим пакетом не змінено; нові runtime tests
не запускалися. Раніше отримані результати тестів наведені нижче окремо.

## Підготовка B02 — pure topology core

Додано `src/modules/category/category-tree.ts`: копія перевіреного flat snapshot,
ітеративна перевірка циклів, ancestorIds, productCategoryIds та assertMove.
Не містить фіксованої межі глибини, не використовує рекурсію, не змінює передані
дані. Group scope не включає сторонні корені й повертає тільки product nodes.

7 unit-тестів охоплюють коректне дерево, корупцію, заборонені переміщення,
ізоляцію mutable input, **20 000 рівнів** та **150 000 дітей одного вузла**.
Це перевірка алгоритму в пам’яті, не benchmark API/БД і не доказ production latency.
Сервіс/ендпоїнти його ще не викликають, тому гарантії concurrent writes не заявляються.

## Підготовка B01/B03 — локальний код, без перемикання API

Додано `category-configuration.ts` та `attribute-definitions.ts` у BE.

- Історична категорія читається як коренева товарна категорія v1. Adapter не
  записує defaults у базу й не вгадує типи старих характеристик.
- Конфігурація v2 має явну версію та definitions; група не містить характеристик
  товару. Підготовлені definitions не активуються, доки категорія залишається v1.
- Новий key присвоюється один раз. Зміна label зберігає key; зміна використаного
  типу/одиниці/семантики або видалення використаної опції потребує міграції.
- Перевіряються number/string/boolean/enum, single/multiple, required для active
  товарів. Значення false і 0 зберігаються, «16» не підміняє число 16.
- Кома всередині значення зберігається; повтори multiple values прибираються.
- Значення осі перевіряється окремо від атрибутів товару. Розмір не стає кольором.

**Перевірки цього пакета:** 41/41 unit-тест у трьох suites: конфігурація (12),
атрибути (22), дерево (7). ESLint чотирьох нових файлів проходить; production
build BE проходить. Це тести локальних модулів, не HTTP/DB або production.

**Ще не підключено:** Mongo schema/індекси, нові DTO, service write paths,
перевірки використання key/pins у базі, унікальність значень між SKU та journal
writer. Жоден новий модуль ще не викликається поточним API. Тому B01/B03
позначені жовтим як частково виконані, а не як готові можливості магазину.
OpenAPI та FRD реалізованої поведінки залишаються без змін.

## B02 — Mongo write gate: 9 інтеграційних перевірок

Додано CatalogWriteGate: атомарне захоплення права запису, перевірка revision,
резервування idempotency key та відстеження epoch для узгодженого читання.
Уникнуто небезпечного автоматичного зняття блокування після таймера/рестарту.
Після початку записів просте скасування не відкриває gate.

Проміжний published зберігає ownership до запису результату операції; при
помилці результату наступний writer не отримує доступ до незавершеного стану.
Для читача write→abort теж є зміною epoch, навіть без зміни revision.

**Перевірено:** 9/9 integration tests на окремій MongoDB localhost:27018:
конкуренція 12 writers, retry одного ключа, конфлікт payload, stale revision,
abort/epoch, чужий owner, відсутній control, збереження lock при новому instance,
конфлікт receipt. Build BE та ESLint двох нових файлів — pass.

**Межа:** немає domain journal before/after, recovery CLI, outbox або підключення
до HTTP. Поточні create/move/update ще не використовують gate. Це перевірений
примітив, а не завершена транзакційність чи готова міграція. Production не змінено.

## B02/B04 — update journal та перевірка відкату

Додано CatalogMutationJournal для оновлення полів категорій/товарів/SKU/лендінгів:
зберігає незмінний план before/after, звіряє всі цілі, повторює перервану операцію
за фактичним станом документів, а не лише за лічильником прогресу.

Відкат проходить у зворотному порядку й торкається лише полів операції.
Перевірено, що змінені після початку операції ціни та залишки не губляться.
Missing і null розрізняються; стороння зміна значення, відсутній документ,
заміна плану або заборонене поле зупиняють операцію із закритим gate.

**Перевірки:** 17/17 Mongo integration tests: 9 gate + 8 journal; build та
ESLint — pass. Сценарій збою між domain write і checkpoint відтворено станом БД,
повторне виконання не дублює зміни. Перевірено повторний rollback та збереження
price/stock. Це не тест аварійного вимкнення MongoDB або повного HTTP-потоку.

**Межі реалізації:** update-only, до 500 цілей / 8 MiB на атомарний план.
Coordinator має бути єдиним власником token. Recovery CLI, передача ownership
після зупинки старого процесу, chunked migrations, insert/delete, outbox і HTTP
ще попереду. Готового скрипта міграції всього каталогу поки немає.
Production і локальну базову копію fillando_rehearsal_20261023 не змінювали.

## B02/B04 — керована передача операції, 2026-10-24

Додано read-only inspect: рахує before/after/conflict/missing без зміни даних.
Після зупинки та ізоляції попереднього writer операцію можна передати новому:
CAS переводить gate у recovering, змінює owner та epoch; старий token більше
не проходить перевірки. Потім журнал приймає новий token, оновлюється operation
receipt і відновлюється writing. До завершення перевіреної операції читання
залишається закритим. Таймер не дає права перехоплювати живий writer.

Передачу, перервану між claim та adoption, можна повторити з тією самою парою
власників. Divergence/missing target не дозволяють відкрити gate. Окремо перевірено
продовження apply й rollback після передачі, зі збереженням нового stock.

**Перевірки:** 21/21 integration tests (9 gate + 12 journal/recovery), build BE
і ESLint — pass. Тестова MongoDB localhost:27018; production та baseline-копія
не змінювалися. Падіння імітуються станами між кроками, не аварійним вимкненням сервера.

**Залишається:** CLI/runbook, перевірка фактичної зупинки writers оператором,
відновлення published та заміна самого recovery-процесу, domain verification,
chunked migrations/outbox, API і повний міграційний скрипт. Boolean-підтвердження
внутрішнього методу не є автоматичним доказом зупинки процесів.

## B02/B04 — завершення перерваної публікації, 2026-10-24

Додано явний outcome операції в control та publication token у receipt.
Відновлення завершує лише службові записи: не повторює зміни товарів і не
збільшує revision/epoch вдруге. Підтримано completed, aborted та rolled_back.
Повтор після завершення не знімає lock наступного writer.

Перевірені межі збою до й після receipt. Невідомий outcome, суперечливий receipt
або відсутній control не виправляються навмання; gate залишається закритим.
Попередні writers мають бути зупинені та ізольовані оператором.

**Перевірки:** 27/27 integration tests (15 gate + 12 journal/recovery), build BE
та ESLint — pass. Перевірки на disposable MongoDB; production і відновлений
baseline не змінювалися. Сценарії відтворюють проміжні стани БД, не фізичне
аварійне вимкнення сервера. API не підключено, повна міграція ще не запускалася.

Наступний пакет: recovery CLI/runbook і підключення до перевіреного міграційного
сценарію з domain validation. Заміна самого recovery-власника та outbox також
залишаються відкритими.

## Перевірки 2026-10-23

- `node --test scripts/catalog-audit.test.cjs`: **7/7 pass**.
- `yarn test --runInBand category-tree.spec.ts`: **7/7 pass**.
- ESLint нового topology core та його тестів: pass.
- `yarn build`: **pass** (production TypeScript build без spec-файлів).
- `yarn tsc --noEmit`: **не проходить** через TS2352 у незміненому
  `src/modules/auth/auth.controller.refresh.spec.ts:62` (`string` → `string[]`).
  Цей тест не редагувався; повну typecheck-green готовність не заявляємо.
- Markdown links і `git diff --check`: pass.

OpenAPI не експортувався: endpoints/controllers/DTO не змінювалися.

## Additive staging, API та універсальна картка — 2026-10-24

На окремій робочій БД `fillando_rehearsal_work_20261024` відновлено поточний
дамп. Базову `fillando_rehearsal_20261023` не змінювали. Локальний CLI
`scripts/catalog-stage.cjs` жорстко обмежений localhost:27019 і назвами робочих
rehearsal-БД. Він не є скриптом для production.

Dry-run побудував 45 змін: 1 категорія та 44 товари. Нові визначення включають
усі legacy-ключі й характеристики, знайдені лише в товарах; вихідні типи значень
збережено без автоматичного перетворення рядків у числа. `attribute_contract_version`
залишається 1. SKU, ціни, stock, замовлення та старі атрибути не переписуються.

Перший apply → inspect → компенсуючий revert → dry-run пройшов зі збереженням
fingerprint всіх 19 вихідних колекцій. Другий apply додав presentation mapping
для філаменту; inspect підтвердив усі 45 after-станів і незмінність legacy-даних.
CLI має resume/rollback/reconcile поверх journal/gate. Успішний apply/revert
перевірено реально; всі crash-сценарії самого CLI ще не відтворювалися. Ліміт:
500 цілей / 8 MiB; writers мають бути зупинені оператором, повна v2 активація відсутня.

Додано public `/categories/tree` та ADMIN `/categories/admin/tree`: пагінація,
revision + snapshot cursor, приховування неактивних гілок, перевірка циклів,
503 при maintenance/пошкодженні, 409 при застарілому cursor. Старі write API
ще не переведені на gate; увімкнення вкладених/v2 категорій поки не дозволене.

У картці порядок/приховування характеристик, вимога одиниць і виділення
значень надходять із `category_presentation`. Для нових категорій правила
нейтральні. Колишні filament-правила перенесено в міграційний mapping.
Title містить реальну категорію; суфікс варіанта залишається. Перемикач SKU
містить справжні SSR href, включно з розпроданими варіантами. Довільне значення
варіанта (розмір/струм) більше не використовується як fallback кольору.

Перейменування товару або значення варіанта змінює display name, але не slug.
Генерація slug залишається на створенні. Явна зміна URL й реєстр redirects
ще не реалізовані. Повний ProductGroup/SEO-перехід не заявляється.

Перевірки: 31 Mongo integration (27 gate/journal + 4 tree reads),
18 variant naming, 57 feed/helper, 3 staging planner, 2 tree HTTP/RBAC;
82 frontend tests для картки/metadata/характеристик/перемикача — pass.
FE `tsc --noEmit` — pass. Остаточні builds/OpenAPI перевіряються окремо.
Production, рекламні кампанії та зовнішні інтеграції не змінювалися.

## Розширення читання, адмінки й URL-плану — 2026-10-24

Додано `/categories/children?parent_id=...`: без parent повертаються корені,
діти сортуються за order/ID; cursor прив’язаний до конкретного parent/scope.
Невідомий або прихований батько — 404. Mongo integration: **32/32 pass**.

У формі категорії з’явилося керування порядком і видимістю характеристик
картки, збереження вимоги одиниць. Невидимі редактору міграційні правила
зберігаються при редагуванні. Прибрано філаментний preset Google-категорії;
існуюча таксономія не змінюється. Category purge тепер очищує також products,
бо product detail містить назву категорії, одиниці й presentation. Це ще
legacy-форма: повний редактор стабільних v2 keys/types/options попереду.

Route planner перевірено на 316 адресах дампу: **331 reservation, 316 canonical,
15 aliases, 0 конфліктів**. SKU URLs зберігаються. Службові/зовнішні/неоднозначні
paths відхиляються; canonical та aliases ділять один namespace. Lookup alias
посилається на entity ID, тому повторна зміна адреси не створює ланцюжок.
Результат збережено локально в `.local/catalog-rehearsal/route-reservations.json`.
Це pure planner/validator, не записаний production registry і не активні 301.
Тести route planner: **19/19 pass**.

Фід зберігає суфікс розміру/струму в title без передавання його як color;
словниковий український колір збережено. Перевірено AVR «63 А» та електроковдру
«150 × 180 см». Feed builder: **57/57 pass**. Custom labels, highlights і загальний
export contract ще потребують категорійної конфігурації; рекламу не змінювали.

Повна регресія на цьому етапі: BE **83 suites, 1414 pass, 1 todo**;
FE **72 suites, 777 pass**. Нові route/feed зміни після BE suite перевірені
цільовими тестами. BE build та OpenAPI export — pass; FE production build — pass.
Окрема standalone BE typecheck має раніше зафіксовану помилку старого auth spec.

## Прайс-листи — 2026-10-24

Public price sheet додає `variant_label`, не змінюючи поле `color` на довільне
значення. FE показує колонку «Варіант» та підтримує старі відповіді без нового
поля. Оптовий PDF теж має колонку «Варіант»; читає збережений суфікс display name,
тому український словниковий колір не втрачається, а розмір/струм не приховуються.
Ціни, оптові знижки, SKU і stock не змінено. OpenAPI отримав явний response DTO
price sheet. Shared display helper використовується також у feed title.

BE service/template перевірки — 27/27 pass. PDF перевірявся до входу в Chromium
за сформованим HTML зі stub renderer, а не як візуальний production-документ.
Повний перехід partner/dealer/Prom на typed v2 залишається відкритим.

Остаточна перевірка прайсів: FE 2/2 сценарії (нове generic значення і старий
color-only response) — pass. Після останніх змін production builds BE/FE — pass;
ESLint перевірених змінених BE-модулів: 0 errors, 2 наявні unsafe-any warnings
у legacy product writes. PDF звірено автоматично: 35 унікальних завдань,
4 виконано + 1 у роботі + 14 частково + 16 заплановано = 35.

## Створення й переміщення дерева під writer gate — 2026-10-24

Додано внутрішній `CategoryTreeWriter`: створює draft-категорії v2 й переміщує
вузли, змінюючи лише parent/order. План будується після захоплення gate;
перевіряються конфігурація, батько, цикли й конфлікти ідентичності. Legacy-вузол
не активується автоматично. Відсутній control не створюється приховано.
Повтор завершеної операції з тим самим request повертає її попередній результат;
змінений payload/revision під тим самим ключем відхиляється. Незавершена операція
потребує явного recovery, без takeover за таймером.

Journal тепер підтримує також створення категорії. Відновлення розпізнає insert
без checkpoint і не дублює вузол. Відкат видаляє тільки незмінний створений
документ і перевіряє children/products/SKU/landings/routes/settings references.
Власні дочірні вузли складеного плану відкочуються раніше за батька. На відміну
від category creation, product/SKU updates лишаються по визначених полях, без
відновлення всього документа поверх актуальних цін чи stock.

Перевірено **48/48 Mongo integration tests**: gate 15, journal 22, tree reads 5,
writer 6. Сценарії: вісім рівнів, конкурентні зустрічні move, cycle/leaf-parent,
повтор відповіді, dependency-aware rollback і виняток після фактичного insert,
до publication. Сценарій збою інжектує виняток у коді; це не фізичне падіння MongoDB.
Додатково **22/22 unit tests** topology/configuration/staging — pass.

**Межі:** coordinator ще не зареєстрований у HTTP. Немає дозволу на активацію
дерева у production: legacy category/product/landing/color writers та залежні
readers ще мають перейти на спільний gate. Delete існуючих категорій, conversion,
HTTP-статус операцій, outbox/purge ACK і загальний recovery CLI ще попереду.
Чинний staging CLI призначений для staging; він не є CLI tree-операцій.
Production, baseline та робоча копія дампу цим пакетом не змінювалися.

Для цього пакета `yarn build`, ESLint чотирьох змінених TS-модулів/тестів
і `git diff --check` — pass. HTTP/DTO не змінювалися; нового OpenAPI diff немає.
PDF повторно звірено: усі 35 ID та сума статусів присутні.

## Видалення й конвертація порожніх чернеток — 2026-10-24

Внутрішній writer доповнено `deleteDraft` та `convertDraft`. Видалення допускає
лише невикористану v2 draft: перевіряються діти, товари, SKU, landings, категорійні
routes та обидва види storefront references. Залежності блокують операцію до
записів; gate після такої відмови відкривається без зміни revision. Немає cascade.

Journal зберігає точний BSON before-image видалення. Відсутній після збою документ
розпізнається як виконаний delete, а не як втрачена ціль. Resume повторно перевіряє
відсутність залежностей. Rollback відновлює документ, але відмовляється при новому
документі з тим самим ID, конфлікті name/slug або втраченому/несумісному parent.
Зовнішня зміна документа не перезаписується й не видаляється. У разі конфлікту
gate лишається закритим для явного розбору.

Конвертація group ↔ product явна, лише для порожньої v2 draft. Змінює kind та
перевірені definitions через field journal; зберігає ID, slug, parent і order.
Діти, товари, SKU та SEO-сторінки блокують конвертацію. Активні категорії й legacy
не змінюються автоматично. Це ще не перенесення заповнених категорій.

Перевірено **69/69 Mongo integration tests**: gate 15, journal 29, tree reads 5,
writer 20. Додано 21 сценарій: залежності (включно з draft landing та alias),
повтор delete, одночасний delete parent/create child, збій без checkpoint,
відновлення BSON, конфлікти recovery, конвертація в обидва боки та її обмеження.
Збій моделюється пропуском checkpoint після фактичного Mongo delete, не фізичним
падінням сервера. `yarn build`, ESLint чотирьох змінених TS-файлів — pass.

**Межі:** підключення до старих HTTP writers не виконано: просте блокування
їхніх багатокрокових записів не замінює journal/відновлення. Потрібні інтеграція
writers/readers, visibility, lifecycle активних категорій, outbox та загальний
recovery CLI. B02 лишається частково виконаним. HTTP/DTO в цьому пакеті не
змінювалися. Production, baseline і робоча копія дампу не змінювалися.

## HTTP-захист від обходу міграції старими записами — 2026-10-24

У AppModule підключено interceptor для legacy controllers categories/products/
colors/landings. Покриває **18 маршрутів запису**: після явного bootstrap
catalog_control повертає 503 CATALOG_LEGACY_WRITES_DISABLED, не викликаючи service.
Блокує також idle phase — це заборона старого write-контракту після bootstrap,
а не лише на час окремої операції. Прямі service/DB/CLI writes не перехоплює.

До bootstrap flat active v1 каталог (включно з additive v1 metadata) зберігає
старий write API. Наявність v2/group/nested/hidden metadata без control дає 503
CATALOG_CONTROL_MISSING. Немає прихованого bootstrap чи автоматичного зняття
блокування. JWT/RBAC перевіряються першими; GET, POST validate та POST PDF
залишаються доступними. Ручні promo/images/stock PATCH також заблоковані після
bootstrap; фонова синхронізація не є HTTP і цим interceptor не змінена.

**Умова rollout:** перед bootstrap потрібно зупинити/ізолювати writers і дочекатися
завершення запитів. Interlock не є транзакцією та не захищає від уже запущеного
старого процесу. Staging CLI створює control, тому стара адмінка на такій копії
також втратить запис. Control не можна видаляти для обходу. Нові gated write API,
сумісна адмінка та загальні read barriers ще потрібні до активації v2.

Перевірено **84/84 integration tests** (попередні 69 + 15 HTTP/Mongo перевірок
interlock) та **105/105 існуючих controller/RBAC tests**. HTTP-тести використовують
реальний Nest, real RolesGuard і disposable MongoDB; JWT та domain services
замінені тестовими реалізаціями, щоб перевірити недопуск до запису. PDF перевіряється
як HTTP-відповідь зі stub renderer, не як візуальна генерація. Перевірені всі 18
mutation routes, усі фази control, несумісні дані без control, legacy-сумісність,
401/403, читання та read-only POST винятки.

Production build і OpenAPI export — pass; у spec задокументовано 503 для всіх 18
маршрутів. ESLint нових файлів — pass; перевірка змінених контролерів/AppModule:
0 errors, 1 наявне unsafe-any warning у logger AppModule. git diff --check — pass.
Production та копії дампу не змінювалися. B02 лишається частково виконаним:
interlock не замінює реалізацію й підключення нових journal-backed записів.

## Бар’єр читання та безпечна віддача PDF — 24.10.2026

Для legacy HTTP controllers categories/products/colors/landings додано перевірку
control із primary до та після GET/HEAD і read-only POST validate/PDF. Потрібні
idle phase, коректні counters та незмінні revision/epoch/наявність control.
Writing/recovery чи malformed counters дають 503 CATALOG_MAINTENANCE; змінений
stamp — 503 CATALOG_READ_CHANGED. Відповідь відкидається до відправлення даних,
помилки мають Retry-After: 5 і Cache-Control: no-store. Автоповтору читання немає.

Legacy projections ще не готові до v2 visibility/definitions, тому за наявності
v2/group/nested/hidden категорій вони блокуються з CATALOG_READ_UPGRADE_REQUIRED
(або CATALOG_CONTROL_MISSING без control). Стабільний flat active v1, зокрема
initialized idle після additive staging, читається. Нові tree/children endpoints
продовжують використовувати власний visibility-aware reader.

PDF controller тепер повертає StreamableFile з готовим buffer, замість прямого
res.end. Nest відправляє файл і download headers лише після перевірки stamp.
HTTP-тест навмисно змінює epoch під час формування PDF: клієнт отримує JSON 503,
без PDF bytes, Content-Disposition та часткового документа. Сам renderer не
змінено; у тесті він підставний, візуальна генерація PDF цим тестом не доведена.

Перевірено **95/95 integration tests** (додано 11 read-barrier сценаріїв),
**105/105 controller/RBAC tests**, production build, OpenAPI export та ESLint
змінених TS-файлів — pass. Перевірено зміни epoch/revision, появу/зникнення control,
всі закриті фази, несумісний v2 при idle та malformed counters. git diff --check
— pass. У HTTP інтеграційних тестах MongoDB/Nest/Role guard реальні, JWT/domain
services тестові. Production та копії дампу не змінювалися.

**Межі:** цей barrier охоплює чотири HTTP controllers. Feed/sitemap/partner exports,
checkout, direct service reads і зовнішні кеші ще потребують інтеграції; visibility
purge ACK та нові write API попереду. Не можна активувати v2 лише на підставі цього
пакета. B02 залишається частково виконаним; PDF містить ті самі 35 задач, без
штучного переведення великого пункту в «виконано».

## Фід і партнерський API: перевірка узгодженості експорту — 24.10.2026

FeedService перевіряє каталог до читання та після формування XML перед публікацією
в пам’яті. Працює для bootstrap, cron, ручного та queued rebuild. Помилка не замінює
попередні XML/дату/summary; порожній результат також перевіряється і не публікується.
Опис каналу більше не прив’язаний до філаменту: «Каталог товарів Fillando».

Кеш містить initialized/revision/epoch генерації. Публічний download використовує
getVerifiedXml: busy або несумісний каталог блокує видачу; інший stamp повертає
503 CATALOG_FEED_STALE до регенерації. Старий XML може залишатися в пам’яті, але
не видається після зміни stamp. HTTP maintenance/stale відповідає JSON 503 із
Retry-After: 5/no-store без XML headers; відсутність першого XML зберігає чинний
Retry-After: 60. Status xml_ready лишається ознакою наявності кешу, не live-доступності.

Усі п’ять партнерських read handlers — categories, SKU pagination, lookup,
bulk/single availability — підключені до HTTP read barrier. Read-only POST
позначені явно, auth/rate-limit залишаються перед barrier. Успішні payload не
змінено. Direct service calls цим interceptor не захищені.

Перевірено **102/102 integration tests** (95 попередніх + 7 exports tests) та
**146/146 regression tests** feed service/controller/cron/builder і partner API.
Export-тести використовують справжні MongoDB, FeedService, Nest HTTP та partner
guards; domain repositories і token authentication підставні, зовнішні сервіси
не викликаються. Перевірено блокування до domain reads, зміну epoch всередині
генерації, збереження старого artifact, stale download, bootstrap, v2, усі п’ять
partner routes, auth precedence та відкидання часткової відповіді.

Перший regression запуск мав два timeout у rate-limit тестах на повільному host
і один збій async fixture queued rebuild: після додавання beginRead відкладений
repository promise створювався пізніше за test release. Fixture виправлено —
promise створюється до запуску генерації. Повтор із testTimeout=30000 пройшов
усі 146 тестів за приблизно 3 секунди. Перевірки не видаляли й не послаблювали.
Production build, ESLint змінених TS-файлів, OpenAPI export (основний і partner)
та git diff --check — pass. Production і копії дампу не змінювалися.

**Межі:** один партнерський HTTP запит узгоджений, але cursor ще не прив’язаний
до revision між сторінками. Чинний public XML max-age=300 збережено: уже кешовані
зовні відповіді потребують purge/visibility release протоколу. Checkout, sitemap,
нові write API та typed v2/ancestor visibility adapters попереду. Активація v2
цим пакетом не дозволена; великі B02/B10 залишаються частково виконаними.

## Checkout: узгоджений snapshot до запису замовлення — 24.10.2026

Бар’єр catalog read підключено в OrderService.loadOrderableVariants. Checkout та
admin додавання/збільшення позицій читають SKU тільки при стабільному каталозі;
після читання stamp перевіряється повторно. Busy/changed/несумісний v2 дає 503
до номера замовлення, order write та читання/використання купона. Повідомлення
спільного barrier перекладено українською, details.code збережено.

Зменшення кількості/видалення збережених позицій використовує order snapshot і не
звертається до каталогу. Обробка gateway result, контактні дані, історія/статуси
та звіти вже створених замовлень не отримали глобального catalog interceptor.
Це навмисно: не можна віддати 503 через post-write перевірку після фактичного
створення order або зупинити обробку отриманої оплати.

Перевірено **14/14 інтеграційних тестів** цього пакета (6 нових checkout barrier
+ 8 чинних Mongo payment-method/session tests) і **181/181 order service/RBAC
regression tests**. Нові тести: stable legacy read до наступного кроку,
maintenance до repository/coupon/number/order calls, epoch change всередині
read, блокування quantity increase при дозволеному decrease, v2 admin additions,
gateway failed-payment update під час recovery_required. Policy та MongoDB
реальні, order/SKU repositories підставні; зовнішні платіжні/поштові сервіси не
викликаються. Це не реальна транзакція оплати чи end-to-end checkout браузером.

Production build, OpenAPI export, git diff --check — pass. ESLint нових/інших
змінених файлів — pass. OrderService та його старий spec мають наявний lint debt:
після змін 95 errors/1 warning. Порівняння з HEAD: до змін 100 errors/1 warning,
нових rule/message diagnostics немає; eslint --fix прибрав 5 зайвих type assertions.
Повний lint цих двох файлів не позначається зеленим.

**Межі:** barrier гарантує узгодженість прочитаних даних, не резервує stock і не
серіалізує зміни цін/залишків. Каталог може змінитися після успішної перевірки;
order використовує вже перевірений snapshot. Sitemap, revision-bound partner
pagination, v2 visibility/definition adapters, кеші та нові write API ще попереду.
Production, baseline та робоча копія дампу не змінювалися. B02 лишається частковим.

## Sitemap: один узгоджений набір URL — 24.10.2026

Додано GET /catalog/sitemap: {initialized, revision, epoch, variants, categories,
landings}. Усі джерела читаються із primary під спільним before/after stamp.
Це закриває прогалину трьох незалежних HTTP-запитів, які окремо могли бути
узгодженими, але належати до різних revisions. Public проєкція містить тільки
slug/category_slug/updatedAt; draft/archived SKU та draft/orphan landings виключені.

Frontend перейшов на один snapshot із перевіркою повної структури. 404/null,
відсутня array, некоректна дата чи slug з path separators не стають порожнім
списком. Явний повний порожній export допускається. lastModified виводиться лише
з наявного updatedAt, а не часу генерації; static сторінки не отримують вигадану
дату. Попередні URL structure, priority та changeFrequency збережено.

Sitemap тепер має один unstable_cache artifact (щоденний, tags SITEMAP/PRODUCTS/
CATEGORIES) та dynamic route. Count key, його fallback і другий force-static
snapshot прибрано; backend не викликається під час frontend build. При невдалій
регенерації кеш не замінюється частковим результатом. Видача старого перевіреного
artifact ще можлива: purge ACK і visibility release gate залишаються окремою роботою.

Перевірено **5/5 backend HTTP/Mongo tests**, **9/9 frontend tests**, production
builds BE/FE, OpenAPI export і git diff --check. Backend тести використовують
реальні Nest/Mongo і query pipeline; epoch change інжектовано перед фінальною
перевіркою. FE тести підставляють fetch/unstable_cache: доводять один fetch,
валідацію, відмову на 404/503, URL/date mapping, але не production ISR/revalidation
після аварії. Next build підтвердив dynamic /sitemap.xml без build-time API fetch.
Перший sandbox FE build завис і був зупинений; повтор поза sandbox пройшов.

ESLint нових BE файлів — pass; AppModule має одну наявну unsafe-any warning.
У FE не встановлений ESLint CLI: перевірено Prettier, тести й build/TypeScript.
Production та копії дампу не змінювалися. Backend endpoint має бути задеплоєний
перед новим frontend; fallback на старі незалежні запити навмисно відсутній.

**Межі:** ще немає sitemap splitting для великого каталогу, v2 visibility exporter,
persisted route registry, нових /catalog URL і purge ACK. Legacy all-URLs scope
збережено. F10 переведено з «Заплановано» до «Частково виконано», не до «Виконано»:
тепер 4 виконано + 1 у роботі + 15 частково + 15 заплановано = 35 задач.

## Перший journal-backed ADMIN write API та стан операції — 25.10.2026

Підключено PATCH /categories/:id/draft-placement для ADMIN. Body містить
parent_id/order/expected_revision, заголовок Idempotency-Key — UUID. Успіх повертає
receipt {operation_id, revision, category_id}; повтор однакового key/payload
повертає попередній результат без повторного переміщення. Зміна name/slug/visibility
цим endpoint неможлива. Клієнтський snapshot має актуальну revision.

API типово вимкнений: існуючий catalog_control має явно містити
admin_draft_writes_enabled=true. HTTP не створює control і не вмикає прапорець;
при disabled не створює навіть operation receipt. Flag повторно перевіряється
під gate. Він призначений для ізольованої підготовленої репетиції зі зупиненими
legacy writers, не для активації production. Переміщується лише draft branch без
active/archived descendants; v1 потребує окремої міграції.

Валідація/key — 400, невідома ціль/parent — 404, revision/cycle/contract/key
conflict — 409; disabled/busy — 503. Непередбачена помилка повертає тільки
CATALOG_OPERATION_REQUIRES_INSPECTION і operation_id, без raw внутрішньої помилки.
Збій після domain write не відкриває gate; повтор незавершеного key дає 409,
не запускає операцію вдруге. Ключ слід зберегти для inspection/recovery.

Додано GET /catalog-operations/:UUID для ADMIN: {operation_id, status,
result_revision, error_code}, без owner/hash/token/before-images, no-store.
Доступний при closed gate та disabled flag. Pending — незавершений receipt,
а не доказ живого процесу; recovery_required — явна фаза recovery. Endpoint
тільки читає, не виконує takeover чи автоматичний retry.

Перевірено **73/73 integration tests**: 9 нових HTTP сценаріїв, 20 writer,
29 journal, 15 gate. HTTP-тести використовують реальні Nest/Mongo/сервіс/writer/
journal та RolesGuard; лише JWT замінений тестовим role-header. Сценарії: disabled
без записів/bootstrap, RBAC/DTO, stable URL, replay/changed payload, stale/cycle/
missing parent, active branch rejection, concurrent moves, збій після фактичного
write, receipt privacy та status під recovery. Fault — інжектований виняток після
journal execute, не фізичне падіння MongoDB.

Production build, OpenAPI export, ESLint змінених модулів і git diff --check — pass.
Production, baseline та робоча копія дампу не змінювалися; flag там не вмикався.
**Межі:** форма переміщення/operation status в адмінці ще не підключена; загальні
create/update/visibility API, характеристики, public v2 adapters, purge ACK та
operator recovery UI ще попереду. B02 залишається частково виконаним. Це перший
обмежений HTTP write поверх journal, не завершений універсальний каталог.


## Адмінка дерева чернеток: цілісний сценарій UI → API → Mongo — 25.10.2026

**Обсяг у локальному коді:** `/admin/categories` має дерево зі згортанням гілок
без обмеження глибини, створення груп та товарних категорій-чернеток, вибір
батьківської групи, зміну назви й порядку/розташування. Поточний вузол, його
нащадки та товарні категорії виключені зі списку батьків. Active/v1 категорії
доступні для перегляду; попередній редактор вимкнений після bootstrap control.

POST /categories/drafts та PATCH /categories/:id/draft-details доповнюють
наявний draft-placement. ADMIN, required UUID Idempotency-Key, expected_revision,
подвійна перевірка opt-in прапорця та journal. ID створеної категорії стабільно
виводиться з UUID, тому повтор не вставляє другу категорію. Rename змінює лише
name; slug і решта даних зберігаються. Capabilities endpoint не вмикає записи,
а лише пояснює доступність кнопок. OpenAPI оновлено.

UI завантажує всі сторінки дерева однієї revision; змішані revision, дублікати
ID/cursor чи помилка наступної сторінки не дають редагувати частковий snapshot.
Перед запитом UUID та точний body записуються в sessionStorage. При невідомому
результаті ключ переживає reload, інші зміни блокуються; доступні перевірка стану
та явний повтор ТОГО САМОГО запиту. Status 404 не видаляє ключ: відкладений
початковий запит ще міг дійти. Немає автоматичного mutation retry; стандартний
Axios auth-refresh, якщо виникне 401, зберігає той самий key/body.

**Перевірки:** 83/83 BE integration (14 draft HTTP, 20 writer, 29 journal,
15 gate, 5 tree-read); 22/22 FE category tests (форми, API pagination, стани
інтерфейсу, parent exclusion, 20 000 рівнів без рекурсії). Backend/Frontend
production builds, OpenAPI export, ESLint змінених BE модулів — pass.
FE ESLint CLI не встановлено: використано TypeScript/build, Prettier і тести.

Додано окрему browser rehearsal конфігурацію з реальними Nest контролерами,
сервісом, journal та disposable MongoDB 27018; лише авторизація — тестовий
role-header. Браузер створює «Електротовари → Автоматика → Автомати вводу
резерву», перейменовує товарну категорію, переносить її до «Дім» без зміни
slug. Потім сервер реально застосовує ще одну зміну, а браузеру навмисно
обривається відповідь; після reload status підтверджує виконання без дубля.
Фінальна revision=7, категорій=4. Фінальний browser запуск — **1/1 pass**;
переглянуто desktop/mobile 390px, перевірено відсутність горизонтального overflow.
Це не production auth/session E2E і не
фізичне падіння Mongo. Next dev readiness перевіряє саме admin route; тест
використовує окремий build cache і webpack, щоб уникнути зависання повторного
Turbopack запуску на цій машині.

**Межі:** definitions нових категорій порожні; автофільтри/типізований редактор
характеристик, публікація, delete/convert UI, редагування зображень, public v2
readers, redirects і purge ACK ще попереду. Чернетки v2 несумісні зі старими
storefront adapters: admin_draft_writes_enabled не можна просто ввімкнути
на чинному prod. Прапорець увімкнено лише в disposable browser fixture.
Production, baseline та робоча копія дампу не змінювалися; merge/deploy не було.

F02 переведено до «Частково виконано». Зведення: **4 виконано + 1 у роботі +
16 частково виконано + 14 заплановано = 35**. Завершено локальний сценарій
роботи з чернетками, не всю категорійну модель або загальну міграцію.


## Характеристики категорій і реальна перевірка фільтрів — 25.10.2026

**Локально реалізовано два пов’язані блоки.** Редактор товарної v2 чернетки
налаштовує text/number/boolean/enum, unit, required, filter_enabled/filter_type,
spec visibility, order, multiple, semantic та enum options/order. Показує preview
полів товару й фільтрів. Незалежне копіювання читає source config, прибирає
source keys/option IDs і записує лише після явного Save. Reload підтверджує
збереження; category slug і source category не змінюються.

GET admin/configuration повертає перевірений snapshot із revision. PATCH
draft-definitions має opt-in flag, очікувану revision, UUID idempotency, gate та
journal; нові identities стабільно виводяться з UUID/позиції, не з label. Повтор
не генерує інших ключів. Foreign keys/option IDs, несумісні types/ranges і
некоректні DTO відхиляються. У UI команда definitions використовує той самий
збережений pending receipt і відновлення після reload, що й tree mutations.

Захист залежностей поки консервативний: будь-який product/SKU/landing reference
блокує видалення попередніх keys/options, зміну type/unit/multiple/semantic/
required/filter behavior. Label/order/spec і optional additions дозволені. Це
не точний per-key usage resolver: для складних змін populated категорій ще
потрібне контрольоване перенесення даних. Active/v1/group записи недоступні.

Другий блок — typed attribute filter engine та read-only ADMIN POST
/categories/:id/admin/filter-preview. Читає реальні attributes_v2 і single variant
axis/value, включає active/draft SKU та виключає archived. OR усередині values,
AND між keys; inclusive decimal ranges; false/0 не губляться, string із комою
не розбивається. Ключ і значення збігаються в одному атрибуті одного SKU,
а не між sibling SKU. Facets рахують SKU, виключаючи власний dimension;
повтори одного multivalue не збільшують count. Порядок enum — із options.order,
а не opaque ID. Алгоритм індексує атрибути рядка й обчислює failed dimensions
один раз, без повного повтору всіх фільтрів для кожного facet.

Preview має явні межі 5 000 products / 20 000 SKU, максимум 50 sample IDs;
filters — 50 dimensions / 100 values / 16 KiB JSON. Over-limit — помилка, не
обрізаний успішний результат. Відсутні/некоректні typed дані — 503, а не
вигаданий zero. Gate stamp охоплює читання й обчислення; revision має
збігатися з config. UI перевіряє тільки saved config, скидає старі counts після
зміни вводу й не підставляє порожній результат при помилці.

**Перевірки:** 83/83 BE integration (19 draft/config/preview HTTP, 20 writer,
29 journal, 15 gate), 33/33 BE unit (контракти/identities/filter semantics),
31/31 FE category tests, 2/2 browser scenarios із реальним Nest API/Mongo.
JWT у браузерній репетиції — fixture role-header; category path/journal і
фільтрація реальні. Fixture містить AVR 16/32/63 A: фільтр 20–40 A + false
знаходить один SKU, а self-excluding range лишається 16–63 A. Копія до
порожньої категорії має нові key/option IDs; після reload налаштування збережені.
Перевірено desktop/mobile editor overflow, а також попередній scenario move/
rename/stable URL/втрачена успішна відповідь. Обидві production builds, OpenAPI
export, ESLint змінених BE файлів і diff whitespace — pass. У FE немає ESLint
CLI; перевірено TypeScript/build, Prettier, unit та browser tests.

**Що це не завершує:** public /products/catalog/v2 і Mongo aggregation, group/
global facets, price/brand/stock constraints, pinned filter інтеграція, URL-state
вітрини, типізовані product write forms та публікація. Preview полів не є формою
створення товару. Новий engine поки підключений до ADMIN перевірки, не до
публічного каталогу. Масштабування до релізного навантаження не заявляється.
Prod, baseline/work dump не змінювалися; draft flag активований лише в
disposable fixture. Код не змерджений/не задеплоєний.

B06 перейшов до «Частково виконано»; B03/F03 деталізовано без передчасного
закриття. Статуси: **4 виконано + 1 у роботі + 17 частково + 13 заплановано = 35**.
Наступна залежність перед публікацією — typed product write/read та public catalog
adapters, щоб жоден legacy споживач не отримав несумісні дані.

## 2026-10-25 — типізовані товарні чернетки: форма → API → Mongo

**Локальна реалізація, не production.** У v2 товарній draft категорії
`/admin/categories` з’явилася секція «Товари категорії»: список по 25 товарів
і форма, побудована з її definitions. String/number/boolean/enum, multiple
значення, optional/required та single-valued вісь не прив’язані до філаменту.
Порожнє число не перетворюється на 0; false, 0 і текст із комою зберігаються.
Enum надсилає стабільний option ID, показує label. Зміна осі очищує попередні
значення варіантів, щоб адміністратор задав їх явно.

**API:** ADMIN/no-store GET `/products/admin/typed-drafts` із category_id і
cursor; GET/PATCH `/products/:id/admin/typed-draft`. Cursor прив’язаний до
категорії/revision/epoch. Дані форми й дерево повинні мати однакову revision.
PATCH вимагає UUID Idempotency-Key та повний editable payload. Невідомі поля
не ігноруються; неправильні типи/дублікати значень/чужі або пропущені SKU
відхиляються. Усі SKU — draft, категорія — v2 product draft, 1–100 SKU на
операцію. Без осі — рівно один SKU з null. Required перевіряється при майбутній
публікації; неповна чернетка допустима, некоректні типи — ні.

**Назви та стабільність:** суфікс залишається: enum label, число + unit,
Так/Ні або string. Приклад: до редагування «АВР тестовий — 16 А», після зміни
назви й значення — «АВР універсальний — 0 А», але slug `avr-fixture-0` і SKU
залишаються. Колір не вгадується зі значення. Старі color_id-зв’язки повертають
409 COLOR_ADAPTER_REQUIRED до підключення явного словникового адаптера.

**Збереження:** shared gate/journal патчить лише product name/attributes_v2/
variant_axis та variant name/variant_value. Не відновлює весь документ.
Ціни, залишки, промо, images, SKU, slug та description не перезаписуються.
Тест перериває публікацію receipt, окремо змінює ціну/залишок і виконує rollback:
назви/typed values повертаються, нові commerce values лишаються. Непідтверджена
операція утримує gate; exact replay повертає один receipt без другої зміни.
Форма використовує спільний із деревом pending command у sessionStorage:
нові записи заблоковані до встановлення результату.

**Перевірки:** 100/100 BE integration (17 typed product HTTP/list/recovery,
19 category HTTP, 20 tree writer, 29 journal, 15 gate); 40/40 BE unit;
36/36 FE category/form tests. 3/3 браузерні сценарії із реальним локальним
Nest API/Mongo та fixture auth: попередні дерево/definitions/filter preview,
а також редагування АВР, reload, typed false/0, суфікс і незмінний slug.
Перевірено мобільну ширину форми. BE/FE production builds, TypeScript,
OpenAPI export, ESLint змінених BE файлів, Prettier й diff whitespace — pass.
Перший запуск FE workers завершився timeout до тестів; повтор одним worker
пройшов. У браузерному тесті виправлено locator select за доступною роллю;
подальший повний запуск пройшов. Скріншот очікує завершення анімації меню.

**Межі:** форма редагує вже підготовлений товар; вона не створює товари,
не додає/видаляє SKU, не переносить між категоріями, не публікує. Public
catalog adapters, color dictionary adapter, SEO routes/redirects і повна
міграція ще потрібні. Legacy та неготові typed дані не конвертуються на GET.
Rollout flag увімкнено лише в disposable fixture; production і дамп не змінені.
Код не змерджений і не задеплоєний. Навантажувальне приймання не заявляється.

F04 — «Частково виконано»; B08 уточнено. Статуси плану:
**4 виконано + 1 у роботі + 18 частково + 12 заплановано = 35**.
Наступний блок: створення typed товару/складу SKU з відновлюваними операціями,
далі public read adapters перед увімкненням публікації.

## 2026-10-26 — робочий localhost та постійний стенд редактора

Знайдено причину помилки на localhost:9000: старий процес `node dist/main`
на 9001 не містив нових маршрутів; `/categories/tree` потрапляв у legacy `/:id`
і завершувався ObjectId cast error (500). Актуальний backend зібрано й
перезапущено. Tree/admin tree/capabilities і каталог початкової категорії
повертають 200; браузер завантажує дерево без червоної помилки.

Основна локальна база `fillando-prod` на 127.0.0.1:27019 не мігрувалася:
catalog_control у ній відсутній, вітрина лишається legacy. Для перевірки
нових writes створена **постійна окрема копія** `fillando_catalog_local_v2`:
44 товари / 301 SKU із джерела плюс демонстраційний draft АВР 16/32/63 А.
Новий редактор доступний на localhost:9010/admin/categories, API на 9002;
rollout flag увімкнений лише в копії. Жоден production endpoint не змінювався.

Повторюваний `scripts/local-catalog-workspace.cjs` не стирає джерело чи ціль;
існуючі правки зберігаються, неповна підготовка не перезаписується автоматично.
Окремий тестовий ADMIN і cookies ізолюють сесію стенда від основного localhost.
Випадковий пароль — у приватному gitignored файлі .local; стандартні JWT/RBAC
залишені. Інструкція запуску й межі — у runbooks/local-mongodb.md.

Це підготовка локального середовища, не завершення public v2, не реліз і не
production міграція. Статуси 35 завдань не змінюються: 4/1/18/12.

Фінальна перевірка стенда: звичайний password login через /auth/login,
окремі access/refresh cookies, /auth/refresh, збереження демонстраційного товару
через браузер та читання після reload — pass. Це реальний AppModule/JWT/RBAC,
без fixture auth override. Виявлене відсутнє picture у новому локальному
профілі заповнено null, як очікує клієнтський контракт. Паролі існуючих
користувачів не змінювалися. Повторний запуск підготовки не створює дублікатів.

## 2026-10-26 — повернення допису для філаменту через конфігурацію

За уточненням власника допис «Філамент (пластик для 3D-друку)» має лишитися
у відповідних товарів. Додано `presentation.product_name_suffix` (string,
до 200 символів) у category schema/DTO, staging mapping, product detail і
попередній редактор категорії. Порожнє/відсутнє значення нічого не додає;
тип товару зі slug/name не вгадується. Філамент налаштований явно.

H1 та Product JSON-LD використовують одну display name; metadata додає
налаштований текст без ще одного «— Філамент». Назви у базі, SKU, ціни,
залишки й slug не перезаписуються. На localhost:9000 через ADMIN API
змінено тільки presentation існуючої категорії filament. Production не чіпали.

Перевірки: 31 BE test (DTO/product service/staging), 81 FE test (product page,
metadata, attributes, JSON-LD і category form), BE build/OpenAPI export,
FE TypeScript — pass. ESLint: 0 errors, 2 попередні unsafe-argument warnings
у product.service. Браузер на реальному API перевірив товар FL-000302:
«Kingroon PETG (CoPET) 3 кг — Чорний (Black) — Філамент (пластик для 3D-друку)»
у H1, title та Product JSON-LD; slug `kingroon-petg-copet-3-kh-black` збережений.
Статуси плану не змінено; це уточнення частково реалізованого F08/F09.

## 2026-10-26 — порядок назви: варіант завжди останній

Виправлено порядок за уточненням власника: базова назва → категорійний допис →
варіант. Для прикладу FL-000302 тепер H1, SEO title і Product JSON-LD містять:
«Kingroon PETG (CoPET) 3 кг — Філамент (пластик для 3D-друку) — Чорний (Black)».
Попередній запис evidence про допис після кольору описує проміжний стан,
який цим виправленням замінено. URL та дані SKU не змінюються.

Уточнено контракт міграції: `product_name_suffix` — допис до базової назви,
не до повної назви SKU. Поточний additive staging переносить його в category
presentation і не переписує product/variant names чи slug. Regression test
перевіряє це для базової назви з дописом і без нього; фронтенд не дублює
наявний допис та ставить окреме значення варіанта останнім. Повна міграція
публічного v2/експортів ще не завершена; правило зафіксовано як її вимога.

Перевірки: 73 FE product tests, 4 staging planner tests, TypeScript — pass.
Браузер на localhost:9000 підтвердив однаковий порядок H1/title/JSON-LD.
Статуси плану незмінні; PDF перегенеровано.


## 2026-10-26 — створення товару з початковими варіантами

Додано ADMIN POST `/products/admin/typed-drafts` і форму «Створити товар» у
товарній v2 draft категорії. Форма використовує збережені definitions, список
постачальників та одну вісь. До першого збереження можна додати/прибрати до 100
варіантів, задати початкові ціни й залишки. Без осі — один SKU. Число 0 і boolean
false зберігають свої типи; пусте поле ціни не перетворюється на 0.

Сервер призначає ID, резервує артикули FL через наявний атомарний лічильник і
генерує slug із базової назви + значення варіанта. Збіг адреси з наявним SKU або
старим зарезервованим шляхом додає артикул; повторний конфлікт відхиляється.
Усі SKU — draft, images порожні. Категорійний SEO-допис до URL не додається.
Наявні описові адреси зберігаємо: масової регенерації немає. Перейменування
змінює display name, адреса залишається. Виправдані майбутні зміни URL — окрема
операція із прямим 301, яка ще входить до незавершеного B07.

Idempotency UUID/body і expected_revision захищають від повторного створення;
втрачений успішний POST відновлюється через статус операції після reload.
Журнал створює product, потім SKU; rollback — у зворотному порядку, лише якщо
повні створені документи незмінні й немає відомих залежностей. Зміна ціни/stock
або посилання з кошика блокує видалення. Після збою запису gate залишається
закритим для явного recovery. Лічильник артикулів не відкочується: пропуски
допустимі, повторне використання вже зарезервованих номерів — ні.

Перевірки:
- 114 BE integration tests: 14 create + 17 typed edit + 19 category HTTP +
  20 category writer + 29 journal + 15 gate — pass.
- 40 FE category component/schema tests — pass.
- 4 Playwright сценарії на реальному Nest/Mongo з fixture auth — pass:
  дерево, definitions/filter preview, typed edit, create із втраченою відповіддю.
  Перевірено мобільну ширину форми, збережені typed values, URL і відсутність дубля.
- BE build, FE production build (включно з TypeScript), OpenAPI export — pass.
  Збірка FE у sandbox зависла; після зупинки повтор поза sandbox завершився.
  ESLint змінених BE файлів — pass після виправлення типізації у тесті.
- API локальної адмінки 9002 перезапущено на новій збірці. На localhost:9010
  реальний JWT/password login + create/reload підтвердили товар
  «Локальний АВР — створено через форму»: FL-000303 (16 А, 1500 грн, 0 шт.) і
  FL-000304 (32 А, 2000 грн, 5 шт.). Адреси:
  `/products/lokalnyy-avr-stvoreno-cherez-formu-16-a` та
  `/products/lokalnyy-avr-stvoreno-cherez-formu-32-a`.
  Це збережені draft адреси, не опубліковані сторінки вітрини.

Межі: ще немає зміни складу вже збережених SKU, повного v2 редактора описів/images,
публікації/перенесення та public v2 storefront/feed. Оригінальну базу локального
магазину та production у цьому блоці не мігрували. F04 залишається частковим;
зведення 35 пунктів незмінне: 4 виконано (дизайн), 1 у роботі, 18 частково,
12 заплановано. PDF синхронізовано з Markdown.

## 2026-10-26 — опис, фото та комерційні поля товарної чернетки

У новому редакторі додано окремий розділ «Опис, фото та ціни»: форматований опис,
фото варіантів із сортуванням/видаленням зі списку, ціни, залишки й вага для
доставки. Наявні Quill та ImageDropzone/upload перевикористано. Дані редагуються
після першого створення чернетки; склад SKU, артикули, URL і промо не змінюються.
Характеристики й цей розділ мають окремі кнопки збереження.

Typed-draft GET повертає details зі snapshot token. PATCH опційно приймає details:
опис HTML/JSON, точний склад варіантів, price/stock/weight_g/images. Застарілий
snapshot після зміни опису/фото/комерційних даних відхиляється з 409, навіть якщо
catalog revision не змінилася. HTML очищається сервером; опис обмежений за
розміром, фотографій до 30 на SKU, URL лише HTTP(S). Порожня вага — невідома,
значення 0 для ваги відхиляється; нульова ціна/залишок зберігається явно.

Journal отримав окремий profile для details; стандартний profile як раніше не
дозволяє commerce patches. У журнал потрапляють лише змінені поля. Ціна/stock
отримують свої timestamps лише при зміні. Rollback відмовляється перезаписувати
паралельно змінене поле; зміни незачепленого залишку переживають відкат опису,
фото й ціни. Pending UUID/body і перевірка результату після збою залишаються спільними.

Перевірено 84 інтеграційні тести (26 typed edit, 14 create, 29 journal, 15 gate),
43 FE component/schema tests і 5 браузерних сценаріїв на реальному API/Mongo.
Нові перевірки охоплюють очищення HTML, порядок image URLs, числові межі,
конфлікт snapshot, повтор запиту, обидва сценарії rollback, відмову збереження
після помилки upload та повторне завантаження. Браузер виявив несумісність Quill
Delta із strict JSON schema; перед валідацією Delta тепер перетворюється на
звичайний об’єкт. Збереження й reload опису/price/stock/weight та сталі URL
підтверджено також із реальним JWT login на localhost:9010. Для локального
демо FL-000304 задано 1750 грн, 7 шт., 1200 г та демонстраційний опис.

BE/FE build, TypeScript, ESLint змінених BE файлів та OpenAPI export — pass.
API 9002 перезапущено; оригінальна локальна база магазину й production не змінені.
Межа перевірки фото: збереження адрес і поведінку UI при помилці upload перевірено;
реальний presign → S3 PUT → confirm у цьому блоці не запускався. Видалення зі
списку не видаляє об’єкт зі сховища; після незавершеного збереження можливі
неприв’язані завантажені файли, автоматичного очищення тут не додано.

F04 залишається частковим: публікація, зміна складу збережених SKU, перенесення
й підключення public v2 storefront/feed попереду. Зведення 35 завдань не змінене:
4 виконано, 1 у роботі, 18 частково, 12 заплановано. PDF оновлено.

## 2026-10-26 — нова локальна адмінка на порту 9000

За запитом власника frontend нового каталогу перенесено з 9010 на 9000.
Збережені v2 категорії, чернетки й останні зміни опису/цін залишаються у тій самій
локальній базі `fillando_catalog_local_v2`; повторної міграції чи копіювання немає.
API працює на 9002 з FRONTEND_URL=http://localhost:9000. Початкові база
`fillando-prod` та API 9001 залишені без змін. Frontend 9010 зупинено.

Frontend `.env.local` зберігає API9002 і окремий Next cache; файл gitignored.
Новий редактор доступний на `/admin/categories` через товарну категорію →
«Товари категорії». Старий `/admin/products/:id/edit` ще не замінений новим
редактором. Для входу використовується локальний ADMIN із приватного файла,
наведеного в runbook. Public v2 storefront/feed ще не підключені, тому 9000
поки слугує стендом адмінки. Планові статуси не змінюються.

Браузер підтвердив справжній email/password login із 9000 до API9002 (включно
з CORS/cookies), дерево, наявний АВР та розділ «Опис, фото та ціни» зі збереженими
значеннями. Під час перевірки виправлено блокування кнопки Login: кнопка не
залежить від попереднього isValid, але submit як раніше проходить RHF/Zod
валідацію; під час відправки вона заблокована. Окрема перевірка підтверджує,
що порожні/невалідні поля не передаються у submit handler.

AuthForm regression test — pass. Генерація Next dev types також
виявила зайвий named export HomePage у route page; його прибрано зі збереженням
default export та поведінки сторінки. Спільний readPageNumber також винесено
з category route у звичайний helper, бо Next не дозволяє такий named export у page.


## 2026-10-27 — великий блок M2: варіанти, Products і повна регресія

Production-приймання цього блоку не проводилося. F04 залишається частково виконаним:
новий локальний редактор уже працює, але active edits, перенесення між категоріями,
color dictionary adapter та публікація ще попереду. Зведення 35 пунктів не змінене:
4 виконано в зазначених межах, 1 у роботі, 18 частково, 12 заплановано.

### Що додано

- Збережений товар тепер підтримує додавання SKU, архівацію й відновлення.
  Приклад: до 16 A та 32 A додається 63 A; сервер видає новий артикул і URL один раз.
  Архівація зберігає артикул, URL, ціну, залишок, фото та історичні посилання;
  відновлення повертає у чернетку. Фізичного видалення немає.
- Значення архівного SKU не можна повторно використати для іншого sibling.
  Ліміт 100 включає архів. Дозволено архівувати всі SKU й пізніше відновити.
  Операції використовують той самий журнал, revision, exact-body replay та rollback.
  Резервування артикулів спільне зі створенням товару; відкат допускає пропуски номерів.
- Products відкриває новий редактор після bootstrap control. Пряме посилання
  `/admin/products/:id/edit` також працює для підготовленої v2 чернетки.
  До bootstrap залишається попередній редактор. Непідтримувані товари показують помилку.
- «Готовність даних товару» показує відсутні характеристики, опис, фото, некоректні
  ціни/залишки та відсутність draft SKU. Невідома вага — попередження.
  False/0 не губляться. Це перевірка збережених даних магазину, не публікація й не
  сертифікація вимог Google. Чернетки залишаються недоступними покупцю.

### Перевірки

| Перевірка | Результат і межі |
|---|---|
| Усі BE unit | 89 suites; 1465 passed, 1 todo; snapshot passed |
| Усі FE unit | 84 files; 829 passed |
| Усі BE integration | 23 suites; 282 passed на тестовій MongoDB |
| Нова адмінка, браузер + справжній Nest API/Mongo | 6 passed: дерево/визначення, create/replay після втраченої відповіді, опис/ціна/вага, Products/deep link, add/archive/restore, readiness |
| Вітрина, справжній Next + локальний mock API | 12 passed: checkout, помилки, повторна оплата, конверсії; це не перевірка банку LiqPay |
| Збірки | BE і FE production build passed; FE з чинним локальним public API9001 |
| Локальний стенд 9000 | Справжній login/CORS/cookies, новий API9002, додавання/архівація/відновлення 63 A, перезавантаження deep link, checklist, desktop/mobile |
| Контракт/стиль | OpenAPI export, TypeScript через build, цільовий ESLint/Prettier, git diff --check |

У першому повному інтеграційному прогоні один тест повторного створення після
rollback несподівано отримав 401. Причину не встановлено; додано діагностику тіла
відповіді. Окремий набір і повторний повний прогін пройшли. Це зафіксований
неповторений збій, а не доведене виправлення його першопричини.

У браузерних тестах виявлено застарілі очікування auth/logout, тексту помилки
залишку, посилання зміни способу оплати та англомовної помилки повторної оплати.
Оновлено їх відповідно до чинних контрактів, доповнено lookup fixture полями
TD-0009 (зокрема PENDING із живою сесією має cooldown, а не null). Продуктову
логіку оплати для проходження цих тестів не змінювали. Mock API перенесено
з 9001 на 19001; reuseExistingServer вимкнено, Next cache відокремлено, щоб тест
не підключався до справжнього локального API розробника.

Збірка FE із v2 API9002 очікувано отримала 503 під час prerender головної:
публічні адаптери v2 ще не готові, read barrier працює. Збірка із сумісним
локальним public API9001 пройшла. Це не доказ готовності v2-вітрини.
Реальне завантаження файлу до AWS S3 не виконувалося; перевірки збереження URL
і клієнтських відмов/повторів не замінюють release-перевірку storage.

### Що бачить власник на localhost

`http://localhost:9000/admin/products` → «Автомати вводу резерву — приклад» →
«Локальний АВР — створено через форму». Додано демонстраційний FL-000305 (63 A,
2500 грн, залишок 3); після циклу архівації/відновлення він знову draft.
Ці зміни лише в `fillando_catalog_local_v2`; початкова база та production не змінені.
API9002 перезапущено з актуальним dist; frontend9000 підхоплює код через dev server.

Логи поточного прогону: `/tmp/catalog-full-be-unit.log`,
`/tmp/catalog-full-fe-unit.log`, `/tmp/catalog-full-be-integration.log`,
`/tmp/catalog-full-storefront-browser.log`, `/tmp/fillando-final-catalog-browser.log`,
`/tmp/fillando-final-be-build.log`, `/tmp/fillando-final-fe-build.log`.
Скріншоти локального UI: `/tmp/fillando-local-products-readiness.png`,
`/tmp/fillando-local-variants-mobile.png`. Тимчасові файли не є постійним сховищем доказів;
підсумок та відтворювані тести збережені в репозиторіях.

Наступний великий етап: узгоджені публічні v2 readers для каталогу, товарної сторінки,
фільтрів і feed, після них контрольована публікація, sitemap/redirects та повне
приймання міграції. Сам лише checklist не знімає ці залежності.

## 2026-10-27 — публічні категорії та типізований каталог

Production не перемикали. Реалізовано серверний блок B01/B05/B06, а не всю нову
вітрину. B05 змінено із запланованого на частково виконаний. Актуальне зведення:
35 пунктів — 4 виконано в зазначених межах, 1 у роботі, 19 частково, 11 заплановано.

### Поведінка до та після

- Раніше сам факт нової/вкладеної категорії блокував усі старі public category
  reads. Тепер GET списку, slug та ID працюють через v1/v2 adapter, зберігають
  сумісні legacy поля й повертають ancestors, typed definitions, SEO та revision.
  Draft/archived предок приховує дочірню active категорію; групи читаються за
  slug/ID, список залишається масивом товарних категорій.
- Окремий `GET /products/catalog/v2` читає категорію, групу з усіма видимими
  товарними нащадками або весь каталог. У відповіді один SKU — один рядок.
  Пагінація й сортування стабільні за ID, supplier/Prom поля не публікуються.
- Для АВР фільтр струму 30–40 A разом із `automatic=false` знаходить саме SKU,
  який відповідає обом умовам. Не можна взяти струм одного sibling і прапорець
  іншого. Текст «black, white» залишається одним значенням, false — boolean.
- Лічильник виміру враховує всі інші фільтри, виключаючи власний. Повторений
  атрибут не подвоює count SKU. Price використовує чинну акційну ціну.
  Є спільні price/stock/category/brand dimensions; vendor не перетворюється на brand.
- Catalog mutation/revision/epoch перевіряються до й після читання. Результат,
  отриманий під час зміни, відкидається із 503/no-store/Retry-After. Старі writers,
  product/feed/checkout readers не отримали загального обходу захисту.

### Перевірки поточного блоку

| Перевірка | Результат |
|---|---|
| Цільові integration: category public, catalog public, legacy interlock | 58 passed; справжня MongoDB і anonymous HTTP |
| Усі backend unit | 89 suites, 1465 passed, 1 todo, snapshot passed |
| Усі backend integration | 25 suites, 314 passed |
| Browser нової адмінки | 6 passed після змін API |
| Backend build / OpenAPI export | passed |
| Стиль | цільовий ESLint; виправлено типізацію тестового callback і форматування |
| Read-only на API9002 після перезапуску | HTTP 200; revision 9, total 301, 20 SKU на першій сторінці |

Тестові випадки включають приховані гілки, draft/archived SKU, невідповідність
category_id товару/SKU, помилки query/повторених scalar parameters, числові межі,
невідомі keys/operators, дублі значень, self-exclusion, промо, ID tie-breaker,
відсутність службових полів навіть усередині attributes, maintenance й revision drift.
Нова логіка не активувала жодної чернетки та не змінювала товарних даних.

### Межі та наступні залежності

Це ще не готовий покупецький сценарій: UI категорій/фільтрів, public product detail,
feed/checkout adapters, публікація та інвалідація майбутніх кешів залишаються
попереду. Local attribute filters дозволені лише в конкретній v2 товарній категорії;
для group/global/v1 вони відхиляються. Непорожні color_families явно відхиляються
до підключення color dictionary adapter. Brand facets читають наявні active brands;
brand CRUD та міграція manufacturer окремі. Не виконано навантажувального приймання
великого каталогу; Mongo aggregation має maxTimeMS 15000 та стандартні обмеження facet.
Повний інтерфейс старого магазину на API9002 через ці зміни ще не ввімкнувся.

Контракт доповнено в TD-0013 і OpenAPI. Логи:
`/tmp/public-read-all-unit.log`, `/tmp/public-read-all-integration.log`,
`/tmp/public-read-integration.log`, `/tmp/public-read-admin-browser.log`,
`/tmp/public-read-build.log`, `/tmp/public-catalog-openapi.log`.
Тимчасові логи можуть бути очищені системою; сценарії та підсумок збережено в репозиторії.

## 2026-10-27 — покупецька вітрина нового каталогу, публікація, checkout і фід

Production не перемикали; усе нижче працює лише в коді гілок і на локальному стенді
`9000 → 9002 → fillando_catalog_local_v2`. Зведення 35 пунктів: 4 виконано в межах,
1 у роботі, 21 частково (F06, F07 перейшли із запланованих), 9 заплановано.

### Що змінилося для покупця (на стенді)

- `/catalog` показує весь каталог; групи й v2 категорії мають власні сторінки довільної
  глибини з плитками непорожніх підкатегорій. Філамент (v1) лишається на старій сторінці
  з кольорами й лендінгами до міграції — `/products/catalog` для нього тепер дозволений
  адаптером навіть за наявності v2-гілок.
- Фільтри будуються з налаштувань категорії: АВР показує діапазон «Номінальний струм, А»,
  ціну й наявність; «Автоматичний режим» прихований, бо має одне значення. Діапазон 30–40 А
  лишає один SKU (32 А); «Назад» повертає три. Стан повністю в URL, кома — частина значення.
- Навігація будується з публічного дерева без порожніх гілок; у мобільному меню група
  розгортається до вкладених категорій. Крихти товару: Головна → Електротовари → АВР → SKU.
- Сторінка товару v2: характеристики з визначень (мітки enum, Так/Ні, одиниці окремо),
  значення осі в H1/title, бренд лише з brand-сутності, без вигаданого кольору. Знайдено й
  виправлено: `<title>` v2 підставляв назву категорії як «допис» — тепер лише налаштований допис.

### Публікація, checkout, фід

- Нова журнальна операція `POST /categories/:id/admin/publication` і панель «Публікація» в
  адмінці. На стенді через справжній API: демо-товар отримав фото-заглушку
  (`localhost:9000/Fillando-logo.png`) і вагу 2500 г через редактор деталей; опубліковано
  групу (revision 11) і категорію (revision 12): відкрито 3 SKU FL-000303…305, «Демонстраційний
  АВР» лишився чернеткою (немає опису й фото) і названий у відповіді.
- Checkout: SKU прихованої гілки отримує `VARIANT_UNAVAILABLE` до номера/купона/запису.
  Після дозволу власника (листи лише на SERVICE_EMAIL, без спаму) виконано один повний
  гостьовий сценарій у браузері: товар v2 63 А → кошик → `/checkout` (самовивіз, готівка) →
  `POST /orders` 201, FO-0000173, 2500 грн, рядок FL-000305 → сторінка «Дякуємо за замовлення».
  Помилок API немає. Власник підтвердив отримання двох листів на SERVICE_EMAIL: підтвердження
  покупцю й службове «Нове замовлення»; назва SKU з віссю «— 63 А», артикул, ціна й самовивіз
  правильні. Фото в листах не відкрилося, бо на стенді це заглушка з `localhost:9000`, недосяжна
  для поштового клієнта — не дефект шаблону. Замовлення лишилося в локальній базі стенда.
- Фід: лише SKU публічних категорій; v2 без кольору, бренд лише з активної brand-сутності —
  без неї SKU виключається як `missing_brand` (на стенді в АВР бренду ще немає).

### Справжні HTTP-статуси

Production-збірка FE на тимчасовому порту 9100 показала, що `[category]` і `products/[slug]`
віддавали 200 замість 404/308 навіть Googlebot — через `loading.tsx` (стрімінг). Це стосується
і чинного production: невідомі розділи й чернетки були soft-404 з noindex. Обидва `loading.tsx`
прибрано; повторна production-збірка: невідомий розділ/лендінг/товар, draft SKU, невалідні
й порожні фільтри — 404 для користувача й бота; `?page=1` — 308; `/filament`, фільтри
філаменту, товари — 200. Ціна: без skeleton під час переходу на розділ/товар.

### Перевірки

| Перевірка | Результат |
|---|---|
| BE unit | 89 suites, 1466 passed, 1 todo |
| BE integration | 27 suites, 329 passed (нові: public-storefront 7, category-publication 3, checkout +3, exports +2, sitemap v2) |
| FE unit | 86 files, 845 passed (нові: typed-filters, catalog-tree) |
| Збірки | BE build, FE production build проти API9002 (раніше падала на 503 головної) |
| OpenAPI | `yarn spec:export` — нові `/categories/:id/admin/publication`, адаптовані read DTO |
| Браузер, стенд (Playwright, справжній API9002) | каталог, група, категорія, фільтр → URL → назад, товар, мобільне меню; помилок консолі немає |
| Браузер, репетиція адмінки (справжній Nest + Mongo 27018) | 7 passed; новий сценарій: дані готовності → «Опублікувати» група й категорія → `/example-avr` діапазон у URL → перезавантаження → товар із крихтами → плитка групи → `?bogus=1` = 404 |
| Браузер, вітрина (mock API) | 12 passed (checkout, помилки, оплата, конверсії) |
| Production-статуси (збірка FE на тимчасовому 9100) | невідомий розділ/лендінг/товар, draft SKU, невалідні/порожні фільтри — 404; `?page=1` — 308; користувач і бот однаково |

### Межі

Не виконано: color dictionary adapter і міграція філаменту на v2 (B04/B08), active edits
опублікованих товарів, typed лендінги, адаптери прайс-листа/PDF/partner API, категорійні
export rules фіду, redirects/slug-change (B07), навантажувальне приймання, production.

## 2026-10-27 — кольори, typed-лендінги й міграція філаменту на стенді

Production не змінювали. На стенді (`fillando_catalog_local_v2`) уся вітрина тепер на новій
структурі: філамент — v2-категорія. Зведення 35 пунктів не змінилося (4 / 1 / 21 / 9),
але змістовно просунулися D02, B04, B06, B08, B11, F07, F10.

### Mapping філаменту (підтверджено власником 27.10.2026, з одною зміною)

| Legacy | Після міграції |
|---|---|
| «Виробник» (`vyrobnyk`) | за рішенням власника лишається звичайною характеристикою й фільтром, прихована в таблиці (показується як бейдж); бренд на сторінці, в розмітці й фіді береться з неї, як у legacy. Окрема brand-сутність не використовується |
| «Вага» (`vaha`), «Діаметр» (`diametr`) | числа з одиницями кг / мм, ті самі ключі |
| `polymer`, `finish`, `reinforcement`, `series`, `spool_included` | ті самі ключі й тексти (рефіл лишився «Ні (рефіл)») |
| вісь `variant_type: kolir` + `color_id` SKU | вісь `color` (`semantic: color`), значення = id словника; фільтр за родиною |
| `kolir` на рівні товару | у 36 товарів з віссю — застаріла копія одного кольору, не переноситься; у 8 без осі — справжній опис («Матова веселка»), зберігається |
| `material` | текстова характеристика, прихована presentation, як і раніше |
| 14 лендінгів (`filters`) | `filters_v2` + `contract_version: 2`, legacy `filters` збережено |

### Хід репетиції

1. Baseline legacy API: 301 SKU, фасети 8 вимірів, 15 родин кольорів, лічильники 14 лендінгів.
2. Dry-run: 360 цілей (1 категорія, 44 товари, 301 SKU, 14 лендінгів), 3 бренди до створення.
3. Apply з зупиненим API: revision 13, fingerprint legacy-полів не змінився.
4. Перевірка знайшла втрату даних у моєму mapping: «Колір» відкидався й у 5 товарів без осі.
   `revert` повернув чистий legacy-стан (жодного v2-поля), mapping виправлено, apply повторно:
   revision 15.
5. Після міграції збігаються з baseline: total, кожен фасет, бренди, 15 родин кольорів,
   14 лендінгів (і за legacy-, і за typed-фільтрами). Фід: 301 позиція філаменту, правило
   заголовка як раніше («Філамент PETG (CoPET) 3 кг Kingroon 1.75 мм — Чорний»), без попереджень;
   3 SKU АВР виключені як `missing_brand`. Прайс-лист: 304 рядки.

### Знайдено й виправлено під час репетиції

- Подвійні одиниці в заголовку фіду («1.75 мм мм») — адаптер тепер передає значення без одиниці.
- Після apply вітрина віддавала 500: Next тримав закешовану v1-категорію. **Для релізу:** після
  міграції обов’язковий purge кешів categories/products/landings; CLI цього не робить.
- Старі адреси фільтрів давали б 404 — тепер один 308 на новий формат або одразу на лендінг
  (`/filament?polymer=PLA` → `/filament/pla`), UTM зберігаються.

### Перевірки

| Перевірка | Результат |
|---|---|
| BE unit | 1475 passed, 1 todo (нові: планувальник міграції 9) |
| BE integration | 333 passed (вітрина +4: кольоровий фільтр/фасет, кольорова вісь на сторінці, typed-лендінг, прайс-лист) |
| FE unit | 849 passed (старий формат URL, колір, закріплені фільтри, точний лендінг) |
| Браузер | репетиція адмінки 7 passed, вітрина 12 passed; стенд: філамент, фільтр «Чорний», лендінг PLA, рефіл без помилок консолі |
| Production-збірка FE, статуси | `/filament` 200 self-canonical, `?page=2` 200, `?page=1` 308, `?polymer=PLA` 308 → `/filament/pla`, `?color=black` 200 noindex, `?color=plaid` 404, `/filament/pla?f.polymer=PETG` 404, `/filament/nope` 404 |
| BE build, OpenAPI, цільовий ESLint | passed |

### Межі

Опубліковані товари (тепер і весь філамент на стенді) не редагуються ні новим редактором
(active edits ще немає), ні legacy-адмінкою (закрита після bootstrap) — це наступний
обов’язковий блок. PDF, partner API і Prom sync для v2 не адаптовані; редагування pins
лендінгів в адмінці немає; production-репетиція R01 на свіжому дампі не проводилась.

**Уточнення після рішення власника (27.10.2026).** «Виробник» не виділяється в brand-сутність:
міграцію `filament-v2-20261027b` відкочено `revert`, застосовано `filament-v2-20261027c`
(revision 17) з `brand_key: null` і `vyrobnyk` у прихованих характеристиках. Бренд для сторінки,
JSON-LD і фіду береться з характеристики «Виробник», якщо товар не прив’язаний до brand-сутності.
Повторна перевірка: 301 SKU, усі 8 фільтрів (разом із «Виробник») і 15 родин кольорів збігаються
з baseline, сторінка показує «Kingroon», фід — 301 позиція філаменту без попереджень. Три
brand-документи, створені першою спробою, лишилися в локальній базі невикористаними.
Підтверджено також: числа ваги/діаметра, колір зі словника, обробка «Колір» на рівні товару,
архівація варіантів. Ціна опублікованого товару лишається за Prom-синком; назви, описи, фото,
характеристики редагуються; новий варіант — як зараз у старій адмінці (статус у формі,
типово «Активний»).
Власник також підтвердив прибрання `loading.tsx` у розділах і товарах (справжні 404/308 замість
soft-404; ціна — без skeleton під час переходу).

## 2026-10-27 — редагування опублікованих товарів

Production не змінювали. Правила від власника: ціна — як зараз (Prom), назви/описи/фото/
характеристики редагуються, новий варіант — як у старій адмінці (статус у формі, типово
«Активний»), архівація дозволена.

- Typed-редактор і API приймають опубліковану категорію; SKU мають статус Активний /
  Чернетка / Архівний (селектор як у старій адмінці); новий варіант і новий товар типово активні.
- Кольорова вісь редагується вибором зі словника: новий чи перефарбований SKU отримує
  узгоджені `color_id`, `color_family`, `v_value` і назву «… — Червоний (Red)», як legacy.
  Невідомий колір — 400. Обов’язкові характеристики опублікованого товару перевіряються.
- Після запису очищається кеш вітрини (products) і подається сигнал фіду.
- Знайдено й виправлено під час перевірки на стенді: словник кольорів для адмінки був за
  старим бар’єром («Каталог тимчасово оновлюється»); після збереження редактор скидав вибраний
  товар — тепер лишається на ньому.
- Перевірка всіх 301 збережених назв SKU філаменту: усі збігаються з правилом формування,
  тож перерахунок назв під час збереження нічого не перейменовує.
- На стенді через UI: SKU FL-000019 переведено в «Чернетку» і назад в
  «Активний»; усі 301 SKU філаменту знову активні. Одна операція завершилась як `aborted`:
  захист ревізії відхилив клік під час перемонтування редактора, дані не змінились.

Тести: нові інтеграційні 6 (`typed-product-published.int-spec.ts`), оновлено 2 старі тести,
що закріплювали правило «лише чернетки»; FE-тест селектора статусу. Межі: перенесення
товару між категоріями, редагування pins лендінгів, PDF/partner API/Prom sync для v2.

Перевірки блоку: BE unit 1475 + 1 todo (один відомий нестабільний тайм-аут throttle-спеку
пройшов при окремому повторі), BE integration 340/340 (повторний прогін без паралельних
браузерних тестів; у першому `category-draft-placement` впав на тайм-аутах через спільну
тестову Mongo з репетицією адмінки), FE unit 850, FE build, браузер 12 + 7, OpenAPI export,
цільовий ESLint без помилок.

## 2026-10-27 — R01: репетиція міграції й відкату на свіжому дампі

Власник надав свіжий дамп production (`~/Desktop/fillando_prod_db_backup.archive`, 27.10 19:05;
попередній перейменовано на `_fillando_prod_db_backup.archive`). Production, `fillando-prod`,
API9001 і стенд не змінювалися.

**Відновлення.** Той самий шлях, що й 23.10: `mongorestore` з `--nsFrom 'fillando-prod.*'`, у
порожні нові бази, без `--drop`: еталон `fillando_rehearsal_20261027` (лише читання) і робоча
копія `fillando_rehearsal_work_20261027`. По 67 002 документи, 0 помилок. Дані містять
реальних користувачів і замовлення — лише в локальному MongoDB 27019.

**Аудит.** Каталог не змінився з 23.10: 1 категорія, 44 товари, 301 SKU (усі активні), 14
лендінгів, 122 кольори, ті самі ID і ціни; замовлень 193 (було 172). Знахідки ті самі: 85
атрибутів лише на товарах (`material` 44, `kolir` 41) — mapping їх покриває; 316 кандидатів адрес.

**Хід репетиції (тимчасовий API на 9003, лише робоча копія, без cron):**

| Крок | Результат |
|---|---|
| Новий BE на старих даних (порядок релізу: BE раніше за міграцію) | legacy-каталог 200, 14 лендінгів, sitemap 301/1/14, прайс-лист 301, пошук «PLA» 235, усі 301 сторінки товару, фід 301 |
| Dry-run → apply (writers stopped) | 360 цілей, legacy-поля незмінні; **2,1 с** разом зі стартом скрипта |
| Після міграції | legacy-каталог чесно 409; v2: total, усі 8 фасетів, 15 родин кольорів, 14 лендінгів, sitemap, прайс-лист, пошук — ідентичні; фід 301 позиція, відрізняється лише час генерації; на всіх 301 сторінці той самий виробник і ті самі значення характеристик; «Матеріал»/«Виробник» приховані налаштуванням категорії, рядок «Колір» — зі словника (legacy-сторінка так само підміняла застарілу копію кольором варіанта) |
| Revert | 3,1 с; знімок вітрини ідентичний початковому; categories/products/product_variants/landings **байт-у-байт** збігаються з еталонним дампом |

**Висновки для релізу.** Вікно обслуговування визначають зупинка writers (API, cron, Prom
sync), рестарт і purge кешів вітрини, а не сама міграція. Відкат перевірено на реальних даних.
*Уточнення 14.11.2026 (аудит, Plan-0010 P29):* «не сама міграція» — правда лише поруч із базою, як у
цій репетиції. Журнал пише по одній цілі кількома послідовними запитами, і з затримкою мережі 40 мс ті
самі 360 цілей тримали каталог закритим 115 с (72 с після читання пачками, 15.11) —
[рунбук](../runbooks/catalog-v2-release.md), §0 Г і §7.
Ще не зроблено в межах R01: E2E на production-збірці FE проти мігрованої копії, навантажувальні
заміри, репетиція на production-подібному оточенні (Railway) і перевірка порядку деплою.

## 2026-10-28 — B11: останні споживачі; R01 на робочій копії дампу 27.10

Production, `fillando-prod`, API9001 і еталон `fillando_rehearsal_20261027` не змінювалися. Уся
робота — у локальних гілках, на стенді `9000 → 9002 → fillando_catalog_local_v2` і на робочій
копії `fillando_rehearsal_work_20261027` (тимчасові API 9003 — новий BE, 9004 — старий BE з
`origin/production`, обидва без cron; FE production-збірка на 9100). Зведення 35 пунктів,
перераховане з таблиць плану: 5 виконано в межах (B11 — локально), 2 у роботі (D02, D08),
21 частково, 7 заплановано. Попереднє зведення 27.10 («4 / 1 / 21 / 9») розходилося з таблицею
на один пункт: частково виконаних тоді було 22, запланованих 8.

### B11 — що змінено

| Споживач | Було | Стало |
|---|---|---|
| Partner API (categories, skus, lookup, bulk/single availability) | 503 `CATALOG_READ_UPGRADE_REQUIRED` за будь-яких v2-даних | adapted read: лише видимі товарні категорії (плоско, `parent_id: null`), SKU/наявність лише з них; v2-картка у v1-формі (`legacyShapeOf`); бар’єр maintenance/revision лишився |
| PDF прайс-листа (admin) | 503 за v2-даних; після bootstrap кнопка зникала разом зі старою сторінкою «Продукти» | adapted read: видимі категорії, прихована в запиті — ігнорується; бренд і варіант із typed-значень; кнопка «Прайс-лист» у «Товари каталогу» нової адмінки |
| Публічний прайс-лист | читав видимі категорії, але колонки — з legacy-копії (застарівали після правок у новому редакторі) | колонки v2 з `attributes_v2` + осі; пошук і за typed-значеннями |
| Prom sync | писав незалежно від фази каталогу; новий редактор не мав `prom_id` | вузький patch як і раніше; запис відкладається (`deferred`), поки `catalog_control.phase ≠ idle`; «ID на Промі» й «Артикул вендора» в новому редакторі (деталі, новий варіант, новий товар) |

v1-форма v2-товару: характеристики в збереженому порядку, підпис із визначення, значення
текстом («1», «1.75», «Так», мітка enum), `visible_in_specs: false` не експортується, бренд-сутність
першою; вісь кольору — ключ `kolir` і `name_en` («Black»), інша вісь — свій ключ і «63 А».

### B11 — перевірки

| Перевірка | Результат |
|---|---|
| Новий інтеграційний `catalog-legacy-exports.int-spec.ts` (змішане дерево v1/v2/група/прихована гілка, справжні Mongo, сервіси, інтерсептор) | 10 passed: partner HTTP, PDF HTTP, прайс-лист, Prom sync (вузький patch; `deferred` під `writing`) |
| `typed-legacy-shape.spec.ts`, `typed-product-published.int-spec.ts` (+1: `prom_id`/артикул) | 3 + 7 passed |
| Стенд, справжній API9002 | partner: 2 категорії (301 + 3), 304 SKU, lookup v2 у v1-формі, чернетка — `not_found`/404; PDF 201, 304 рядки («Чорний (Black)», «63 А»); прайс-лист 200 |
| Стенд, справжній Prom sync (лише GET до Prom) | 301/301 оновлено, змін цін 0, `deferred` 0, помилок 0; змінились лише `stock` (80 SKU), позначки часу, `prom_discount_seen_at`; товари не змінені |
| Стенд, браузер нової адмінки | кнопка «Прайс-лист», діалог з «Філамент» і «АВР»; поля «ID на Промі» = `2647333298`, «Артикул вендора» = `NPETG087-ZX`; помилок консолі 0 |

### R01 — хід на робочій копії

| Крок | Результат |
|---|---|
| Новий і старий BE на legacy-даних | partner — ідентично; прайс-лист — +`variant_label` (24.10); PDF — колонка «Варіант» з українськими назвами (24.10); фід — лише опис каналу (24.10) |
| dry-run → apply (`r01-filament-20261028`) | 360 цілей, `dropped_product_attributes: {kolir: 36}`, 2,66 с разом зі стартом, fingerprint legacy незмінний |
| Після міграції проти до неї (новий BE) | price sheet 301 рядок, текст PDF, фід (крім дати акції = часу генерації), partner categories/skus/availability — ідентичні; lookup: 8 карток без осі ідентичні, 293 з віссю відрізняються лише відсутнім рядком «Колір» (у 267 він називав колір іншого варіанта) |
| Prom sync, детермінований stub, scratch-копії legacy і мігрована | 301/301 однакові price/stock/`prom_*`; лише вузькі поля; під `writing` усі 301 відкладено без запису; scratch-копії видалено |
| Фасети, 6 комбінацій (старий BE legacy vs новий BE v2) | спершу v2 губив нульові значення; виправлено → тотали й усі фасети ідентичні |
| Production-збірка FE 9100 → API 9003 | статуси за SEO-матрицею (див. нижче); sitemap 325: 301 товар, 14 лендінгів, `/filament`, `/catalog` (виправлено: раніше `/catalog` не було), статичні |
| Сценарій покупця (Playwright) | головна → каталог → філамент → «Чорний» → PLA (`?f.polymer=PLA&color=black`) → лендінг `/filament/petg` → товар → кошик → checkout; `POST /orders` перехоплено (тіло: `variant_id`, самовивіз, готівка), 5xx немає |
| revert (`r01-filament-20261028b`) | 2,42 с; 19 колекцій / 67 002 документи побайтово = еталону, індекси = еталону; лишились службові `catalog_control`, `catalog_mutation_plans`, `catalog_operations`, `catalog_stage_runs`; тимчасовий партнерський токен видалено |

SEO-статуси production-збірки (бот і користувач однаково): `/`, `/catalog`, `/filament`,
`/filament/pla`, товар — 200; `?page=1` → 308 `/filament`; `?polymer=PLA` і `?f.polymer=PLA` → 308
`/filament/pla`; `?color_family=black` → 308 `?color=black`; `?color=black` — 200 `noindex, follow`
без canonical; `?color=plaid`, `?bogus=1`, `?page=99`, `/filament/nope`, невідомий розділ і товар —
404. Canonical self на лістингах, лендінгах, `?page=2`, товарі; JSON-LD: ItemList+BreadcrumbList
на лістингах, FAQPage на лендінгах, Product (бренд Kingroon з характеристики, SKU, ціна, InStock,
колір) на товарі.

### R01 — заміри (локальна машина, 16 паралельних, 480 запитів на сценарій, `limit=24`)

| Сценарій | Старий BE, legacy-дані | Новий BE, legacy-дані | Новий BE, v2 до оптимізації | Новий BE, v2 після |
|---|---|---|---|---|
| Каталог філаменту | 20,4–21,1 rps, p50 746–771 мс | 21,2–21,6 rps | 13,8–14,7 rps, p50 ~1,1 с | 19,9–20,4 rps, p50 ~800 мс |
| Фільтри (полімер + колір) | 32,4–33 rps, p50 ~490 мс | 32,9–33,1 rps | 13,9–14,4 rps | 21,4–21,9 rps, p50 ~740 мс |
| Сторінка товару | 800–917 rps, p50 17–20 мс | 571–587 rps, p50 ~27 мс | 400–546 rps | 489–536 rps, p50 ~30 мс |
| Один запит (N=1): каталог / фільтри / товар | 48,5 / 34 / 4,9 мс | 52,5 / 39 / 7,3 мс | 78 / 75 / 7 мс | 53 / 58 / 8,3 мс |

Оптимізація `/catalog/v2`: `$lookup` товарів тягне лише `category_id/attributes_v2/variant_axis/
brand_id` (раніше — цілі документи з описами на кожен SKU), колір позиції — лише для сторінки,
фасет кольору — один lookup на колір, а не на SKU. Фільтри v2 лишаються ~1,5× повільнішими за
legacy під навантаженням; SSR FE кешує читання, клієнтські кліки обмежені 120/хв на IP. FE
production-збірка, 16 паралельних: лістинг p50 204 мс, фільтри 157 мс, товар 18 мс (старого FE
для порівняння не збирали). Великого каталогу не перевіряли.

### Знахідки й межі

- **Замовлення на мігрованих даних не створювалось.** BE не стартує з порожнім `RESEND_API_KEY`
  (`ZodError … Too small`), а зі справжнім надсилає листи; за інструкцією власника — зупинка й
  питання. Потрібне рішення: 1–2 замовлення на `SERVICE_EMAIL` або опційний ключ для локальних
  запусків.
- **Порожній `<main>` ~300 мс** під час клієнтського переходу між лістингами/товарами
  production-збірки — наслідок прибраного `loading.tsx` (погоджено заради 404/308). Варіант:
  індикатор очікування без Suspense-межі (`useLinkStatus` / смуга прогресу).
- **Для релізу потрібні інструменти**, яких немає: production-режим CLI міграції (зараз лише
  `127.0.0.1:27019` і локальні бази) і команда ввімкнення `admin_draft_writes_enabled`; без неї
  після міграції товари не редагуються ніде. Деталі — [чернетка D08](../runbooks/catalog-v2-release.md).
- **Порядок релізу:** старий FE + мігровані дані → 409 на legacy-лістингу філаменту; новий FE
  працює з обома контрактами — у D08 рекомендовано FE до міграції.

Перевірки коду після всіх змін: BE unit 91 suites, 1478 passed + 1 todo; BE integration 351
(повторний повний прогін після виправлення двох захисних тестів публічної проєкції прайс-листа:
29 suites, 351 passed; у повторному unit-прогоні два відомі нестабільні RBAC/throttle-спеки
(`payment-providers`, `product.controller.throttle`) впали й пройшли окремо, 30/30);
FE unit 86 files, 852 passed; FE typecheck; BE/FE production builds; `yarn spec:export`.
Скрипти репетиції — `scripts/catalog-rehearsal/` мета-репо.

## 2026-10-28 — вітрина після звіту: шапка «Каталог», картка фільтрів, порядок, слайдер

Production не змінювали; лише FE на стенді (`9000 → 9002`). Зміни на запит власника після звіту
B11/R01, деталі — `docs/general-catalog.md` FE, розділ «Header «Каталог» panel».

| Що | Було | Стало |
|---|---|---|
| Шапка (desktop) | по одному посиланню на кожну кореневу категорію; з групою й категорією рядок переповнювався й стискав пошук | один пункт «Каталог» (`CatalogMenu.tsx`): підпис веде на `/catalog`, шеврон (`aria-expanded`, для сенсорних екранів) і hover/фокус відкривають панель на всю ширину — кожен корінь колонкою з вкладеними нащадками й «Увесь каталог →»; закривається через 150 мс після виходу курсора, Escape, навігацією. Посилання панелі завжди в розмітці (лише приховані), тож серверний HTML кожної сторінки містить усе дерево. Мобільне меню й футер не змінені |
| Бокова панель typed-фільтрів | лежала на точковому фоні сторінки, поруч білі картки товарів | та сама картка, що й legacy `FilterSidebar` (`bg-card`, рамка, тінь, заголовок «Фільтри»); мобільна шухляда — своя поверхня |
| Порядок фільтрів | категорійні виміри перед ціною | «Ціна» і «Наявність» першими для будь-якої області (категорія, група, `/catalog`) — бекенд рахує їх без налаштувань категорії; далі «Категорія» (групи), «Колір» (вісь), власні виміри в налаштованому порядку, «Бренд». Ціна — коли в області ≥ 2 різні ціни, наявність — коли щось є в наявності (або фільтр уже вибрано) |
| Діапазонні фільтри | лише поля «від / до» | двоповзунковий слайдер над полями (ціна й кожен `filter_type: range`), як legacy-фільтр ціни: перетягування оновлює поля, відпускання застосовує фільтр (одна зміна URL на відпускання); повзунок на краю — без межі; крок 1 для цілих меж, 0,01 інакше; `ui/slider` отримав `thumbLabels` («Ціна: від» / «Ціна: до») для доступних назв |

Перевірки: `CatalogMenu.test.tsx` і `TypedFilters.test.tsx` — 7 passed (порядок фільтрів, панель,
посилання в розмітці закритої панелі). Повна регресія — у підсумку наступного блоку.

## 2026-10-28 — передумови першого релізу (D08 §2): production-режим CLI, перемикач адмінки, замовлення на мігрованій копії

Production, `fillando-prod` на 27019, API9001 і еталон `fillando_rehearsal_20261027` не змінювали.
Рішення власника цього дня (не переглядати): `RESEND_API_KEY` лишається обов’язковим, тестові
замовлення — 1–2 зі справжнім ключем лише на `SERVICE_EMAIL`; реліз за варіантом А (новий FE до
зупинки writers і міграції); у partner API рядок «Колір» — з кольору самого SKU; порожній `<main>`
під час переходів — смуга прогресу.

### Що зроблено

| Що | Було | Стало |
|---|---|---|
| CLI міграції | лише `127.0.0.1:27019` і локальні бази | окремий `--production` (`scripts/catalog-cli-target.cjs`): URI лише з `CATALOG_MIGRATION_URI` процесу (у `.env*` бекенду — відмова, локальний 27019 — відмова, у логах лише хости), база лише `fillando-prod`, `--confirm=<команда>:fillando-prod:<op>` на кожен запис, `apply` — з маніфестом перевіреного backup (SHA-256 архіву, restore-перевірка ≤ 24 год, знімок колекцій каталогу побайтово = живому, інакше `BACKUP_DOES_NOT_MATCH_CATALOG`), `revert/resume/rollback` — з маніфестом того самого архіву. Команда `backup-manifest` читає відновлену локальну копію. Локальний режим не послаблено (і відмовляє, якщо в середовищі є `CATALOG_MIGRATION_URI`) |
| Записи нової адмінки | прапорець ставив лише `local-catalog-workspace.cjs` | `scripts/catalog-admin-writes.cjs status/enable/disable`: ідемпотентно, стан до/після, `enable` лише з `catalog_control` і `phase: idle` |
| Відмова плану в CLI | `apply`/`revert`, відхилений журналом до запису, лишав gate у `phase: writing` (каталог закритий до відновлення, якому нічого відновлювати) | gate звільняється (`abortBeforeWrites`, як у HTTP-writers), звіт перелічує змінені цілі `collection:id:field`; `rollback` звільняє операцію, захоплену без плану; повторний revert отримує id `<op>-revert-2`, завершений — `REVERT_ALREADY_COMPLETED` |
| Збереження в typed-редакторі | характеристики пересортовувались у порядок визначень: незмінений мігрований товар відрізнявся від образу міграції (revert відмовляв), рядки partner-картки переставлялись | `keepStoredOrder`: збережений порядок, нові ключі в кінці; збереження без змін лишає документ побайтово тим самим |
| Partner API «Колір» | після міграції рядок зникав у 293 картках | рядок з кольору самого SKU (`name_uk`) на місці legacy-рядка (`withAxisColourRow`); PDF і прайс-лист без змін |
| «Товари каталогу» (нова адмінка) | для опублікованої v2-категорії писало «Ця категорія ще не підготовлена до нового редактора товарів» (умова для структури, а не товарів), хоча редактор працював | повідомлення лише для v1-категорії; архівна — «Категорію архівовано — її товари не редагуються» |
| Перехід між сторінками | порожній `<main>` до приходу RSC (прибраний `loading.tsx`) | `NavigationProgress`: тонка смуга вгорі, лише якщо перехід довший за 120 мс; старт — клік на внутрішнє посилання або перед `router.push` фільтрів/пошуку; кінець — зміна шляху/параметрів (не довше 10 с); у Suspense загорнута лише сама смуга, не вміст сторінки |

### Репетиція production-режиму на копії (тимчасовий MongoDB 27020, tmpfs)

Копію дампу 27.10 відновлено в окремий Docker-MongoDB як `fillando-prod` — щоб пройти саме
production-гілку, не торкаючись локальної `fillando-prod` на 27019.

| Крок (команди D08) | Результат |
|---|---|
| `mongodump` → restore у `fillando_release_check_20261028` → `backup-manifest` | 67 002 документи; каталог 1 / 44 / 301 / 14 / 122 кольори / 0 брендів; SHA-256 архіву в маніфесті |
| dry-run `--production` | 360 цілей, `dropped_product_attributes: {kolir: 36}`, брендів 0 |
| apply без `--confirm` / з ним | відмова до підключення / `completed`, `legacy_fingerprint_unchanged`, **4,9 с** разом з перевіркою архіву й знімка |
| `catalog-admin-writes enable` (двічі) | `changed` → `unchanged`; `new_admin_can_write: true` |
| Нова адмінка (production-збірка FE 9100 → API 9003, тимчасовий ADMIN) | `/admin/products` → «Філамент» → «Kingroon PLA»: «Серія» `Basic` → `Basic R01`, PATCH 200, «Зміни збережено й уже діють на сайті», HTML сторінки товару показує `Basic R01`; повернуто `Basic` |
| Замовлення на мігрованих даних (Playwright, справжній checkout) | головна → «Каталог» → `/filament/pla` → товар → «Додати в кошик» → checkout (самовивіз, готівка, email = `SERVICE_EMAIL`) → `POST /orders` **201**, FO-0000194, сторінка успіху, помилок консолі й 5xx немає; позиція: `FL-000301`, «Bambu Lab PLA-CF — Чорний (Black)», 2610 ₴, `vendor_sku` — той самий знімок, що й у legacy; у лозі API немає помилок відправки листа |
| Перший revert | **знахідка**: `RECOVERY_CONFLICT` — стара версія редактора під час збереження переставила `attributes_v2` «Kingroon PLA»; gate лишився в `writing`. Виправлено (див. таблицю вище); gate звільнено новою гілкою `rollback`; повторний revert відмовив уже з переліком цілі й звільненим gate |
| Прибирання | видалено замовлення й повернуто лічильник `order` (194 → 193), тимчасовий ADMIN і його refresh-токен; порядок характеристик «Kingroon PLA» повернуто до образу міграції; `disable` |
| Revert | `filament-v2-20261028p-revert-3`, 2,5 с |
| Звірка з еталоном (`scripts/catalog-rehearsal/db-compare.cjs`) | 19 колекцій / 67 002 документи й індекси побайтово = `fillando_rehearsal_20261027` (без службових `catalog_*`) |

Контейнер, база перевірки restore, архів і маніфест видалено.

### Partner API на робочій копії (до/після міграції, новий BE)

`fillando_rehearsal_work_20261027`, тимчасовий partner-токен: категорії, SKU, наявність, прайс-лист —
ідентичні; фід — лише дата акції (= час генерації). Lookup: 31 картка ідентична (8 без осі + 23, де
legacy-копія вже була власним кольором), 270 відрізняються **лише значенням** рядка «Колір» на тому
самому місці, і в кожній нове значення — колір із назви SKU (legacy: 267 називали колір іншого
варіанта, 3 — англійське/скорочене написання: «Candy», «TR-1»). Після revert і видалення токена
робоча копія побайтово = еталону (19 колекцій, 67 002 документи).

### Смуга прогресу — production-збірка FE 9100 → API 9002

Статуси SEO-матриці не змінились: `/`, `/catalog`, `/filament`, `/filament/pla`, товар, група й
категорія стенда — 200 із self-canonical; `?page=1`, `?polymer=PLA`, `?color_family=black` — 308;
`?color=black` — 200 `noindex, follow` без canonical; `?color=plaid`, `?bogus=1`, `?page=99`,
`/filament/nope`, невідомий розділ і товар — 404. Браузер (RSC-відповідь затримана на 800 мс):
клік на лендінг — смуга з 150 мс, стара сторінка лишається на екрані, після зміни URL смуга
згасає (~1 с від кліку); клік на товар (SSG, уже prefetch) — перехід миттєвий, смуга не блимає;
фільтр «Наявність» — смуга під час `router.push`, потім зникає.

### Перевірки коду

| Перевірка | Результат |
|---|---|
| BE unit | 92 suites, 1484 passed + 1 todo (нові: `typed-product-writer.order.spec.ts`, `withAxisColourRow` у `typed-legacy-shape.spec.ts`) |
| BE integration | 30 suites, 357 passed (новий `catalog-release-cli.int-spec.ts`: обидва CLI як дочірні процеси в production-режимі; `typed-product-published` +1: незмінене збереження; `catalog-legacy-exports`: власний колір SKU) |
| Тести скриптів (`node --test`) | 14 passed (`catalog-cli-target.test.cjs` 7, `catalog-audit.test.cjs` 7) |
| FE | 89 files, 866 passed (`NavigationProgress.test.tsx` 6, `CategoryTreeWorkspace.test.tsx` +1); typecheck; production-збірка |
| Цільовий ESLint змінених BE-файлів | без помилок |

### Межі

Production не змінювався, міграцію на production не запускали. Railway/Atlas (replica set, інша
латентність) не репетирувались. Повторна репетиція на свіжому дампі ≤ 24 год до релізу — у D08.
Після відкриття записів нової адмінки `revert` можливий лише для товарів, яких адмін не змінював
(журнал не скасовує чужих змін мовчки) — описано в D08 §5.

## 2026-10-28 — F04 перенесення товару; B02/F02 видалення й конвертація чернеток через HTTP

Production не змінювали; стенд `9000 → 9002 → fillando_catalog_local_v2`.

| Що | Результат |
|---|---|
| `GET /products/:id/admin/transfer?target_category_id=` | пропозиція: характеристики за ключем або (копія категорії з новими ключами) за назвою й сумісним типом; без вгадування одиниць/типів; вісь — з перевагою тієї самої семантики (у філаменті текстовий «Колір» поруч із віссю — знайдено й виправлено на стенді до запуску); `mapped`, `dropped` з `value_label` і причиною, `missing_required`, `axis_problem`, `variants_to_draft`, `proposal` |
| `POST /products/:id/admin/transfer` | план перебудовується під gate; інший набір втрат — `409 TRANSFER_PLAN_CHANGED`; несумісна вісь — `409 TRANSFER_AXIS_INCOMPATIBLE`; значення за правилами цілі (опублікована — усі обов’язкові, `400 REQUIRED_VALUE`); один журнальний план для товару й усіх SKU; slug/SKU/ID/ціни/залишки не змінюються; активні SKU у чернетці-цілі стають чернетками; той самий ключ — та сама квитанція |
| `POST /categories/:id/admin/deletion`, `/conversion` | лише порожні v2-чернетки (`CATEGORY_IN_USE`, `CATEGORY_DELETE_REQUIRES_DRAFT`, `CATEGORY_KIND_UNCHANGED`), без каскаду; product → group скидає визначення (before-image у журналі) |
| Адмінка | «Перенести в іншу категорію» в редакторі товару; у панелі чернетки категорії — «Перетворити на групу/товарну» і двокрокове «Видалити чернетку»; тексти помилок |

**Стенд (Playwright, справжній API9002):** нова чернетка «Тест перенесення F04» → «Скопіювати з
категорії: Філамент» (нові ключі) → «Kingroon PLA Gradient» (вісь кольору) перенесено в неї: перегляд
показав 8 характеристик, що переходять за назвою, «1 активний варіант стане чернеткою»; сторінка товару
404 → перенесено назад у «Філамент» → SKU FL-000175 знову «Активний» → чернетку видалено; сторінка
товару 200; документи товару й SKU **побайтово** дорівнюють знімку до перевірки; помилок консолі 0.

**Тести:** BE unit `typed-product-transfer.spec.ts` 4; BE integration `typed-product-transfer.int-spec.ts`
5, `category-draft-placement.int-spec.ts` +2 (21); FE `ProductTransferPanel.test.tsx` 2,
`CategoryTreeWorkspace.test.tsx` +1 (8); OpenAPI експортовано.

**Межі.** Атомарний план конвертації з розподілом товарів (TD-0013 mutations §5) не реалізовано: непорожню
категорію спершу явно звільняють (перенесення товарів, переміщення підкатегорій). Опубліковані гілки не
переміщуються; опублікована категорія не видаляється (адреса — рішення B07).

## 2026-10-28 — F07: typed-лендінги й закріплені фільтри в новій адмінці

Production не змінювали. Причина пріоритету: після міграції legacy-запис лендінгів закривається
інтерлоком — без цього блоку після релізу не можна було б змінити ні тексти, ні фільтри 14 лендінгів.

| Що | Результат |
|---|---|
| BE | окремий ADMIN-контролер `GET/POST /landings/admin/typed`, `PATCH /landings/:id/admin/typed`, `POST /landings/:id/admin/deletion` через gate/журнал (профіль `landing`: лише поля лендінгу, створення з `filters_v2`, видалення чернетки, відновлення за `category_id+slug`); перевірки закріплень за визначеннями, мінімум одне закріплення, унікальні закріплення й адреса в категорії, заблокована адреса опублікованої сторінки, публікація лише з активними товарами, санітизація |
| Лічильники | `countTypedLandings` — ті самі умови й стадії, що `/catalog/v2` (винесено в `conditionsOf`/`skuStages` без зміни поведінки: інтеграційні тести каталогу 98/98), один `$facet` на категорію; використовується й публічним списком лендінгів — новий лендінг без legacy-`filters` більше не рахує всю категорію |
| FE | «Посадкові сторінки» в робочому просторі категорії: список із лічильниками, форма (адреса, H1, title/description з лічильниками, закріплення з чекбоксів/діапазонів/родин кольорів, тексти, FAQ, фото, порядок, статус), двокрокове видалення чернетки; `/admin/landings` після міграції показує, де тепер редагувати |

**Стенд:** typed-лічильники 14 мігрованих лендінгів = legacy-лічильники до перезапуску API
(`pla` 180, `petg` 73, … `refill` 1 — побайтово той самий JSON). У браузері: H1 «pla» змінено й
повернено (API підтвердив обидва стани); нова «pla-black-f07» (PLA + Чорні) створена чернеткою →
опублікована: у списку «товарів: 9» = `/catalog/v2` total за тими самими фільтрами, публічний API 200,
є в sitemap → знята з публікації → видалена (публічний 404). Помилок консолі 0.

**Тести:** BE integration `typed-landing.int-spec.ts` 4; каталог/вітрина/safety 98 (регресія рефакторингу);
BE unit лендінгів 64; FE `TypedLandingsEditor.test.tsx` 2, `LandingsWorkspaceGate.test.tsx` 2; OpenAPI.

**Межі.** Завантаження фото плитки — лише URL (legacy-форма вміла S3-завантаження); зміна адреси
опублікованої сторінки — B07. Сторінку на стенді FE dev не перевіряли (його кеш fetch не очищується через
`/api/revalidate` на dev) — вітрину перевірено через API; production-збірку FE перевірю наприкінці блоку.

## 2026-10-28 — F05/B09/F11: кероване SEO категорій, налаштування вітрини, переходи в `/catalog`

Production не змінювали.

| Що | Результат |
|---|---|
| SEO категорії | `GET/PATCH /categories/:id/admin/seo` — v2-категорії (чернетка й опублікована), санітизація, порожнє → `null`, журнальний профіль `seo` (лише об’єкт `seo`), `SEO_UNCHANGED`, ревалідація `categories`; адмінка «SEO сторінки категорії» з попереднім переглядом сніпета з фолбеками вітрини й шаблоном title |
| Налаштування вітрини | один документ `storefront_settings` через журнал (профіль `settings`): категорії головної, добірки (категорія або її typed-лендінг), вступ `/catalog` (03.11 прибрано: текст у коді вітрини); посилання перевіряються; видалення категорії, на яку посилаються, відхиляється (`CATEGORY_IN_USE`); публічна проєкція — лише видимі категорії й активні typed-лендінги; адмінка «Вітрина» |
| Вітрина | плитки категорій і стрічки добірок на головній, вступ `/catalog` (03.11 — з коду, не з налаштувань); збій налаштувань не кладе сторінки (документований виняток «decoration») |
| F11 | порожній кошик, checkout, «Продовжити покупки», кошик, CTA головної й «Усі товари» → `/catalog` |

**Стенд:** у браузері збережено SEO демо-категорії АВР (не «Філамент» — справжні тексти пише власник) і
налаштування вітрини (Філамент + група на головній, добірка «PLA філамент» → `/filament/pla`, вступ
`/catalog`). Production-збірка FE: на головній плитки й стрічка з посиланням `/filament/pla`, на `/catalog` —
вступ, на `/local-transfer-switches` — збережені title/description/H1/вступ; статуси `/filament` 200,
`?page=1` 308, `?color=plaid` 404, невідомий розділ 404. Знайдено й виправлено: повідомлення «збережено»
на «Вітрині» зникало (форма перемонтовується на новій revision); передперегляд сніпета не показував
суфікс « | Fillando» з шаблону title; підписи select у добірках — через `htmlFor`. Після перевірки SEO й
налаштування на стенді очищено.

**Тести:** BE integration `category-seo.int-spec.ts` 2, `storefront-settings.int-spec.ts` 2; FE
`CategorySeoEditor.test.tsx` 1, `StorefrontSettings.test.tsx` 1, повний FE 93 файли / 874 тести (до двох
нових файлів), typecheck; OpenAPI.

**Межі.** Бренди на головній і добірки з явним списком товарів не реалізовано (brand-сутності не
використовуються); тексти FAQ/опту про асортимент — контент власника (D07); зміна URL — B07.

## 2026-10-28 — B10: категорійні правила фіду

Production не змінювали; Merchant Center не чіпали.

| Що | Результат |
|---|---|
| Правила категорії | `export_rules` + `google_product_category` товарної v2-категорії через `GET/PATCH /categories/:id/admin/export` (журнал, профіль `export`; ключі — лише визначення категорії; сигнал раннього оновлення фіду); адмінка «Google Merchant (фід)» |
| Білдер | `title_keys` замінюють діаметр/вагу філаменту в назві, `highlight_keys` — виміри highlights у заданому порядку, статичні мітки замінюють обчислені лише там, де задані |
| Семантика | адаптер заповнює `semantic.size/material` з визначень із такою семантикою (значення товару або осі) → `g:size`, `g:material` має пріоритет над правилом полімеру; колір — лише зі словника кольорової осі |
| Філамент | без правил — вивід і мітки кампаній без змін: наявні 103 тести фіду проходять без правок |

**Тести:** BE unit білдера +3 (60), інтеграційні `category-export.int-spec.ts` 2, `catalog-exports.int-spec.ts`
+1 (10: правила й розмір осі через справжній `FeedService`, мітки філаменту не змінені); FE
`CategoryExportEditor.test.tsx` 1; OpenAPI. На стенді фід не перегенерували: демо-SKU АВР без бренду
виключаються з фіду як `missing_brand` (правило «не вигадувати бренд»), тож перевірка — інтеграційна.

## 2026-10-28 — B07/F10: реєстр старих адрес і явна зміна slug

Production не змінювали.

| Що | Результат |
|---|---|
| Модель | `catalog_routes` — лише аліаси (стара адреса → сутність); канонічна адреса обчислюється з поточного slug, тож ланцюжків немає; реальні шляхи вітрини (`/{категорія}`, `/{категорія}/{лендінг}`, `/products/{slug}`), а не чернеткова схема `/catalog/…` планувальника |
| Операції | `POST /routes/{variants|categories|landings}/:id/slug-change` через журнал (профіль `routes`): slug + аліас старої адреси; категорія — ще й старі адреси всіх її лендінгів; повернення на свою стару адресу забирає аліас; чужі адреси/аліаси — `ROUTE_PATH_TAKEN`, корені сайту — `ROUTE_PATH_RESERVED` |
| Resolve | `GET /routes/resolve` — один 301 лише на публічну ціль; прихована/чернетка/невідома — 404 |
| Вітрина | `redirectIfMoved` у гілках 404 категорії, лендінгу й товару (сторінка й метадані): один 308, параметри запиту збережено |
| Адмінка | «Змінити адресу» в рядках SKU, у панелі категорії (і для опублікованої) й в опублікованому лендінгу |

**Стенд + production-збірка FE:** через адмінку змінено адреси SKU FL-000175, демо-категорії АВР і лендінгу
«pla». `/products/kingroon-pla-gradient-rainbow` → 308 `/products/…-b07`;
`/local-transfer-switches?sort=price_asc` → 308 `/local-avr-b07?sort=price_asc`; `/filament/pla?page=2` → 308
`/filament/pla-b07?page=2`; нові адреси 200; sitemap лише з новими; невідомі 404. Знайдено й виправлено: у
панелі опублікованої категорії кнопка зміни адреси була вимкнена разом із полями чернетки. Потім усі три
адреси повернуто через адмінку (власні аліаси забрано) і тестові аліаси видалено; `catalog_routes` на стенді
порожній, slug-и як до перевірки.

**Тести:** BE integration `catalog-routes.int-spec.ts` 3, unit планувальника 19; FE `SlugChange.test.tsx` 1, тести
маршрутів вітрини 149 і адмінки 57 без регресій; OpenAPI.

## 2026-10-28 — B08/F08: рефіл як типізований зв’язок, картка товару як дані категорії

Production не змінювали; еталон і робоча копія лише читались (dry-run).

| Що | Результат |
|---|---|
| Зв’язок | `products.relations: [{type: alternative_configuration, target_product_id, variant_pairs}]` (≤ 1); `GET/PUT /products/:id/admin/relations` через журнал (профіль `relations`); без self-link і дублікатів, SKU пари належать своїм товарам, вихідний SKU — один раз; підказка пар — той самий id кольору словника, не текст |
| Читання вітрини | поле `relations` (навіть `[]`) авторитетне: парний ACTIVE SKU (`matched_colour: true`), інакше найдешевший ACTIVE цілі («від»); `spooled_product_id` читається лише поки поля немає; ціни/залишки наживо |
| Міграція | `spooled_product_id` → `relations` з парами за id кольору; ціль поза категорією зупиняє план; перевірка після apply — `RELATION_MISSING`; `relations` у v2-полях fingerprint; dry-run на робочій копії проду: 360 цілей (як раніше), 1 зв’язок, 1 пара, 0 без пари |
| Представлення | `GET/PATCH /categories/:id/admin/presentation` (профіль `presentation`): допис до назви, порядок/приховування/«лише з одиницею», виділення, попередження за значенням із позначкою на фото, назва іншої комплектації; ключі лише з визначень; mapping філаменту переносить попередження рефілу, «Без котушки» й «на котушці» |
| Картка (FE) | v2-сторінка бере попередження, позначку й «{назва} — X ₴» з категорії, без `ATTR_NOTES`/`REFILL_VARIANT_PATTERN`; v1 — як було |
| Журнал | відкат створеного товару/SKU відмовляє, якщо на нього вказує пара зв’язку (раніше перевірявся неіснуючий шлях `relations.target_variant_id`) |
| Адмінка | «Картка товару» в робочій області категорії, «Інша комплектація» в товарі; застарілі читання редакторів тепер показують «Каталог змінився» замість «Результат запиту потребує перевірки» |

**Стенд (API 9002 → FE dev 9000), через адмінку в браузері:** у «Філаменті» збережено попередження рефілу
(«Котушка в комплекті» = «Ні (рефіл)», позначка «Без котушки») і назву «на котушці»; у товарі
«Bambu Lab PETG Translucent (без котушки)» панель показала старий зв’язок і підказала пару Безбарвний →
Безбарвний (FL-000251), зв’язок збережено. Вітрина: сторінка рефілу — позначка, попередження,
«на котушці — 1 500 ₴» і посилання, як у старій картці; сторінка котушки — без них; помилок консолі немає.
Ці налаштування лишено на стенді: вони збігаються з тим, що запише міграція. Знайдено й виправлено: два
визначення «Колір» (`kolir` і вісь `color`) у редакторі тепер підписані ключем.

**Тести:** BE unit міграції +2 (12), пари/попередження 3; integration `product-relations.int-spec.ts` 2,
`category-presentation.int-spec.ts` 2, рефіл-читання +4 (9), вітрина +1 (13), відкат створеного SKU +1 (15),
catalog-safety і category — 130 без регресій; FE `ProductPage` +3 (17), `ProductRelationsPanel` 3,
`TypedPresentationEditor` 1, адмінка 335 без регресій.

**Межі:** brand CRUD не робився — «Виробник» лишається характеристикою (рішення власника), brand-сутність
опційна; зворотного посилання на сторінці котушки («є рефіл») немає, як і в старій картці.

## 2026-10-28 — F09: ProductGroup за SEO-матрицею

Production не змінювали; live-перевірка Rich Results / URL Inspection — R03.

| Що | Результат |
|---|---|
| Модель | multi-page: кожна сторінка SKU повторює самодостатній `ProductGroup` (`productGroupID` = id товару, `variesBy`, назва без значення варіанта, бренд/опис, `hasVariant` = повний Product цього SKU + лише URL інших публічних SKU), без `ProductGroup.url` |
| Вісь | v1 — колір словника; v2 — `variant_type.semantic` (`color`/`size`/`material`) з BE; `generic` (струм, довжина) не видається за варіантну властивість: Product + `inProductGroupWithID` + `additionalProperty` |
| Узгодженість із фідом | v2 `material`/`size` — `semantic_values` з BE: `semanticValue` спільний із адаптером фіду, `materialOf` — спільне правило `g:material` (семантика → `polymer` → «Матеріал»); на v2-філаменті сторінка й фід кажуть PETG |
| Один SKU | звичайний Product без групи |

**Стенд (SSR HTML dev 9000 → API 9002):** PETG Translucent Clear — `ProductGroup`, `variesBy` color, 8 варіантів,
поточний FL-000251 (колір «Безбарвний», material PETG, бренд Bambu Lab); демо-АВР 16 А — Product з
`additionalProperty` «Номінальний струм: 16 А», без бренду; рефіл — один Product. SKU self-canonical.

**Тести:** FE JSON-LD 20 → 22 (група кольору, generic-вісь, розмір/матеріал v2, один SKU), сторінка товару
й вітрина 524 без регресій; BE інтеграційна вітрина (семантика осі, material = PLA за правилом фіду), фід 106
і експорт без регресій.

## 2026-10-28 — F12: розбіжності подій аналітики

Production не змінювали. Перевірено лише код і стенд; GA4-ідентифікатор у production не заданий (окреме
налаштування), тож події GA4 там поки не надсилаються — Ads-конверсія працює як раніше.

| Подія | Знайдено | Виправлено |
|---|---|---|
| `view_item` | SKU, ціна зі знижкою, UAH, раз на варіант — коректно | — |
| `add_to_cart` | шлеться лише зі сторінки товару; «В кошик» у картці каталогу й прайс-листі — ні | усі три місця, SKU і фактична ціна |
| `begin_checkout` | `item_id` = id варіанта з Mongo, а не SKU (у `view_item`/`add_to_cart`/фіді — SKU) | кошик несе `sku` (BE-відповідь і гостьовий `_meta`); рядок без SKU — без `item_id`, не з вигаданим |
| `purchase` + Ads | без `?order=` конверсія з порожнім `transaction_id`; перезавантаження/повернення — повторна | лише з номером; `claimPurchaseTracking` — раз на замовлення в браузері (localStorage, при збої — надсилає) |
| Consent / онлайн-оплата | тег лише після «Прийняти», події стоять у черзі; LiqPay — лише після `PAID` | без змін, підтверджено |

**Стенд (FE dev з тестовим `G-TEST000000`, усі зовнішні запити заблоковано й записано):** картка «PETG» →
`add_to_cart` FL-000302 1 280 UAH; сторінка рефілу → `view_item` + `add_to_cart` FL-000253 1 450; `/checkout` →
`begin_checkout` [FL-000302, FL-000253], 2 730 UAH; гостьовий кошик зберіг обидва SKU; без згоди — жодного
запиту до Google. Покупку на стенді не оформлювали (листи) — `purchase` перевірено тестами. Після перевірки
FE dev перезапущено без тестового ідентифікатора.

**Тести:** FE `ga4-events` +2 (7), сторінка успіху +1 (22), checkout +1 (26), картка каталогу (SKU і
`add_to_cart`), прайс-лист +1 (3); BE кошик (SKU у відповіді) 34.

## 2026-10-28 — приймання великого каталогу (D06/B05/B06/R01)

Локально, без production: синтетична база `fillando_load_20261028` (`scripts/catalog-rehearsal/large-fixture.cjs`,
пише лише в `fillando_load_YYYYMMDD` на 127.0.0.1:27019) — 20 розділів × 10 груп × 49 товарних категорій =
10 020 категорій, 32 350 товарів, 100 000 активних SKU (50 великих категорій по 1 025 SKU і довгий хвіст;
кольорова вісь у половині категорій, числова — в іншій). Окремий API 9003 (`RUN_CRON=false`, одноразові
секрети й внутрішній токен), після замірів зупинено, базу видалено. Хост: macOS, 10 CPU; MongoDB 8.0 у Docker.

**Що показав перший замір і що виправлено**

| Знахідка | Причина | Виправлення | Ефект (один запит) |
|---|---|---|---|
| Будь-який запит каталогу ≥ 0,88 с, навіть категорія з 5 SKU | кожне читання дерева перечитувало й zod-розбирало 10 000 категорій, а каталог читав двічі | мемо розібраного дерева за ревізією + відбитком вмісту колекції (`$toHashedIndexKey`, ~65 мс; будь-який запис інвалідує), одне читання на запит | 0,88 → 0,10 с |
| Весь каталог 16,2 с, 804 КБ | `$lookup` товарів підконвеєром на кожен із 100 000 SKU (повільний рушій); фасет категорій — 9 800 рядків (700 КБ) з квадратичним пошуком міток | для груп/усього каталогу без брендів — запит лише по SKU, дані товару тільки для 24 позицій сторінки; перевірка «категорія SKU = категорія товару» — бічним запитом у Mongo (лише розбіжні пари, спільний на паралельні запити, 30 с); з’єднання від товарів (простий lookup) там, де воно потрібне; фасет категорій ≤ 100 (далі — вибрані); мітки через Map | 16,2 → 0,5 с, 16 КБ |
| Дерево: p95 683 мс на сторінку при 10 паралельних | кожна сторінка перечитувала, проєктувала й хешувала все дерево | мемо проєкції й знімка за тим самим відбитком | p95 198 мс |
| RSS до 1,9 ГБ під паралельним «весь каталог» | у Node тягнулись 32 тис. пар і 32 тис. товарів на запит | порівняння в Mongo, у Node — лише розбіжності | пік 533–703 MiB |

**Основний прогін** — `load-large.mjs`, 10 паралельних читачів, 5 хв, суміш (дерево / весь каталог / групи /
категорії з typed-, кольоровими й ціновими фільтрами / товар), API як у production (`node dist/main`) з
`--max-old-space-size=400`; 4 077 запитів, усі 200, без OOM:

| Сценарій | n | p50 | p95 | p99 | ціль D06 |
|---|---|---|---|---|---|
| дерево (сторінка 1 000 вузлів, 178 КБ) | 816 | 156 мс | 198 мс | 523 мс | ≤ 500 мс ✓ |
| категорія з фільтрами | 815 | 344 мс | 513 мс | 1 491 мс | ≤ 1 000 мс ✓ |
| група (з ціною/наявністю) | 813 | 368 мс | 527 мс | 2 026 мс | ≤ 1 000 мс ✓ |
| весь каталог (сторінки 1–40, сортування) | 817 | 2 558 мс | 3 302 мс | 3 879 мс | ≤ 1 000 мс ✗ |
| сторінка товару | 816 | 168 мс | 207 мс | 1 000 мс | — |

RSS: старт 381, пік 703, кінець 609 MiB (ціль ≤ 512 ✗); для порівняння свіжий API стенда на 4 категоріях
займає 341 MiB, тож це переважно базова пам’ять процесу на macOS, а купа вмістилась у 400 МБ.

**Межі (не виконано):** весь каталог на 100 000 SKU при 10 одночасних таких запитах (кожен сканує всі SKU;
один запит 0,5 с) — варіанти: окремий запит позицій з індексом і кеш лічильників із явною інвалідацією або
денормалізована колекція лістингу; кеш відповідей API свідомо не робили (FE після ревалідації міг би
закешувати застарілі ціни на годину). `/catalog/sitemap` — один документ 7,1 МБ / 0,6–1,1 с (110 020 URL;
Google приймає ≤ 50 000 URL на sitemap) — потрібне розбиття до такого розміру. Переміщення категорій і
stress chain/wide не заміряні. На поточному каталозі (4 категорії, ~300 SKU) нічого з цього не проявляється.

**Тести:** інтеграційні каталогу +3 (25: шлях без з’єднання з тими самими полями й перевірками, межа
фасета категорій, інвалідація мемо сирим записом) і адаптований тест зміни ревізії; повний BE integration 391,
unit 1 497, FE 891 без регресій.

## 2026-10-29 — блок «не гірше за стару адмінку» (блокер релізу) і повторна репетиція R01

Production не змінювали; стенд `9000 → 9002 → fillando_catalog_local_v2`; еталон `fillando_rehearsal_20261027`
лише читався (копія на тимчасовий MongoDB). Child-репозиторії станом на початок дня: зміни Plan-0010 не
закомічені (HEAD = `dev`), роботу продовжено поверх робочого дерева.

### Звірка: стара адмінка ↔ нова після міграції

Після міграції `catalog_control` існує, тож `LegacyCatalogWriteInterceptor` відповідає 503 на будь-який запис
старих контролерів категорій, товарів, кольорів і лендінгів, а legacy-читання адмінки падають для всього
каталогу. Стан на ранок 29.10 і що зроблено:

| Можливість старої адмінки | Нова адмінка до 29.10 | Стало (локально) |
|---|---|---|
| Назва категорії | лише чернетка (`CATEGORY_EDIT_REQUIRES_DRAFT`) | опублікована теж (`PATCH …/admin/details`) |
| Характеристики категорії (додати, назва, одиниця, порядок, фільтр, у характеристиках, варіанти списку) | лише чернетка, і будь-який товар блокував усе | опублікована теж; відмови — за точним usage з лічильниками |
| Зображення категорії (плитки головної нової вітрини) | немає | завантаження в S3 + прибрати (`image` у деталях) |
| Порядок категорії в меню | лише чернетка | опублікована — порядок серед сусідів; переміщення в іншу групу — як і раніше, лише чернетка |
| Словник кольорів: додати / змінити / видалити | 503, кнопки на сторінці «Кольори» лишались | журнальні ендпоінти; сторінка та сама; зміна оновлює назви й родину SKU одним планом |
| Акції товару й SKU | 503 (PromotionCard, VariantModal) | у «Опис, фото та ціни»: на SKU і «на весь товар», попередній перегляд, попередження нижче закупівельної |
| Постачальник товару | лише при створенні | змінюється в характеристиках товару |
| Видалити товар / варіант | 503; нова — лише архівування по одному SKU | «Архівувати всі варіанти»; видалити неактивний SKU чи товар без замовлень, кошиків, зв’язків і старих адрес |
| Фото плитки лендінгу | лише URL | завантаження в S3 |
| Зняти філамент з публікації й опублікувати знову | — (пастка) | раніше всі кольорові SKU пропускались (`COLOR_ADAPTER_REQUIRED`) і лишались чернетками; виправлено |
| Категорія, слаг, SEO, Google-категорія, картка товару, лендінги (тексти, закріплення, статус), товари й варіанти (ціни, залишки, вага, фото, «ID на Промі», статуси), прайс-лист PDF, Prom sync, фід | уже були | без змін |

Свідомо не відтворено: стара адмінка видаляла товар без жодних перевірок (замовлення лишались із «висячими»
посиланнями) — нова видаляє лише ніде не використане, решту архівує. Переміщення опублікованої гілки в іншу
групу і зміна категорії лендінгу — у старій адмінці дерева не було, тож це не регресія (B02, TD §5).

### Редагування опублікованої категорії (B03/F03)

`category-definition-change.ts`: точний usage за ключем (товари зі значенням або віссю, SKU осі, лендінги із
закріпленням, родини кольорів для кольорової осі, згадки в картці й фіді, товари без значення, usage кожного
варіанта списку) і правила (див. BE `CATEGORY_TREE.md`). Дозволено: перейменування, нова необов’язкова
характеристика, назва, порядок, одиниця, «у характеристиках», фільтри незакріпленого ключа, варіанти списку
(нові, перейменування, порядок, видалення невикористаного), будь-що з невикористаним ключем. Відмова 409 з
`details.usage`: `DEFINITION_IN_USE`, `DEFINITION_TYPE_LOCKED`, `OPTION_IN_USE`, `FILTER_PINNED`,
`REQUIRED_VALUES_MISSING` (лише опублікована), `DEFINITION_CHANGE_INVALIDATES_DATA` (останній рубіж). Збереження без
змін — побайтово той самий документ (revert міграції не ламається). Опублікована категорія ревалідує
`categories/products/landings` і фід.

**Стенд (Playwright, справжній API 9002):** «Філамент» — банер опублікованої категорії, «Батьківська група»
вимкнена; usage у редакторі: «Тип пластику» 44 товари + 11 посадкових сторінок, вісь «Колір» 36 товарів + 293 SKU,
«Армування» 8 товарів + 3 сторінки тощо. Перейменування «Філамент → Філамент F03 → Філамент» (публічне дерево
показало обидва), порядок 0 → 1 → 0, зображення прибрано й повернуто, «Серія» → «Серія (F03)» і нова
«Перевірка F03» (тип «Текст» заблокований у використаної, «Обов’язкова» нової заблокована: «нової
характеристики ще немає в 44 товарах»), потім усе повернуто. Відмови сервера на справжніх даних: прибрати «Тип
пластику» — `DEFINITION_IN_USE` 44 товари / 11 сторінок / картка; «Вага» → текст — `DEFINITION_TYPE_LOCKED`;
«Армування» обов’язкова — `REQUIRED_VALUES_MISSING` 36 товарів; прибрати вісь «Колір» — 36 товарів / 293 SKU;
вимкнути фільтр «Тип пластику» — `FILTER_PINNED` 11 сторінок; ревізія не змінилась. Після перевірки три
категорії стенда **побайтово** дорівнюють знімку до неї (лише ревізія 43 → 61). Знайдено й виправлено: адмінське
дерево не читало `image` (Mongo-проєкція); відмінок у підказці («немає в 44 товарах»).

### Інші прогалини (1в)

| Що | Перевірка на стенді |
|---|---|
| Кольори (`/admin/colors` після міграції) | створено «F03 Check Teal», змінено назву, «Black» — відмова «Колір використовують 19 варіант(ів)…» (= лічильник таблиці), тестовий колір видалено (POST 200); у словнику знову 122 |
| Постачальник | демо-АВР Filando → NicePrice → Filando |
| Акція на весь товар 10 % | перегляд «Ціна за акцією: 2250 ₴»; `catalog/v2`: 1500→1350, 1750→1575, 2500→2250; прибрано |
| Архівувати всі / видалити товар | тестовий товар із 2 SKU: обидва archived → «Видалити товар» → 404, повідомлення «Товар видалено разом з його варіантами» |
| Підсумок | товар демо-АВР і його SKU побайтово = знімку; кольорів/товарів/SKU 122/46/307 як до перевірки |

Фото лендінгу й категорії в S3 на стенді не завантажували (справжній бакет) — перевірено тестами FE.
Повторну публікацію філаменту на стенді не робили (293 SKU) — перевірено інтеграційним тестом.

### R01: production-режим із mapping 28.10 (тимчасовий MongoDB 27020, tmpfs)

| Крок | Результат |
|---|---|
| копія еталона як `fillando-prod` | 19 колекцій / 67 002 документи = еталону |
| backup → restore у `fillando_release_check_20261029` → `backup-manifest` | каталог 1 / 44 / 301 / 14 / 122 / 0 брендів |
| dry-run `--production` | 360 цілей, 44 товари (36 з віссю / 8 без), 301 SKU, 14 лендінгів, `kolir: 36`, брендів 0, зв’язки 1 / 1 / 0 |
| apply без `--confirm` / з ним | відмова / `completed`, `legacy_fingerprint_unchanged`, **2,5 с**; у категорії — попередження рефілу з позначкою «Без котушки» і «на котушці», зв’язок рефілу PETG Translucent |
| `enable`, правка новим writer | usage як на стенді; «Серія» → «Серія R01», назва → «Філамент R01» (ревізія 1 → 3); прибрати «Тип пластику» — `DEFINITION_IN_USE` 44 / 11 / картка, ревізія та сама |
| `disable`, revert з правкою | **відмова** `RECOVERY_CONFLICT … categories:<id>:attribute_definitions`, gate `idle` |
| повернення правки новим writer | визначення побайтово = образу міграції |
| revert | `filament-v2-20261029-revert-2`, `completed`, **2,2 с** |
| звірка з еталоном | 19 колекцій / 67 002 документи й індекси побайтово (додатково лише службові `catalog_*`) |

Контейнер зупинено, база перевірки restore, архів і маніфест видалено. Замовлення на копії цього разу не
оформлювали (окремого дозволу власника на нові листи не було) — оформлене 28.10 лишається доказом.

### Перевірки коду

| Перевірка | Результат |
|---|---|
| BE unit | 95 suites, 1 501 passed + 1 todo (у першому з чотирьох прогонів один набір дав 5 падінь — відомі нестабільні RBAC/throttle; три наступні чисті) |
| BE integration | 40 suites, 408 passed (+17: `category-definitions-published` 7, `color-admin` 5, typed-product акції/постачальник/видалення 4, повторна публікація 1; адаптовані `category-draft-placement`, `category-tree-read`) |
| Тести скриптів | 14 passed |
| FE | 99 файлів, 899 passed (було 891: +8 — usage і відмови в редакторі характеристик, деталі опублікованої категорії, акції, архівування/видалення, постачальник, фото лендінгу, `colors.api` в обох режимах); typecheck; production-збірка |
| ESLint змінених BE-файлів | без помилок |

### Межі

Усе локально. Переміщення опублікованої гілки в іншу групу й атомарна конвертація з розподілом товарів
(TD §5) — не зроблено. Зміна одиниці використаної характеристики дозволена (за рішенням власника в постановці
блоку) — значення не перераховуються, адмінка попереджає. Колір із понад 499 SKU не змінюється однією дією
(`COLOR_PLAN_TOO_LARGE`; у філаменті максимум 19). Після правки поля міграції `revert` відмовляє, доки правку не
повернуто (D08 §5).

## 2026-10-29 (друга сесія) — рішення власника, повна verify §3.7 у production-режимі, B02/F02, B09/F05

Production, `fillando-prod` на 27019, API 9001 і еталон `fillando_rehearsal_20261027` не змінювали (еталон лише
копіювали). Child-репозиторії на початок сесії: зміни Plan-0010 не закомічені (HEAD = `dev` в обох), роботу продовжено
поверх робочого дерева.

**Рішення власника (29.10, не переглядати):** перший реліз — увесь Plan-0010 за таблицями («100%»); бренди
(бренд-сутність, бренди на головній) прибрано з обсягу — «Виробник» лишається характеристикою; добірки з явним списком
товарів лишаються.

### D08/R01: повна verify §3.7 у production-режимі (тимчасовий MongoDB 27020, tmpfs)

Нові read-only зонди в `scripts/catalog-rehearsal/`: `release-verify.mjs` (лістинги legacy/v2, кожен лендінг філаменту,
`/catalog/sitemap`, картки рефілу й котушки), `release-check.cjs` (вердикт §3.7: PASS/FAIL/SKIP, exit 1 на будь-якому FAIL;
дозволені лише задокументовані різниці — значення рядка «Колір» у partner-картках, яке має бути кольором із назви SKU, і
дати у фіді), `seo-status.mjs` (§3.10 для браузера й Googlebot). `capture.mjs` чекає до 30 с, поки фід перебудується.

| Крок | Результат |
|---|---|
| копія еталона як `fillando-prod`, тимчасовий API 9003 (новий BE, `RUN_CRON=false`, одноразові секрети), тимчасовий partner-токен, ADMIN — JWT із тимчасовим секретом | 67 002 документи; API 200 |
| baseline (новий BE, legacy-дані) | partner 301 SKU / lookup 301, прайс-лист 301, PDF 201, фід 200; legacy 200; 14 лендінгів; sitemap 301/1/14; рефіл 1 |
| backup → restore у `fillando_release_check_20261029` → `backup-manifest` | 67 003 документи (з тимчасовим токеном), каталог 1 / 44 / 301 / 14 / 122 / 0 |
| dry-run / apply без `--confirm` / apply | 360 цілей, `kolir: 36`, зв’язки 1/1/0 / відмова / `completed` **2,6 с**, legacy-відбиток незмінний |
| перша verify | **2 дефекти.** (1) `/catalog/v2` сортував лише за `_id`/ціною, а legacy завжди ставить SKU в наявності першими — перша сторінка філаменту після міграції відрізнялась у 3 з 6 комбінацій. (2) Після apply фід — 503 `CATALOG_FEED_STALE`: CLI пише з іншого процесу, API про це не знає, а у вікні релізу `RUN_CRON` вимкнений — фід лишався б 503 до рестарту чи ручної кнопки |
| виправлення | v2-лістинг: `_out_of_stock` першим під будь-яким сортуванням (тест «lists in-stock SKUs first»); фід: застарілий штамп ставить перебудову в чергу (`feedRefresh`, тест у `catalog-exports.int-spec.ts`) |
| повторна verify (`release-check.cjs`) | **36/36 PASS**: v2 total 301 = legacy, 15 родин, 6 комбінацій (тотали, SKU першої сторінки, фасети), 14 лендінгів (200, contract 2, ті самі лічильники й H1/title), sitemap, рефіл (позначка «Без котушки», «на котушці», котушка того самого кольору), partner (31 ідентична картка + 270 лише зі значенням «Колір», 270/270 = колір із назви SKU), прайс-лист, PDF, фід 301 позиція (1 рядок — дата) |
| `catalog-admin-writes status` / `enable` | `phase: idle` / `changed`, capabilities API `draft_writes_enabled: true` |
| production-збірка FE 9100 → API 9003, `seo-status.mjs` | **37/37 PASS** (браузер і Googlebot): 200/self-canonical, 308 (`?page=1`, `?polymer`, `?f.polymer`, `?color_family`), `noindex, follow` без canonical для `?color=black`, 404 для невідомого; sitemap 325 URL; JSON-LD товару з брендом і пропозицією |
| сценарій покупця (Playwright) | головна → `/catalog` → `/filament` → «Чорний» → PLA + «Чорний» (9 товарів) → `/filament/petg` → товар → «В кошик» → `/checkout`; 0 помилок консолі, 0 відповідей 5xx; `POST /orders` перехоплено — замовлення не оформлювали (листи) |
| `disable` → revert | `filament-v2-20261029v-revert` **2,4 с**; фід: 503 перші ~4 с, **200 з 6-ї секунди** без рестарту (самовідновлення) |
| після revert | зонди = baseline (у фіді лише час початку акції = час генерації) |
| звірка з еталоном після видалення токена | 19 колекцій / 67 002 документи побайтово, `different: {}`, додатково лише службові `catalog_*` |

Контейнер зупинено; база перевірки restore, архів, маніфест, секрети, знімки й збірка FE видалені. Рунбук
[`catalog-v2-release.md`](../runbooks/catalog-v2-release.md) переписано під виконання власником: чек-лист (А —
Railway Variables, робоче місце, тимчасовий partner-токен; Б — репетиція на Railway/Atlas; В — свіжий дамп ≤ 24 год;
Г — день релізу), змінні сесії без історії shell, готові команди кожного кроку, verify і SEO-статуси — зондами з
вердиктом, stop-критерії за exit-кодом, «Як повторити» локальну репетицію.

### B02/F02: переміщення опублікованих гілок, конвертація товарної категорії на групу за планом

| Що | Результат |
|---|---|
| Переміщення | опублікована категорія — лише під опубліковану групу чи в корінь (`409 CATEGORY_PARENT_NOT_PUBLIC`), архівна — `CATEGORY_ARCHIVED`; адреси від дерева не залежать; ревалідація вітрини; адмінка пропонує лише корінь і опубліковані групи |
| План | `POST /categories/:id/admin/conversion-plan` (read-only): кожен товар і лендінг рівно раз (`400 CONVERSION_ASSIGNMENTS_INVALID` з переліком), цілі — інші товарні v2-категорії; товар — без жодної втрати значень (той самий `planTransfer`), вісь, обов’язкові значення опублікованої цілі; закріплення лендінгу в ключах цілі (`remapPins`), унікальні slug і закріплення, стара адреса опублікованого лендінгу — аліас; попередження; виконуваний план зберігається на свою revision |
| Виконання | `POST …/admin/conversion` з `plan_id`: план перебудовується під gate (`CONVERSION_PLAN_STALE`, `CONVERSION_PLAN_CHANGED`), один журнальний план (профіль `conversion`): категорія → група (визначення, картка, правила фіду — у before-images), товари й усі SKU, лендінги, аліаси, добірки, цілі під нову групу (`adopt_targets`); перевірка перед публікацією; slug/SKU/ID/ціни/залишки незмінні |
| Адмінка | «Перетворити на групу з розподілом товарів»: усі сторінки товарів і лендінги, «Усі товари й сторінки в» + «Призначити всім», вибір по рядках, «Перенести цільові категорії в нову групу», «Перевірити план» з поясненням кожної проблеми й попередження, двокрокове «Перетворити на групу» |

**Стенд (Playwright, справжній API 9002, знімок даних до перевірки):** опубліковану «АВР — приклад» перенесено в корінь
(публічне дерево — `parent_id: null`) і назад; для конвертації створено й опубліковано порожню копію «АВР —
підкатегорія F02» з тими самими характеристиками; майстер: план «2 товари, 6 варіантів, 0 посадкових сторінок → 1
категорія» → «Перетворити на групу» → «Категорію перетворено на групу…»; «АВР» тепер група з тією самою адресою, копія —
під нею; лістинг групи — 3 активні SKU; сторінки товарів 200, крихти `local-electrical > local-transfer-switches >
avr-f02-sub`; 0 помилок консолі. Потім дані стенда відновлено зі знімка — 26 колекцій / 742 документи **побайтово**.

### B09/F05: добірки з явним списком товарів

`collections[]` — категорія/лендінг **або** `product_ids` (до 24, у порядку адміна); посилання перевіряються
(`SETTINGS_PRODUCT_INVALID`, `SETTINGS_DUPLICATE_PRODUCT`), товар із добірки не видаляється (журнал, `PRODUCT_IN_USE`);
публічна проєкція — `filters: {product_ids}` лише з товарів видимих категорій; `/products/catalog/v2` приймає
`product_ids` і під типовим сортуванням зберігає порядок списку (в наявності першими); закріплення лендінгу його не
приймає. Адмінка «Вітрина» → «Додати добірку товарів» (категорія → товар → «Додати товар», порядок, прибрати; назви
збережених товарів читаються назад); головна — стрічка без `category_id`, посилання «Усі товари» на `/catalog`.

**Стенд (Playwright):** добірка «Вибір магазину B09» з «PETG Translucent» і «Kingroon PLA» (переставлено першим) збережена;
публічна проєкція — два `product_ids` у новому порядку; стрічка — 31 SKU, перші 8 — «Kingroon PLA»; головна FE dev (кеш
очищено) показує стрічку з 8 посиланнями на товари й «Усі товари» → `/catalog`; 0 помилок консолі. Дані стенда відновлено
зі знімка побайтово.

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів: **25 виконано в межах** (B/F — локально), 2 у роботі (D02, D08), 4 частково (D06, B05, F11, R01),
4 заплановано (D07, R02–R04). Змінено: B02, F02, B09, F05 — реалізовано в цій сесії; B01, B04, F01, F06 — переоцінено за
правилом інших B/F-пунктів («виконано локально, не production»): у їхніх описах лишались не роботи коду, а запуск на
production чи перемикання старих маршрутів, які належать R02 (для B01 — ще індекси дерева TD §6, які за замірами D06 не
потрібні: TD вимагає індексів лише за explain). F11 лишається частковим: тексти FAQ/опту про асортимент — контент
власника (D07).

### Перевірки коду

| Перевірка | Результат |
|---|---|
| BE unit | 96 suites, 1 494 passed + 1 todo у повному прогоні; 2 відомі нестабільні RBAC-спеки (`payment-details`, `wholesale-inquiry`) впали в ньому й пройшли окремо (35/35) |
| BE integration | 41 suites, **416 passed** (+8: `category-conversion.int-spec.ts` 5, product list у `storefront-settings` 1, `product_ids` і порядок «в наявності першими» в `public-catalog` 2; адаптовані published-переміщення в `category-draft-placement` і `category-definitions-published`, самовідновлення фіду в `catalog-exports`). Перший повний прогін завис без жодного з’єднання з тестовою Mongo — перезапущений пройшов повністю |
| BE unit нові | `category-conversion.spec.ts` (`remapPins`) 2 |
| Тести скриптів | 14 passed |
| BE typecheck / ESLint змінених файлів | чисто (крім наявної в `dev` помилки типу в `auth.controller.refresh.spec.ts`, яку ця робота не чіпала) / 0 помилок |
| FE | 100 файлів, **902 passed** (+3: `CategoryConversionPanel.test.tsx` 2, `StorefrontSettings` +1; адаптовано `CategoryTreeWorkspace`); typecheck; production-збірка |
| OpenAPI | експортовано (`conversion-plan`, `plan_id`, колекції з `product_ids`) |

### Межі

Усе локально; production не змінювали. Не зроблено: репетиція на Railway/Atlas і на свіжому дампі ≤ 24 год (чек-лист
власника Б, В); замовлення на мігрованих даних цієї сесії (потрібен дозвіл — листи); весь каталог на 100 тис. SKU під
паралельним навантаженням і розбиття sitemap понад 50 000 URL (B05/D06, п.4 черги); заміри переміщення й stress chain/wide
(D06); контент FAQ/опту (D07/F11); baseline Search Console/Merchant (D02). Конвертація понад 500 змін одним планом —
`CONVERSION_PLAN_TOO_LARGE` (частинами через перенесення товарів). Стрічка добірки товарів показує SKU (товар із багатьма
кольорами може зайняти всі 8 місць), як і решта стрічок головної.

## 2026-10-29 (третя сесія) — B05/D06: весь каталог, пам’ять, sitemap частинами, переміщення, stress

Production, `fillando-prod` на 27019, API 9001, еталон `fillando_rehearsal_20261027` і робоча копія не змінювались.
Child-репозиторії на початок сесії: зміни Plan-0010 не закомічені (HEAD = `dev` = `origin/dev` в обох), роботу продовжено
поверх робочого дерева. Синтетичні бази `fillando_load_20261029*` на 127.0.0.1:27019 (`large-fixture.cjs`; тепер
2 % SKU з акціями — безстрокові, з датою й завершені), окремий API: macOS — `node dist/main` на 9003, Linux —
контейнер зі стадії `builder` Dockerfile (`node:24-alpine`, node 24.22, `--cpus=4 --memory=1g`, той самий `dist`) на 9004;
скрізь `RUN_CRON=false`, `--max-old-space-size=400`, одноразові JWT/внутрішній токен. Хост: macOS, Apple M1 Pro, 10 CPU,
32 ГБ; MongoDB 8.0.30 у Docker Desktop (10 CPU, 8 ГБ). Після замірів API зупинено, бази видалено.

### 1. Весь каталог під паралельним навантаженням (B05/D06)

**Explain поточного шляху (variant-only, 100 000 SKU, Mongo напряму):** `$facet` (items + total + price + stock) — повний
прохід 100 000 документів, ~230 мс на запит; через API ще 2 × ~70 мс на відбиток категорій (рахувався двічі на запит).
Позиції сторінки «новинки» індексом `_id` — 4–5 мс; тотали `$group` без `$facet` — 110 мс (покривний індекс не допоміг:
вартість — обчислення ціни з акцією на кожен документ).

**Обрано варіант (а)** — кеш тоталів/фасетів зі скиданням + позиції індексом; (б) денормалізована колекція лістингу
відхилена: її мали б оновлювати всі записувачі цін/залишків/статусів (Prom sync, акції, журнал, CLI, сирі скрипти), а
узгодженість зі скриптами не доводиться. Причина й правила — TD-0013 mutations §6.

| Що | Як | Explain / ефект |
|---|---|---|
| тотали й фасети (total, ціна, наявність, категорії) | та сама агрегація без `items`, кеш на область + фільтри; скидання — **лічильник записів `product_variants`** (`$collStats` latencyStats + count, 0,7 мс; рахує insert/update/delete будь-якого клієнта, перевірено), ключ дерева, факти області, найближче завершення акції (за годинником сервера), ≤ 60 с; спільне обчислення для паралельних запитів; відповіді не кешуються | 100 000 документів — раз на запис/хвилину, не на запит |
| сторінка, «новинки» | спершу в наявності, потім продані (`pageSegments`), обхід `_id` ↓ | p1: 31 ключ / 31 документ; p40: 1 284 / 1 284 |
| сторінка, ціна ↑/↓ | новий індекс `{status, promo_percent, price}`: SKU без акції — у порядку ціни (нічиї на межі читаються цілком), акційні — окремо за ефективною ціною, злиття | p40: 1 288 / 1 095 + акційні 2 271 / 2 270 |
| глибокі сторінки, мала область | обхід дорожчий за половину сортування області → стара гілка `items` | як до змін |
| відбиток категорій | раз на запит (ключ читання дерева), спільний прохід для паралельних запитів, що прийшли до його початку | −70 мс/запит |
| похідні структури дерева | індекс вузлів і область (ids, ObjectId) — на знімок дерева, не на запит | найбільший алокатор під навантаженням (~3 ГБ/хв сміття) прибрано |

**Рівність:** `public-catalog-split.int-spec.ts` — ~1 000 запитів на змішаному дереві (v1/v2, вкладені й приховані групи,
чернетки, архів, drift і SKU без товару, акції безстрокові/з датою/завершені/без вигоди, нульові/від’ємні/відсутні залишки,
однакові ціни; 3 сортування, фільтри ціни/наявності/категорій, сторінки до й після межі «в наявності/продані» і за кінцем):
результат розділеного шляху (примусовий обхід і обраний план) = єдиній агрегації, побайтово; плюс скидання сирими записами,
завершенням акції без запису, спільне обчислення, відсутній індекс і 1 500 акційних SKU.

**Навантаження** (`load-large.mjs`, 10 паралельних, 5 хв, суміш дерево / весь каталог сторінки 1–40 з трьома сортуваннями /
групи / категорії з фільтрами / товар; усі відповіді 200):

| Прогін | запитів | весь каталог p50 / p95 / p99 | категорія p95 | група p95 | дерево p95 | товар p95 |
|---|---|---|---|---|---|---|
| 28.10, старий код (macOS) | 4 077 | 2 558 / **3 302** / 3 879 мс | 513 | 527 | 198 | 207 |
| 29.10, новий код (macOS) | 18 027 | 190 / **373** / 902 мс | 306 | 217 | 159 | 158 |
| 29.10, новий код (Linux-контейнер, 4 CPU) | 17 718 | 187 / **305** / 986 мс | 308 | 227 | 172 | 173 |

Холодний запит усього каталогу після старту — 1,3–1,4 с (розбір дерева + тотали), теплий — 90–140 мс; сторінки 3 000+ —
0,5–0,6 с (сортування області, як раніше). Ціль ≤ 1 000 мс p95 — **досягнута**.

### 2. Пам’ять (D06): пік RSS ≤ 512 MiB

| Замір | Результат |
|---|---|
| старий код на фікстурі з акціями (macOS, купа 400 МБ) | **OOM на 137-й с** |
| що тримало пам’ять (профіль алокацій, профіль живих алокацій на піку, трасування великих `toArray`) | (1) **генерація Google-фіду при старті** (безумовна навіть з `RUN_CRON=false`): `findActiveForFeed` читає всі 100 000 SKU з товаром/категорією одним `toArray`; (2) після спливання 60-секундного мемо дерева кожен із 10 паралельних запитів розбирав власну копію 10 000 категорій, а Nest тримає три екземпляри читача — кожен зі своєю копією; (3) на кожен запит каталогу — Map/Set/9 800 ObjectId області (1,2 ГБ/хв сміття лише від міток категорій); (4) запис журналу — два повні знімки 10 000 категорій (~100 MiB кожен) |
| виправлено | (2) мемо одне на з’єднання, розбір один для всіх промахів, двопрохідний потоковий (топологія → вміст видимих пакетами по 1 000), `ancestors` за потреби; (3) область — на знімок дерева; (4) потоковий знімок записувача (лише поля ідентичності/розміщення, повний документ — тільки цілі) |
| перевірка відсутності утримання | жива купа після примусового GC: 89 → 108 → 102 → 103 MiB після трьох серій навантаження |
| **Linux, навантаження каталогу** (після генерації фіду; VmHWM скинуто `clear_refs`) | старт 323, вибірки — пік 387 MiB; **VmHWM 392 MiB** — **у цілі** |
| **Linux, генерація фіду при старті** (100 000 SKU, без навантаження) | 37 с, **VmHWM 518 MiB** — понад ціль, хоча через синтетичні дані без брендів у фід не потрапило жодної позиції; з реальними брендами додасться ще XML 100 000 позицій, що лишається в пам’яті |
| для порівняння: свіжий процес | Linux 312–318 MiB (macOS 341–532 MiB — базова пам’ять процесу на macOS вища) |

Висновок: читання каталогу на 10 000 / 100 000 при 10 паралельних тримаються в 392 MiB. Пік процесу визначає генерація
фіду: модель «увесь робочий набір і весь XML у пам’яті процесу» (B10) на 100 000 SKU не вкладається в 512 MiB — потрібна
потокова генерація (курсор, XML у стиснений буфер/файл) окремою роботою; у межах цієї сесії не змінювалась.

### 3. Sitemap понад 50 000 URL (B05 + F10)

BE: `GET /catalog/sitemap` — індекс `{revision, epoch, parts: [{from, to, urls}]}`; `GET /catalog/sitemap/part?revision&epoch
[&from][&to]` — частина в старій формі. Перша частина — усі категорії й лендінги + перші SKU за slug, далі — діапазони slug
SKU (діапазон, не зсув: SKU, створений між індексом і частиною, потрапляє рівно в одну частину); план < 45 000 URL і
1,5 MiB, межі 50 000 / 2 MiB → 409 `SITEMAP_PART_TOO_LARGE`; інша ревізія → 409 `SITEMAP_REVISION_CHANGED`; той самий read
barrier. FE: `/sitemap.xml` — сам `<urlset>`, поки частина одна (поточний каталог, без змін), інакше `<sitemapindex>` файлів
`/sitemap/<n>.xml`; кеш і теги ревалідації — ті самі; 409 → свіжий індекс. Склад sitemap і SEO-матриця не змінились.

| Перевірка sitemap | Результат |
|---|---|
| синтетичний каталог (110 020 URL) | індекс 1,1 с, **5 частин** (24 162 / 24 237 / 24 237 / 24 237 / 13 147 URL, кожна ≤ 1,5 MiB, 0,17–0,32 с); SKU строго за зростанням, без дублів; об’єднання = колишній єдиний export |
| інтеграційні (`catalog-sitemap.int-spec.ts`, +4) | об’єднання частин = один документ; поділ за кількістю й за байтами; 409 за іншої ревізії й за перевищення меж; SKU, створений між індексом і частиною, — рівно в одній частині |
| стенд, production-збірка FE 9100 → API 9002 (новий `dist`) | індекс — 1 частина, 321 URL; `/sitemap.xml` 200 `application/xml`, **330 URL** (8 статичних + `/catalog` + 3 категорії + 14 лендінгів + 304 товари), без дублів; `/sitemap/0.xml` побайтово той самий, `/sitemap/1.xml` і `/sitemap/x.xml` — 404; robots.txt → `/sitemap.xml`; головна й `/catalog` 200. Знімок даних стенда до перевірки → після: 0 відмінностей у документах (додався лише індекс `status_1_promo_percent_1_price_1`, який API створює при старті); знімок і збірку видалено |

### 4. Заміри D06, яких бракувало

**Переміщення** (`tree-ops.mjs move`, справжній API, журнал, синтетичний каталог, купа 400 МБ; опубліковані — великі товарні
категорії по 1 025 SKU між опублікованими групами й назад):

| Операція | n | p50 | p95 | max |
|---|---|---|---|---|
| створення чернетки | 32 | 776 мс | 827 мс | 1 080 мс |
| переміщення чернетки | 30 | 757 мс | 1 008 мс | 2 630 мс |
| переміщення опублікованої | 30 | 740 мс | 781 мс | 805 мс |

Ціль ≤ 2 с p95 — **досягнута**; після операцій усі опубліковані вузли на своїх місцях. **Знайдено й виправлено:** до зміни API
падав з OOM після ~56 операцій (кожна операція двічі читала всі 10 000 повних документів категорій; жива купа між серіями
при цьому стабільна ~95 MiB — витоку немає); з купою 2 ГБ p95 був 0,72–0,77 с, але RSS 877 MiB. Тепер знімок записувача
потоковий. Побічне: аварійне завершення процесу посеред операції лишає gate у `writing` (by design — відновлення оператором);
синтетичну базу перегенеровано.

**Stress** (`large-fixture.cjs --shape=chain:20000 | wide:150000`, `tree-ops.mjs reads`, усі сторінки курсорів):

| Читання | chain 20 000 (купа 400 МБ) | wide 150 000 (купа 2 ГБ) |
|---|---|---|
| публічне дерево, усі сторінки | 20 стор., макс. 173 KiB, 1,2 с ✓ | 150 стор., макс. 183 KiB, 148 с ✓ |
| адмінське дерево, усі сторінки | 20 стор., макс. 216 KiB ✓ | 150 стор., макс. 226 KiB ✓ |
| children кореня / найглибшої категорії, корені | ✓ | 150 стор. ≤ 183 KiB ✓ |
| найглибша категорія (slug / id) | 1 757 KiB (19 999 предків) ✓ | 2 KiB ✓ |
| товар у найглибшій категорії | 1 758 KiB ✓ | — (порожня категорія) |
| каталог категорії / кореневої групи / весь каталог | ≤ 14 KiB ✓ | ≤ 13 KiB ✓ |
| sitemap (індекс + частини) | 1 частина, 1 339 KiB ✓ | 1 частина, 387 KiB ✓ |
| старий список `GET /categories` | 1 757 KiB ✓ | **247 МБ ✗** |
| пам’ять | пік RSS 527 MiB (macOS) | з купою 400 МБ — **OOM**; з 2 ГБ — жива купа 730 MiB, пік RSS 3 ГБ |

Кожне читання на wide ~1 с (відбиток 150 000 категорій на запит). На chain 20 000 до змін розбір дерева будував предків
для кожного вузла — O(вузли × глибина) = 2·10⁸ записів; тепер предки обчислюються за потреби.

### 5. Знахідки поза переліком

- `GET /categories` (старий v1-список усіх товарних категорій з визначеннями) — **17,7 МБ** на 10 000 категорій; його читала
  головна вітрини лише заради зображення «Філаменту» (Data Cache такий запис не зберігає). Виправлено у FE: головна читає
  `/categories/slug/filament` (той самий URL і теги, що сторінка категорії), повний список — лише запасний шлях, як і раніше.
  Адмінські форми (товари, лендінги, прайс-лист) ще читають повний список.
- Шапка «Каталог» рендерить усе публічне дерево в серверному HTML кожної сторінки, а лічильники гілок бере з фасета категорій
  усього каталогу, який BE віддає лише до 100 товарних категорій (обмеження 28.10): понад 100 товарних категорій усі гілки
  мають 0 і шапка падає на статичні посилання. Потрібен дизайн навігації великого каталогу (ліниве меню, лічильники гілок) —
  не змінювалось, HTML-розмір не заміряно.
- Сторінка товару шукала категорію перебором свіжої копії списку товарних категорій; тепер — за id зі спільного знімка.

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів: **26 виконано в межах** (B/F — локально), 2 у роботі (D02, D08), 3 частково (D06, F11, R01),
4 заплановано (D07, R02–R04). Змінено: **B05 → «Виконано: локально»** (весь каталог p95 305 мс, sitemap частинами); **D06
лишається частковим** з точною причиною: пік процесу 518 MiB задає генерація фіду при старті на 100 000 SKU; stress wide
150 000 — непагінований старий список категорій (247 МБ) і ~730 MiB розібраного дерева; предки в деталі без окремого
пагінованого читання. F10 доповнено (sitemap index).

### Перевірки коду

| Перевірка | Результат |
|---|---|
| BE unit | 98 suites, **1 509 passed + 1 todo** (нові: `catalog-listing-page.spec.ts` 4, `category-fingerprint.spec.ts` 2), відомі RBAC-спеки цього разу пройшли |
| BE integration | 42 suites, **425 passed** (+9: `public-catalog-split.int-spec.ts` 5, `catalog-sitemap.int-spec.ts` +4). Два попередні повні прогони мали по одному різному нестабільному збою (`catalog-routes` ×2 — під час паралельних unit/vitest/збірки FE; `category-draft-placement` ×1 — 404 замість 503 до виклику записувача), кожен окремо 3/3 і в третьому повному прогоні — зелений |
| тести скриптів | 14 passed |
| BE typecheck / ESLint змінених файлів / Prettier | чисто (крім наявної в `dev` помилки типу в `auth.controller.refresh.spec.ts`) / 0 / так |
| FE | 100 файлів, **910 passed** (`sitemap-files.test.ts` замість `sitemap.test.ts`: /sitemap.xml один файл і індекс, файли частин, 404, 409 → свіжий індекс); typecheck; production-збірка (`/sitemap.xml` і `/sitemap/[part]` — dynamic route handlers) |
| OpenAPI | експортовано (`/catalog/sitemap` — індекс, `/catalog/sitemap/part`) |

### Межі

Усе локально; production не змінювали. Не зроблено: потокова генерація Google-фіду (пік 518 MiB на 100 000 SKU), пагінація
старого `GET /categories` для адмінських форм, легке мемо дерева для 150 000 вузлів, окреме пагіноване читання предків,
навігація шапки для понад 100 товарних категорій. Синтетичні бази, контейнер, локальний образ і тимчасові API видалено/
зупинено; одноразові секрети й env-файл контейнера видалено.

## 2026-10-30 — залишок D06: потоковий фід, вузьке читання категорій, легке мемо, предки, навігація

Production, `fillando-prod` на 27019, API 9001, еталон `fillando_rehearsal_20261027` і робоча копія не змінювались.
Child-репозиторії на початок сесії: власник нічого не комітив (HEAD = `dev` = `origin/dev` в обох, після `git fetch`),
роботу продовжено поверх робочого дерева, тож окремих регресій `dev` не проганяли. Синтетичні бази
`fillando_load_20261030[_plain|_wide|_chain]` на 127.0.0.1:27019 (`large-fixture.cjs`); API для замірів — Linux-контейнер
зі стадії `builder` Dockerfile (`node:24-alpine`, `--cpus=4 --memory=1g`, `NODE_OPTIONS=--max-old-space-size=400`,
`RUN_CRON=false`, одноразові JWT/внутрішній токен), VmHWM — `/proc/1/status`, скидання — `clear_refs`; діагностика купи —
`--inspect` (жива купа після GC, heap snapshot, `process.memoryUsage()` щосекунди). Хост: macOS, Apple M1 Pro, 10 CPU,
32 ГБ; MongoDB 8.0.30 у Docker Desktop. **Фікстуру доповнено:** 3 фото на SKU і довший опис (`--images`, `--description`),
тож усі 100 000 SKU — справжні позиції фіду, як у мігрованого філаменту (бренд v2 — видима характеристика «Виробник»,
`feed-typed-adapter.ts`; коментар там виправлено); `--description=short --images=0` відтворює фікстуру 29.10. План
залишку — Plan-0010 §4, «Залишок D06» (D06.1–D06.6).

### D06.1 Потоковий Google-фід

Робочий набір — курсор (`$sort {sku}` перед `$lookup`, партії по 100), XML стискається gzip під час побудови
(`FeedArtifact {gzip, bytes, generatedAt}`), GET віддає ті самі байти з тими самими заголовками (явний `Content-Length`,
без chunked і `Content-Encoding`), виключення — перші 500 за SKU + `excluded_count` / `excluded_by_reason` (адмінка
показує «Показано перші N з M»; старий BE читається як раніше). Перевірка штампа, відмова за 0 позицій, черга повтору,
сигнал оновлення, генерація при старті й щогодини — без змін. Визначення v2 — пакетно на кожну партію рядків
(`contentOf(…, {cache: false, of})`, ≤ 500 одночасно).

| Перевірка | Результат |
|---|---|
| тест рівності `feed-streaming.int-spec.ts` (змішаний набір: v1/v2, прихована гілка, кольорова й числова осі, акції безстрокові/з датою/завершені/без вигоди, нульові/від’ємні/відсутні залишки, усі причини виключення, лендінги v1 і typed для `product_type`, продажі, 588 позицій) | XML нового генератора = старому (масив + старий читач категорій + `buildFeedXml`) **побайтово при тому самому моменті генерації**, той самий summary; через HTTP ті самі байти й заголовки |
| стенд `fillando_catalog_local_v2` (301 позиція) | до/після — однаковий XML, крім дат генерації; той самий набір заголовків; зберігається 126 216 Б gzip замість 1 935 379 Б |
| Linux, генерація при старті (100 000 позицій, 198 МБ XML → 5,6 МБ gzip) | **49 с, VmHWM 313 MiB** (29.10: 518 MiB при нулі позицій); на фікстурі форми 29.10 (позицій 0, відмова) — 329 MiB |
| Linux, генерація при старті + 10 паралельних читань 5 хв | **VmHWM 450 MiB** (ціль ≤ 512), фід під навантаженням 153 с, усі 30 035 відповідей 200; дорогою: 563 MiB (партії по 500) → 493–534 (партії по 100, розкид прогонів) → 484 (легке мемо) → 450 (спільна топологія) |
| що задавало пік (inspector на піку 513 MiB) | купа 280 MiB (зайнято 175–220), ArrayBuffer-и 50–100, ~160 нативного; жива купа після GC у спокої — 105–125 MiB, з них десятки МБ — продубльовані рядки визначень 10 000 категорій у мемо (`multi-select` ×29 401…), 17 MiB — внутрішній буфер BSON драйвера |

### D06.2 Вузьке читання категорій

`GET /categories/options` (публічне): видимі товарні категорії старого списку в його порядку без вмісту —
`{_id, name, slug, kind, attribute_contract_version, order, image, attribute_count}`, сторінки ≤ 1 000 (~200 КБ), курсор
прив’язаний до ревізії й знімка списку. Новий FE не читає старий список: селекти й списки адмінки — `useCategoryOptions`,
характеристики вибраної категорії — `GET /categories/:id` (`useCategory`/`useCategories`; форми товару пересівають
обов’язкові характеристики лише після завантаження саме вибраної категорії), прайс-лист, головна (запасний шлях —
перший елемент options). Скрипти: `release-verify.mjs` — сторінки options, `load.mjs`/`facets.mjs` — `/categories/slug/filament`
(працює і на старому BE), `tree-ops.mjs reads` — options замість старого списку (старий — лише з `LEGACY_LIST=1`, не рахується).
**Старий `GET /categories` без змін для старого production FE до R04** (OpenAPI: «legacy list»); тепер розбирається на кожен
виклик (не мемо) — 17,7 МБ на 10 000; на 150 000 у купу 400 МБ не вміщається і з приймання stress виключений.

| Перевірка | Результат |
|---|---|
| `category-tree-read.int-spec.ts` | сторінки options = старий список (набір, порядок, id/назва/slug/порядок/зображення/кількість характеристик); курсор: зміна вмісту без ревізії → 409, нова ревізія → 409, чужа область → 400; публічне дерево без зайвих полів |
| wide 150 000 | усі 150 сторінок options ≤ 190 KiB, 3,1 с |

### D06.3 Легке мемо, спільна топологія й відбиток O(1)

- **Відбиток O(1)** `collectionWriteMark`: `$collStats` (лічильники записів + count) + UUID колекції + `processId` сервера,
  ~1 мс; повний прохід `$toHashedIndexKey` — запасний шлях. **Зонд на MongoDB 7 і 8** (окремий клієнт пише):
  мітку змінюють insert, update (також без змін і без збігу), replace, findAndModify, bulkWrite, delete, drop + create,
  rename поверх, `$out`; **`$merge` у колекцію не змінює жодного лічильника** — такий запис видно після спливання мемо
  (`CATEGORY_MEMO_MS` = 60 с). Те саме обмеження має мітка SKU тоталів лістингу (29.10).
- **Спільна топологія** (`category-topology.ts`): одне потокове читання розміщення всіх категорій на з’єднання (перевірки
  `projectCategoryTree` на місці, без `toArray()` і копій `CategoryTree`), з якого будуються всі подання: публічне й
  адмінське дерево, options, легкі вузли публічного читача. **Публічний читач** тримає лише топологію; вміст (визначення,
  SEO, презентація, зображення) — на вимогу за id, LRU 500 категорій на мемо, пакетні проходи (фід, PDF, старий список) — повз
  кеш. Споживачі переведено на легкі вузли/`contentOf`; область групи — обхід піддерева. **Свідома зміна шляху помилки:**
  категорія з вмістом, що не розбирається, валить лише читання, яким потрібна саме вона (раніше — усі читання каталогу);
  старий список, що розбирає всі, лишається fail-closed.
- **Sitemap без `$in` видимого дерева**: слаги — за діапазоном з фільтром видимості в JS, непорожні категорії — групуванням
  усіх активних SKU, `updatedAt` — лише для перелічених, лендінги — за наборами v1/v2 після lookup (~600 000 ObjectId на індекс
  при 150 000 категорій раніше). Експорт той самий.

| Перевірка | Результат |
|---|---|
| `category-public-read-parity.int-spec.ts` (заморожена копія старого читача `__former__/`) | деталі (`findById`/`findBySlug`/`findVisibleById`), старий список, легке дерево — побайтово ті самі на змішаному дереві; приховані/архівні/невідомі id — 404; LRU повертає ті самі об’єкти, пакетний прохід — повз кеш; одне читання топології обслуговує читача, обидва дерева й options |
| той самий спек, інвалідація | журнал (`updateDetails` опублікованої), legacy Mongoose (`CategoryService.update`), CLI/сирий скрипт на окремому клієнті — updateOne, updateMany, replaceOne, findOneAndUpdate, bulkWrite, delete + insert, drop + create, rename, `$out`: наступне читання бачить запис одразу; `$merge` — після 60 с (перевірено з підміною годинника) |
| `category-topology.spec.ts` | приймає й відкидає те саме, що `projectCategoryTree` (9 видів некоректних даних), той самий порядок обох аудиторій |
| `catalog-sitemap.int-spec.ts` (+1) | «дрейф» SKU у групу, сирота, SKU прихованої категорії, лендінги v1, typed з/без пінів, legacy-піни на v2 — як старий `$in` |
| стенд, 87 відповідей (sitemap і частини, старий список, кожна категорія за id/slug/children, лістинги з двома сортуваннями, весь каталог, прайс, вітрина, лендінги, 60 деталей товарів, пошук) | до/після — **0 відмінностей**; дані стенда до/після — 26 колекцій / 742 документи без відмінностей (знімок видалено) |

**Навантаження 10 000 / 100 000 (Linux, 10 паралельних, 5 хв, після генерації фіду; VmHWM скинуто):**

| Прогін | дерево p95 | весь каталог p95 | група p95 | категорія p95 | товар p95 | VmHWM | запитів |
|---|---|---|---|---|---|---|---|
| 29.10 (фікстура без фото) | 172 | 305 | 227 | 308 | 173 | 392 MiB | 17 718 |
| 30.10, фікстура форми 29.10, легке мемо | 49 | 335 | 173 | 323 | 101 | 353 MiB | 31 418 |
| 30.10, фікстура з фото, до легкого мемо | 197 | 500 | 264 | 360 | 198 | 442 MiB | 16 186 |
| **30.10, фікстура з фото, остаточний код** | **44** | **299** | **157** | **316** | **91** | **340 MiB** | 32 701 |

Усі відповіді 200. Цілі TD §6 (дерево ≤ 500, каталог ≤ 1 000, RSS ≤ 512) — з запасом. Порівняно з 29.10 за тієї ж
закритої моделі навантаження (10 воркерів) пропускна здатність у 1,8 раза вища; p95 категорії +8…15 мс і весь каталог на
фікстурі форми 29.10 +30 мс — при p50 115 проти 187 мс (у межах розкиду прогонів).

**Stress wide 150 000 (купа 400 МБ, `tree-ops.mjs reads`):** спершу OOM на сторінках публічного дерева (три окремі копії
топології), потім на «весь каталог»/sitemap (перебудова топології давала пік купи ~640 МБ з 195: сирі рядки + копії
`CategoryTree`) → потокова побудова й sitemap без `$in`. **Остаточно: усі 14 читань — 200, без OOM, VmHWM 458 MiB**,
найбільша відповідь 387 KiB (частина sitemap), сторінка дерева ≤ 226 KiB; публічне дерево — 150 сторінок за 4,0 с
(29.10 — 148 с з купою 2 ГБ), адмінське 3,3 с, options 3,1 с, весь каталог 0,4 с, індекс sitemap 0,4 с. З купою 2 ГБ
жива купа після всіх читань — 195 MiB.

### D06.4 Предки

Деталь категорії (`/categories/:id`, `/slug/:slug`) і товару (`category_path`) вбудовує шлях до 1 MiB JSON — побайтово як
раніше (тест рівності вище). Далі — без обрізання: `ancestors: []` + `ancestors_paged` + `ancestors_total` (товар:
категорія сама + `category_path_paged` + `category_path_total`); повний шлях — `GET /categories/:id/ancestors` (корінь першим,
≤ 1 000 на сторінку, курсор прив’язаний до ревізії й хешу шляху). FE читає його на сервері (`loadCategoryAncestors`) для
крихт і `BreadcrumbList`; сторінка товару отримує шлях окремим пропом.

| Перевірка | Результат |
|---|---|
| int-spec, ланцюг 20 000 × назви 200 символів | деталь ≤ 2 MiB з позначкою (total 19 999); 20 сторінок ≤ 2 MiB, разом = шлях, який старий читач вбудовував (> 8 МБ); середина ланцюга — без позначки, побайтово як раніше; перейменування предка або нова ревізія → 409, сміття → 400, невідома → 404, корінь — порожній шлях |
| int-spec товару (2 500 груп × 200 символів над «Електротоварами») | `category_path` = категорія + позначка, відповідь ≤ 2 MiB; на звичайній глибині позначки немає |
| FE | `loadCategoryAncestors` (сторінки, одна ревізія), `ProductPage` (1 500 предків у крихтах і BreadcrumbList; звичайна глибина без змін) |
| stress chain 20 000 × 200 символів (Linux, 400 МБ) | усі 15 читань — 200; деталь найглибшої — 2 KiB з позначкою; предки — 20 сторінок ≤ 455 KiB (1,2 с); товар — 5 KiB; VmHWM 290 MiB |

### D06.5 Навігація шапки понад 100 товарних категорій

**Замір до рішення (production-збірка FE проти синтетичного API, 10 000 категорій):** поточний код — фасет порожній, шапка
падає на «Філамент», **на `/catalog` 0 плиток категорій** (навігація каталогу зламана), сторінки 64–301 KiB; повне дерево
(ліміт фасета піднято лише для заміру) — ~2,3 МБ HTML на кожну сторінку (10 040 посилань). **Рішення власника 30.10:
«два рівні в HTML».** Реалізовано: лічильники — `GET /products/catalog/v2/category-counts` (фасет усього каталогу тим самим
конвеєром без межі 100, кеш за деревом і міткою SKU ≤ 60 с, сторінки ≤ 20 000); до 150 посилань — усе дерево, як було; понад —
розділи + підгрупи (≤ 30 на гілку, «Усі (N) →»), глибше — ліниво з `GET /api/catalog-nav/<id>` (панель і мобільне меню);
дерево будується ітеративно; плитки отримують вузли без нащадків.

| Перевірка | Результат |
|---|---|
| BE `public-catalog-split.int-spec.ts` (+2) | лічильники = фасет категорій усього каталогу (дрейф, сироти, приховані гілки, чернетки; і через єдину агрегацію); 130+ категорій — фасет порожній, лічильники повні; сторінки = цілому; запис SKU → 409 |
| FE (vitest +9) | поріг 150 і обрізання, ліниве розкриття в панелі й мобільному меню, маршрут `/api/catalog-nav`, лічильники зі сторінок і запасний шлях на фасет, ітеративна побудова = рекурсивній, ланцюг 20 000 |
| 10 000 категорій після | кожна сторінка **230–470 KiB**, 240 посилань категорій; `/catalog` 298 KiB з 20 плитками, група — 10 плиток; рівень меню з `/api/catalog-nav` — 1,9 КБ |
| стенд (production-збірка до/після, 5 сторінок) | HTML шапки ідентичний; сторінки — ті самі байти, крім ідентифікатора збірки; на `/catalog` видимий HTML той самий, пейлоад плиток коротший на 236 Б |

### D06.6 Нестабільні інтеграційні тести — причина знайдена

**Збір:** 8 дійсних повних прогонів (Node 24.4, `--runInBand`, нічого важкого паралельно): 4 зелені, 3 — по 1–2 збої
(`typed-product`: 404 на щойно вставлений товар; `typed-landing`: 404/400), 1 — зависання `public-storefront` (7 тайм-аутів
по 30 с, «Jest did not exit»). Окремо: `typed-landing` 1/55, `typed-product` 0/15, `public-storefront` 0/12. Виключено:
спільні тестові бази (усі 45 назв `connectTestDb` унікальні), чужі клієнти 27018 (вибірка `lsof` кожні 0,5 с у 3 прогонах —
лише jest і його дочірні процеси CLI), ліміт дескрипторів (`ulimit -n` 1 048 576), стан тестової Mongo (чистий контейнер —
3/4 зелені, збої лишились).

**Діагностика в справжньому прогоні:** `GET` типізованої чернетки → **404 з порожнім тілом** (Nest так не відповідає),
у сусідньому прогоні — **401 замість 503** у спеку з тестовою авторизацією за заголовком: запит обслуговує не той сервер.

**Причина (доведено детерміновано):** supertest дає не прив’язаному серверу Nest `listen(0)` — це адреса-шаблон `::` — а
з’єднується з `127.0.0.1:P`. На macOS слухач на `::` може отримати порт P, який **інший процес на машині вже слухає на
127.0.0.1**, і запит дістається тому процесу (зонд: наш сервер слухає `::P`, запит на `127.0.0.1:P` → `404 ""` від чужого
процесу). На машині розробки багато локальних серверів (Docker-проксі, IDE, інші інструменти), а повний прогін — тисячі
`listen(0)`, тож колізія рідкісна, але регулярна; вона ж дає `socket hang up` і «вічні» запити. Це пояснює й збої 29.10
(«resolve повертає {}», «401 замість 403», «404 замість 503»). Попутно доведено другий механізм того самого класу:
keep-alive глобального агента (Node ≥ 19, модуль `http` спільний для всіх наборів процесу) — запит до нового сервера на
тому самому порту обслужив закритий сервер.

**Виправлення інфраструктури тестів** (`test/jest.setup.ts`, задокументовано в BE CLAUDE.md): кожен тестовий застосунок
Nest після `init()` слухає `127.0.0.1` (ОС не видає порт, зайнятий там іншим процесом), supertest його лише перевикористовує,
`app.close()` набору закриває; keep-alive глобального агента вимкнено. Продуктовий код не змінювався.

| Серія | Результат |
|---|---|
| лише keep-alive вимкнено (піднабір 286 тестів × 10) | 2 збої з 10 (`socket hang up`, порожня відповідь) — не причина |
| **прив’язка до 127.0.0.1**, Node 24.4, повний × 6 | **5 × 454/454**, 1 — аварія процесу (див. нижче), тестових збоїв 0 |
| **прив’язка до 127.0.0.1**, Node 24.11.1, повний × 4 | **4 × 454/454** — разом з виправленням 9 повних прогонів без жодного тестового збою (до нього — 4 з 8 прогонів зі збоями) |

**Окремий дефект середовища:** тричі за день процес jest на хостовому **Node v24.4.0** падав із SIGSEGV усередині збирача
сміття V8 (`ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers` у MarkCompact; звіти `~/Library/Logs/DiagnosticReports/
node-2026-10-30-*.ips`), без тестових збоїв перед аварією. На Node 24.11.1 (і 24.22 в образі) аварій не було. Рекомендація:
оновити хостовий Node 24 (локальне середовище; у коді змін не потребує).

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів: **27 виконано в межах** (D06 і B/F — локально), 2 у роботі (D02, D08), 2 частково (F11, R01),
4 заплановано (D07, R02–R04). Змінено: **D06 → «Виконано: локально»** (усі підпункти D06.1–D06.6 закрито з цифрами вище).
F11 і R01 не змінювались.

### Перевірки коду

| Перевірка | Результат |
|---|---|
| BE unit | 99 suites, **1 527 passed + 1 todo** (нові: `category-topology.spec.ts` 11; доповнено фід, конверт XML, RBAC маршрутів options/предків) |
| BE integration | 44 suites, **454 passed**; з виправленою інфраструктурою — 9 повних прогонів без збою, після остаточної редакції `jest.setup.ts` ще 5 (3 + 2 контрольні), кожен 44 / 454 без збою; нові/доповнені: `feed-streaming`, `category-public-read-parity`, `category-tree-read` (options), `public-catalog-split` (лічильники), `catalog-sitemap`, `public-storefront` (позначка шляху) |
| тести скриптів | 14 passed |
| BE typecheck / Prettier змінених файлів | чисто (крім наявної в `dev` помилки типу в `auth.controller.refresh.spec.ts`) / так |
| FE | 104 файли, **930 passed**; typecheck; production-збірка (тричі: синтетичний API до/після, стенд до/після) |
| стенд, фінальний `dist` (знімок даних до → після) | 87 відповідей — **0 відмінностей** з ранковим знімком (без `revision`/`epoch`); фід — той самий XML, крім дат генерації (301 позиція, 126 215 Б gzip); дані — 26 колекцій / 742 документи без відмінностей; знімок видалено |
| OpenAPI | експортовано (`/categories/options`, `/categories/{id}/ancestors`, `/products/catalog/v2/category-counts`; старий `GET /categories` — «legacy list») |

### Межі

Усе локально; production не змінювали. Обмеження, що лишаються свідомо: `$merge` у `categories` (і в `product_variants` для
тоталів лістингу) лічильникам не видно — такий запис потрапляє в читання після спливання мемо (60 с); старий `GET /categories`
лишається для попереднього FE до R04 і на 150 000 категорій у купу 400 МБ не вміщається. Хостовий Node v24.4.0 має дефект GC
V8 (аварія процесу jest) — рекомендовано оновити Node на машині розробки. Контейнер, образ, синтетичні бази
(`fillando_load_20261030*`), env-файл, одноразові секрети, ADMIN-кука й тимчасові FE-збірки видалено; тестову Mongo 27018
перезапущено чистою (одноразова, tmpfs).

## 2026-10-31 — аудит прогалин виконаного обсягу

**Обсяг:** усе, що в плані «Виконано» (D01, D03–D06 з D06.1–D06.6, B01–B11, F01–F10, F12), і кодова частина F11. Вісім
напрямів, кожен окремим аудитором лише на читання: (a) критерій ↔ код ↔ тест; (b) контракт API ↔ `openapi.json` ↔ FE
zod; (c) документи між собою й з кодом; (d) інваріанти покупця й Merchant; (e) шляхи запису, gate, журнал, RBAC;
(f) крайові випадки нових маршрутів (запити `curl` на стенд 9002, лише GET); (g) FE-споживачі, SSR-кеш, доступність
меню; (h) гігієна змінених файлів. Кожну знахідку перевірено вручну (код + тест або запит) перед правкою; знахідки без
доказу відкинуто. Порядок правок — P1 → P3, спершу тест, що падає. Усе локально: робоче дерево поверх `dev`
(BE `848bd84`, FE `c29d172`), незакомічене; production, API 9001, `fillando-prod` на 27019 й еталон репетиції не
чіпали; замовлень не оформлювали. **Статуси пунктів не змінювались** (усі правки — у межах уже виконаних пунктів).

### Знайдено й виправлено

| # | P | Знайдено (доказ) | Виправлено | Тест | Лишилось |
|---|---|---|---|---|---|
| 1 | P1 | `execute` журналу відмовляє на своїй попередній перевірці (ціль змінилась між збереженням плану й виконанням — Prom sync «перевірив gate, потім пише») **до** першого доменного запису, але writers уже позначили `started` і не звільняли gate: `catalog_control` лишався `writing`, усі читання каталогу й checkout — 503 до ручного втручання | `CatalogWriteGate.afterFailedWrite` — єдиний шлях збою всіх 15 writers: до `execute` як раніше; після — звільнення за `writes_started: false` (CAS), інакше `recovery_required` | `catalog-mutation-journal.int-spec` «a writer that fails» (3); `typed-product-published.int-spec` «releases the catalogue…» — без правки `phase: writing` | — |
| 2 | P1 | Перерване після запису збереження нової адмінки (збій процесу, verify, публікації) не мало шляху відновлення в production: `requireRecovery` ніде не викликався, CLI відновлення — лише для власних запусків міграції/staging (TD-0013-catalog-mutations §3 вимагає операторський CLI) | `fillando-be/scripts/catalog-recover.cjs inspect\|resume\|rollback` (local / `--production` + `--writers-stopped` + типізоване підтвердження, без друку токена; перевірка всіх цілей і дерева перед відкриттям gate; запуски міграції відхиляє); рунбук §5 | `catalog-recover-cli.int-spec` (5, production-режим на тестовій Mongo), `catalog-cli-target.test.cjs` (+1) | репетиція на Railway/Atlas — R01 |
| 3 | P1 | Створення категорії не перевіряло зарезервовані шляхи (`checkout`, `catalog`, `products`, `faq`…) і старі адреси інших сутностей; лендінг — старі адреси (`catalog_routes`); перевіряла лише зміна slug. Нова сторінка на старій адресі мовчки гасила її 301 (FE шукає перенаправлення лише на 404) | `reservedCategorySlug` (спільний із зміною slug) + `catalog_routes` при створенні → 409 `ROUTE_PATH_RESERVED`/`ROUTE_PATH_TAKEN`; лендінг (нова адреса) → `LANDING_SLUG_TAKEN` (власна стара адреса дозволена, незмінна не перевіряється) | `category-tree-writer.int-spec` (падав: «resolved instead of rejected»), `typed-landing.int-spec` (+1) | — |
| 4 | P1 (латентно: ≥ 2 сторінки дерева, `ancestors_paged`) | Обхід курсором на вітрині не перезапускався після 409: сторінка 1 старої ревізії лишалась у Data Cache до години (правка товару/лендінгу/кольору змінює ревізію, але не чистить тег `categories`), наступна сторінка — 409 на кожен рендер → усі сторінки каталогу 500, `/api/catalog-nav` 500 | `walk()` у `catalog-tree.server.ts`: повтор усього обходу один раз з `cache: 'no-store'` на 409 або змішану ревізію; другий збій кидає | `catalog-tree.server.test` (6 нових, падали) | — |
| 5 | P2 | Стеля FE 100 сторінок × 200 = 20 000 вузлів: понад неї всі сторінки каталогу 500 (D06 міряв FE на 10 000, 150 000 — лише читання BE) | дерево сторінками по 1000 (максимум BE), бюджет 1000 сторінок, як у предків | `catalog-tree.server.test` | FE на 150 000 не міряли |
| 6 | P2 | 39 операцій, змінених Plan-0010, втратили 2xx в OpenAPI (додані декоратори помилок вимикають типову відповідь Nest; на `dev` були) | `@ApiOkResponse()`/`@ApiCreatedResponse()`; курсорні читання документують 400/404/409/503, `/routes/resolve` 400/503, `/storefront-settings` 503; `CategoryPublicDto` — `ancestors_paged`/`ancestors_total` | `spec:export`: лише ці 39 порожніх 2xx + документація помилок; partner-специфікація та сама | дрібні коди адмінських маршрутів (b3) |
| 7 | P2 | Публікація, лендінг, вітрина, SEO, presentation, relations не просили перебудову фіду: наступний GET фіду — 503 `CATALOG_FEED_STALE` (Merchant може бути першим) | `finishPublication` → `feedRefresh` для completed/aborted/rolled_back | `catalog-mutation-journal.int-spec` (падав) | — |
| 8 | P2 | Редирект точного збігу з лендінгом губив `gclid`/`utm_*` (інші редиректи їх зберігають; матриця: «зберегти атрибуцію»); сторінка поза межами — 308 на 404 | `landingRedirect` + `trackingQuery`; без редиректу за `not_found` | `typed-filters.test` (падав); стенд: `/filament?polymer=PLA&gclid=abc` → `/filament/pla?gclid=abc`, `?f.polymer=PLA&page=50` → 404 | — |
| 9 | P2 | `g:product_type` типізованих лендінгів — за legacy `filters`: лендінг нової адмінки (`filters: {}`) не типізував, перезакріплений мігрований — за застарілими пінами | піни `filters_v2.attributes` (значення / числовий діапазон) проти `attributes_v2` + осі; лендінг з неатрибутними пінами не уточнює тип | `product-type.resolver.spec` (+3, падали); `feed-streaming` (фікстуру `avr-63` виправлено на дійсну форму) | — |
| 10 | P2 | (знайдено тестом B09) товар зі списку добірки: видалення → 503 «потребує перевірки» (відмова журналу не розпізнавалась контролером) | перевірка добірок у власній перевірці writer → 409 `PRODUCT_IN_USE`; FE-повідомлення називає добірку | `typed-product-published.int-spec` (падав: 503) | загалом: інші відмови журналу в `fail()` контролерів → 503 |
| 11 | P2 | 13 нових контролерів без RBAC-специфікації (RBAC.md — «review blocker») | одна таблична специфікація з метаданих Nest: 45 маршрутів — публічний список (4) або ADMIN (401/403, сервіс не викликано) | `catalog-admin.controller.rbac.spec` (58) | — |
| 12 | P2 | throttle `catalog/v2` і `category-counts` без тесту й рядка §4a | + | `product.controller.throttle.spec` (+2), RBAC `PUBLIC_GETS` (+1) | — |
| 13 | P2 | `redirectIfMoved` без тесту | + | `moved-route.server.test` (4) | — |
| 14 | P2/P3 | Лінива гілка меню: без `aria-controls`, без `role=status`/`alert`, без повтору; під час повтору показувалась стара помилка; модульний кеш протікав між тестами | `aria-controls`/`id`, `aria-busy`, `role=status`/`alert`, «Спробувати ще», повтор при повторному розкритті | `navigation-large.test` (+2, падали) | — |
| 15 | P3 | Категорія, прихована між деталлю й предками, → 500 замість 404; `/api/catalog-nav` при збої BE — голий 500 | `loadCategoryAncestors` → `null` → `notFound()`; 503 `{links: []}` + `no-store` | `products/[slug]/page.test` (+2), `route.test` (+1) | — |
| 16 | P3 | `category-counts` приймав `limit=0x2`, `1e3` (`Number()`) | суворий формат, як у лістингу | `public-catalog-split.int-spec` (+6 значень) | — |
| 17 | P3 | dry-run міграції перевіряв 8 MiB, але не межу журналу 500 цілей — `apply` падав би `INVALID_PLAN` | `PLAN_MAX_TARGETS`/`PLAN_MAX_BYTES` з журналу в обох | `catalog-release-cli.int-spec` (+1) | `catalog-stage.cjs` (лише репетиція) — літерали |
| 18 | P3 | Заморожена копія `__former__` для тесту потрапляла в production `dist` | `tsconfig.build.json` exclude | `yarn build` — каталогу немає в `dist` | — |
| 19 | P3 | Мертвий код: попередній планувальник маршрутів (`buildCatalogRoutePlan`/`resolveCatalogRoute`, схема `/catalog/...`, якої немає), `createDefinition`, невикористані типи BE/FE, `categoriesListSchema`, зайвий `export` | видалено разом зі специфікаціями; нормалізацію шляхів і зарезервовані корені покрито | — | — |

Тести, які змінено через нову поведінку: `typed-product.int-spec` (3) і `typed-product-create.int-spec` (4) відкочували
перерване збереження **старим** токеном; тепер операція `recovery_required`, і тести відкочують протоколом оператора
(`claimRecovery → adoptRecovery → finishRecovery`), як CLI. Тест «rollback refuses a concurrent edit» до того проходив
з хибної причини (втрата володіння) — тепер перевіряє саме `RECOVERY_CONFLICT` під час адопції.

### Знайдено, не виправлено (причина)

- **Порожні лендінги в sitemap** (матриця: «sitemap: ні»): потрібен підрахунок товарів кожного лендінгу в sitemap —
  нові залежності модуля й вартість на великому каталозі проти бюджетів D06; публікувати порожній лендінг не дає
  перевірка запису, тож зараз таких немає. Плитки «0 товарів» — те саме.
- **Два перенаправлення** для перенесеної категорії зі старим форматом фільтрів (`/{old}?polymer=PLA` → `/{new}?…` →
  `/{new}/pla`; матриця — один): потрібні визначення й лендінги цілі в `redirectIfMoved`; рідкісне поєднання.
- **Бренд у фіді проти сторінки**, коли є і brand-сутність, і «Виробник»: латентно (бренди поза обсягом).
- **Бар’єр читання** `/routes/resolve` і `/storefront-settings` охоплює лише дерево; 503 без `Retry-After`.
- **OpenAPI дрібне**: коди адмінських v2-маршрутів, опис `filters` без `product_ids`, список типізованих лендінгів
  обрізається на 500 без позначки, однакові імена DTO (`CategoryAncestorDto`, `CategorySeoDto`), `legacy_target_product_id`
  optional; slug категорії `ancestors` не читається через `/categories/slug/ancestors` (збіг з `/:id/ancestors`).
- **Тести, яких бракує**: FE `typed-route` з `ancestors_paged` (завантажувач і сторінка товару покриті), головна й
  `CartSidebar` (F11, код), адмінські E2E матриці §5 (питання 14).
- **Гігієна**: дублі констант 1000/200, 24/12 між BE і FE; розбіжність `catalog-presentation.mapping.json` і
  `presentation` міграції (staging — лише репетиція); порт 19101 у трьох файлах. Великий режим меню: підсвітка
  «Каталог» і авторозкриття мобільного — лише для посилань, що є в HTML. Дотик по шеврону на Android (не перевірено).

### Питання власнику

1. **`g:item_group_id` для товару з одним SKU** (D04: не відправляти; код відправляє, на стенді 11 груп). (а) Як у
   матриці — прибрати; Merchant перегляне 11 позицій; (б) змінити D04. **Рекомендую (а) разом із релізом R02.**
2. **Зміна одиниці використаної числової характеристики** — документи суперечать (план §7 і api-transition: «перетворення
   або 409»; catalog-mutations §332: «одиниця без перерахунку»), код дозволяє з попередженням (тест чекає 200). (а) 409
   без плану перетворення; (б) лишити й виправити документи. **Рекомендую (а)** — інакше «1000 кг» у картці й фіді.
3. **Стара адреса SKU губить query** (ISR-сторінка без `searchParams`). (а) proxy для `/products/*`; (б) route handler;
   (в) задокументувати. **Рекомендую (в)** — зміна slug SKU рідкісна, Merchant перечитує фід.
4. **Межі ціни/діапазонів звужуються іншими фільтрами** (legacy — уся категорія, TD-0008 §4 F7). (а) повернути межі
   категорії; (б) лишити. **Рекомендую (а)** — паритет і задокументоване правило.
5. **24 товари на сторінку замість 12** — проіндексовані `?page=14` і `?limit=36` стануть 404. (а) 308 `page=N →
   ceil(N/2)`, `limit=36 → 48`; (б) повернути 12; (в) прийняти 404. **Рекомендую (а).**
6. **Фокус клавіатури відкриває панель «Каталог»** — Tab проходить усі посилання панелі (задокументовано як намір).
   (а) відкривати лише наведенням і шевроном; (б) лишити й додати «пропустити меню». **Рекомендую (а).**
7. **Публікація категорії з понад 500 SKU** відмовляє (`PUBLICATION_TOO_LARGE`, не задокументовано). (а) публікація
   частинами; (б) задокументувати межу. **Рекомендую (б) для першого релізу.**
8. **Очищення кешу вітрини best-effort** (TD §4 — outbox з ACK). (а) outbox; (б) записати відхилення (до 1 год
   застарілості). **Рекомендую (б) зараз, (а) після релізу.**
9. **TD-0013 → Approved?** M0 закрито, крім D02.
10. **Що перемикає R02** за варіантом A (адреси не змінюються, реєстр B07 порожній) — рунбук §6 каже «поза релізом».
11. **Назви категорій унікальні** (TD дозволяє дублі) — **рекомендую** записати відхилення для першого релізу.
12. **Sitemap без throttle** (повний прохід SKU на запит). (а) обмеження з винятком внутрішнього токена; (б) лишити.
    **Рекомендую (а).**
13. **Безпека в OpenAPI** (cookie-JWT не описано — конвенція до Plan-0010): описувати чи ні.
14. **Матриця §5**: для частини рядків доказ — ручні сценарії R01, не E2E. **Рекомендую** прийняти R01 + vitest/int
    для першого релізу, адмінські E2E — після.
15. **Canonical архівного SKU**: TD-0013 — «не додавати», тест TD-0006 §5.4 — зберігати (як legacy). **Рекомендую**
    прибрати (noindex + canonical — суперечливі сигнали).

**Тексти головної, FAQ, опту й оферти (F11, D07 — контент власника, не змінювались):** головна —
`fillando-fe/src/app/(root)/page.tsx` (title/description), `_home/Hero.tsx`, `_home/ValueProps.tsx`, `_home/BrandStrip.tsx`
+ `common/constants/brands.constants.ts` (виробники філаменту), запасне фото героя (`Home.tsx:15`); опис сайту за
замовчуванням — `common/constants/seo.constants.ts:5`; FAQ — `faq/page.tsx`, `faq/faq.constants.ts`; опт —
`wholesale/page.tsx`; оферта — `offer/page.tsx`; запасне посилання меню «Філамент» — `navigation.constants.ts:48`.

### Документи

BE: `CATEGORY_TREE.md` (розділ аудиту, позначки застарілого), `CATALOG_ROUTES.md`, `MERCHANT_FEED.md`, `RBAC.md`,
`API_AND_SWAGGER.md` §4a, `scripts/README.md` (CLI відновлення, `local-catalog-workspace.cjs`), `CATALOG_RELEASE.md`,
`ORDER_ADMIN_API.md`. FE: `general-catalog.md` (розділ аудиту), `http-service.md`, `cache-revalidation.md`, `CLAUDE.md`,
`e2e/README.md`, коментарі `revalidate/route.ts`. Meta: план (рядок статусу, D05/F06/D06.5, примітка до §5), FRD,
TD-0013 (статус, §4.4), SEO-матриця (301/308, приклад, відхилення), API transition (30.10 і 31.10), catalog mutations
(розділ аудиту), domain model, рунбук (§5 — відновлення перерваної операції; повні команди `inspect`/`rollback`),
README репетиції (`db-compare.cjs`, `MOVES`, `ADMIN_COOKIE` для `reads`), індекси.

### Перевірки коду

| Перевірка | До аудиту (baseline) | Після |
|---|---|---|
| BE unit | 99 suites, 1 527 passed + 1 todo | **100 suites, 1 573 passed + 1 todo** |
| BE integration (`--runInBand`) | 44 suites / 454 (2 прогони) | **45 suites / 467 — три повні прогони поспіль без тестових збоїв на остаточному коді** (65 с кожен; ще три зелені — до останньої правки лендінгу); двічі процес jest падав SIGSEGV у GC хостового Node 24.4.0 (відомий дефект середовища, не тест; один раз — до першого набору) — перезапущено; проміжний прогін показав 7 справжніх падінь старих тестів відкату старим токеном — виправлено (вище) |
| Тести скриптів (`node --test`) | 14 | **15** |
| FE vitest | 104 файли / 930 | **105 файлів / 945** |
| tsc | FE чисто; BE — лише наявна в `dev` помилка `auth.controller.refresh.spec.ts` | те саме |
| Prettier змінених файлів | — | чисто (лише змінені рядки) |
| FE production-збірка (проти стенда, тимчасовий каталог) | — | успішно, 46 сторінок; `tsconfig.json` не змінено; збірку видалено |
| `yarn spec:export` | побайтово = файлу | змінено лише ці 39 2xx + документацію помилок; повторний експорт стабільний; partner-специфікація та сама |
| Стенд: дані `fillando_catalog_local_v2` до → після | — | **26 колекцій / 742 документи — 0 відмінностей** |
| Стенд: 110 відповідей API (дерево, options, предки, діти, лістинги ×2 сортування, весь каталог, лічильники, прайс-лист, вітрина, лендінги, 60 товарів, пошук, resolve, sitemap, фід) | — | **0 відмінностей, крім фіду: 1 рядок — дата початку акції = час генерації** |
| Стенд: 30 адрес вітрини (статус, редирект, canonical, robots, title, JSON-LD, sitemap, robots.txt) | — | **3 очікувані відмінності**: атрибуція в редиректі на лендінг (×2), сторінка поза межами — 404 замість 308 на 404 |

Знімки стенда видалено після порівняння; тестова Mongo 27018 — лише системні бази.

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів не змінилось: **27 виконано в межах** (D06 і B/F — локально, не production), 2 у роботі (D02,
D08), 2 частково (F11, R01), 4 заплановано (D07, R02–R04).

## 2026-10-31 — рішення власника за аудитом

Відповіді власника на 15 питань аудиту (вище, «Питання власнику»). Усе — лише локально, у робочих деревах
`dev` обох репо, не закомічено й не production; статуси пунктів плану не змінювались. Для кожного рішення —
окремий diff; безпека в OpenAPI (13) — окремим набором змін.

| № | Рішення | Що зроблено | Доказ |
|---|---|---|---|
| 1 | `g:item_group_id` лише для товару з більш ніж одним активним варіантом | `findGroupedProductIds` (агрегат активних SKU за товаром), `BuildItemContext.inGroup`; MERCHANT_FEED.md без примітки про відхилення; матриця §4 | `feed.service.spec` («sends g:item_group_id only for a product with more than one active variant»), builder spec, `product-variant.repository.int-spec`, `feed-streaming.int-spec`; стенд: 11 товарів з одним SKU втратили групу (301 → 290), решта фіду без змін |
| 2 | Зміна одиниці характеристики зі значеннями в ≥ 1 товарі/SKU — 409 до запису з лічильником; без значень — дозволено | `DEFINITION_UNIT_LOCKED` у `category-definition-change.ts`; FE блокує поле одиниці з поясненням і показує відмову сервера з лічильником; catalog-mutations §11, api-transition розділ 4, план §7 узгоджено | `category-definitions-published.int-spec` (вага → 409 з usage; ключ без значень → 200), `category-draft-placement.int-spec`, `category-definition-change.spec`; FE `CategoryDefinitionsEditor`, `category-tree.utils` тести |
| 3 | 308 зі старого slug SKU не зберігає query — лише документувати | матриця, рядок «Старий URL»; MERCHANT_FEED.md; FE general-catalog.md | — (код не змінювався) |
| 4 | Межі ціни й числових характеристик — по всій категорії, незалежно від інших фільтрів | окремі `$facet`-гілки меж без звуження; обраний діапазон і лічильники не змінено | `public-catalog.int-spec` («keeps the price and number bounds of the whole category under any filter (TD-0008 §4 F7)», межі обчислено з бази за правилом legacy) |
| 5 | Перехідно: `?page=N` поза діапазоном → 308 на ⌈N/2⌉, якщо існує, інакше 404; `?limit=36` → 48 | `LEGACY_LIMIT` у `typed-filters.ts`, `typed-indexing.ts`; датований рядок матриці (переглянути після D02) | `typed-filters.test` (+2, обидві гілки); стенд: `?page=20` → `?page=10`, `?page=27` → 404, `?limit=36` → `?limit=48`, `?limit=36&page=2` → `?limit=48&page=2`, `?page=26&gclid=q` → `?page=13&gclid=q` |
| 6 | Панель «Каталог» — наведенням або шевроном, не фокусом | `CatalogMenu.tsx`: без `onFocus`, pointer-події без дотику; Escape повертає фокус на шеврон; рунбук, чек-лист В — перевірка дотику на Android | `CatalogMenu.test` (фокус не відкриває; Escape з панелі → фокус на шевроні; дотик відкриває один раз) |
| 7 | Межа 500 записів журналу — задокументувати; 409 з лічильниками | `PUBLICATION_TOO_LARGE` з `{skus, limit}`; FE-повідомлення з обома числами; catalog-mutations, рунбук §6 | `category-publication.int-spec` (502 SKU → 409 `{skus: 502, limit: 499}`, нічого не записано); `category-tree.utils.test` |
| 8 | Без outbox: повтор очищення (3 спроби з паузою), warn зі списком адрес; секрет `/api/revalidate` — у D08 | `StorefrontRevalidationService` (повтор лише без статусу, 429 і 5xx), STOREFRONT_REVALIDATION.md, catalog-mutations §4, рунбук §3.10 | `storefront-revalidation.service.spec` (3 спроби → один warn з адресами; успіх на повторі; 401 без повтору) |
| 9 | TD-0013 → Approved після внесення рішень 1–15 | TD-0013 §4.6 (перелік рішень), §4.1, §4.5, §5, §6 («Що TD-0013 замінює»); матриця, api-transition («Owner decisions»), catalog-mutations; designs/README, docs/README, план (D02 — baseline даних) | — (документи) |
| 10 | R02 — порядок рунбука §3; нічого не перемикається; реєстр B07 порожній | план (R02, «Порядок релізу»), рунбук §6, TD-0013 §5, api-transition розділ 4 | — (документи) |
| 11 | Назва категорії унікальна глобально — відхилення першого релізу | api-transition розділ 1, TD-0013 §4.1 | Перевірено: нова адмінка показує «Така назва або адреса вже існує.» — зрозуміло, але без назви конфліктної категорії й без уточнення, що збіглося; код не змінювався |
| 12 | Throttle `/catalog/sitemap` і `/part` з винятком внутрішнього токена | `@UseGuards(ThrottlerGuard) @Throttle` (10 за хвилину), 429 у OpenAPI; API_AND_SWAGGER §4a | `catalog-sitemap.controller.throttle.spec` (без токена понад ліміт → 429 з `Retry-After`; з токеном — без ліміту, обидва маршрути) |
| 13 | Безпека в OpenAPI: три схеми, cookie — типова, кожен маршрут має одну з чотирьох позначок | `src/common/swagger/openapi-document.ts` (позначки з guards), `main.ts`, `export-spec.ts`; `openapi.json`: 42 публічні, 127 cookie, 5 partner, 0 internal, 0 без позначки; partner-специфікація не змінилась; API_AND_SWAGGER §6, BE CLAUDE.md | `openapi-document.spec` (4); Swagger UI (headless): `GET /categories/tree` → 200 без замка, `GET /categories/admin/tree` → 401 із замком, кнопка Authorize є |
| 14 | Докази R01 — того виду, що заявлено в §5 | план тестів і оцінка нижче; тести не написано (за рішенням — спершу план) | — |
| 15 | Архівний SKU: 200, `noindex,follow`, Discontinued, без canonical; title, `og:url`, `offers.url` без змін | `products/[slug]/page.tsx` `generateMetadata`; TD-0006 §5.4, матриця | `page.test.tsx` (архівний — без canonical, `og:url` = канонічна адреса; активний — canonical є) |

Внутрішній токен (13) не вимагає жоден маршрут: він лише звільняє від лімітів за IP, тому схему оголошено, але
вона ніде не обов’язкова. Канонічну назву cookie `access_token` взято з `docs/runbooks/env-template.env` (рунбук
релізу значення не називає).

### План тестів для доказів R01 (рішення 14) — на погодження, тести не написано

Стан: справжній BE у браузерних тестах є лише в `playwright.categories.config.ts` (BE `test/category-workspace-server.ts`,
одноразова база на 27018, адмін — заголовок `x-test-role`). Там найглибший рівень — 3, опубліковано рівні 1–2, крихти — до 2,
меню шапки не перевіряється; майстра перетворення в E2E немає; замовлень, фіду й очищення кешу сервер не має, а `/auth/me`
завжди повертає адміна (гостьовий кошик неможливий). Тести наявного файлу залежать від порядку — нові йдуть окремими файлами
з власними даними.

**Спільна основа (≈ 1,5–2 дні).**
- BE, лише тестовий сервер: `OrderController`/`OrderService` з репозиторіями, `OptionalJwtAuthGuard` перевизначено;
  `EmailService` замінено записувачем (жодного виклику Resend — лист не може піти нікуди); `FeedController`/`FeedService`;
  `StorefrontRevalidationService` з `FRONTEND_URL` тестової вітрини й тестовим секретом, однаковим в обох процесах (не з `.env`);
  `/auth/me` — адмін лише із заголовком `x-test-role`, інакше 401 (і `/auth/refresh` 401); тестові `GET /__e2e/emails`
  (записані листи) і `/__e2e/purges` (запити очищення, з перемикачем «затримати»).
- FE: другий конфіг (`playwright.release.config.ts`) — вітрина production-збіркою (`next build && next start`, окремий
  `NEXT_DIST_DIR`), бо лише так перевіряється ISR-кеш сторінки, як на проді; `e2e/real-api.ts` — сидування через адмінський API
  (ланцюжок категорій, типізований товар, публікація) замість вбудованих у spec шаблонів.
- Доставка «Самовивіз» + «Готівка»: без Нової пошти й LiqPay.

| Рядок §5 | Тести | Оцінка |
|---|---|---|
| Категорія на 5+ рівні | Адмінка: створити 4 групи й товарну категорію на рівні 5 (позначка «рівень 5»), опублікувати з одним товаром; перемістити піддерево так, щоб категорія стала на рівень 6 — адреса та сама. Вітрина: панель «Каталог» (шеврон і наведення) веде до рівня 5/6; крихти категорії й товару — повний ланцюжок, збіг із `BreadcrumbList` JSON-LD; після переміщення крихти оновлені. Додатково — лінивий режим меню (понад 150 посилань, сид у старті сервера) | 1 день (+0,5 — лінивий режим) |
| Товарна категорія → група | Сид: опублікована товарна категорія, 3 товари / 5 SKU. (а) Перетворення без плану → відмова в адмінці (`CATEGORY_IN_USE`), через API — нічого не змінилось. (б) Майстер «Перетворити на групу з розподілом товарів»: нові підкатегорії, розподіл, виконання → категорія — група, усі товари й SKU з тими самими ID/SKU/slug і цінами в підкатегоріях; вітрина групи показує всі товари нащадків, адреси товарів 200. (в) Застарілий план (товар додано після плану) → 409 і зрозумілий текст | 1–1,5 дня |
| Товар без варіантів | Товар `variant_axis: null`, один SKU: картка в лістингу (ціна, без кольору), сторінка без перемикача й суфікса осі, JSON-LD — одна пропозиція без кольору; кошик гостя → checkout «Самовивіз»/«Готівка» → справжній `POST /orders` → сторінка успіху; у базі рядок замовлення з тим самим SKU й ціною; лист записано, не надіслано; у фіді — без `g:color` і `g:item_group_id` | 0,5–1 день |
| Ціна/акція/наявність | E2E: товар з акцією (стара/нова ціна, дата завершення) і обмеженим залишком — однакова ціна в картці, на сторінці, в JSON-LD, кошику, підсумку checkout і створеному замовленні; SKU без залишку — кнопка недоступна, `OutOfStock` у JSON-LD, `out_of_stock` у фіді. Integration (рішення власника): адмін змінює ціну через типізований writer → BE просить очищення кешу (`/__e2e/purges`) → без перезапуску вітрина віддає нову ціну в картці, на сторінці й у JSON-LD, фід після перебудови — та сама ціна; контроль — поки очищення затримане тестовим перемикачем, сторінка віддає стару ціну (кеш справді працює, тест перевіряє саме очищення). Плюс BE int-spec у звичайному integration-наборі: зміна ціни writer’ом → `/products/by-slug`, картка `/products/catalog/v2`, позиція фіду рівні | 1,5 дня |
| Колонка «Доказ» | Фактичний вид із посиланням на тест; `e2e/README.md`; три зелені прогони поспіль | 0,5 дня |

**Разом:** ≈ 10–12 браузерних тестів і 1 BE int-spec, ≈ 1 200–1 600 рядків тестів і тестової обв’язки; 5–7 робочих днів
із стабілізацією. Прогін нового конфігу — ≈ 6–9 хв (збірка вітрини ≈ 2 хв); лише послідовно, не разом із BE integration чи
`playwright.categories.config.ts` (спільна Mongo 27018). Код продукту не змінюється; якщо тест знайде дефект — окремим
виправленням із тестом.

Що потребує рішення власника перед написанням:
1. **Лист замовлення** — рекомендую замінити `EmailService` записувачем у тестовому сервері: замовлення проходить
   справжній шлях (залишок, суми, номер), лист не може піти нікуди. Альтернативи з рішення 14: перехопити `POST /orders`
   у браузері (сервер замовлення не перевіряється) або надсилати лише на `SERVICE_EMAIL`.
2. **Режим вітрини для кешу** — рекомендую production-збірку (як ISR на проді); dev-сервер дешевший, але кеш сторінки в
   ньому інший.
3. **Лінивий режим меню** (понад 150 посилань) — рекомендую включити: саме так працюватиме великий каталог.

### Перевірки коду (після рішень 1–15)

| Перевірка | Після аудиту 31.10 | Після рішень |
|---|---|---|
| BE unit | 100 suites, 1 573 passed + 1 todo | **102 suites, 1 587 passed + 1 todo** |
| BE integration (`--runInBand`) | 45 suites / 467 | **45 suites / 470 — три повні прогони поспіль, без збоїв і без SIGSEGV** |
| Тести скриптів (`node --test`) | 15 | **15** |
| FE vitest | 105 файлів / 945 | **105 файлів / 951** |
| tsc | FE чисто; BE — лише наявна в `dev` помилка `auth.controller.refresh.spec.ts` | те саме |
| Prettier змінених файлів | чисто | чисто для файлів рішень; два файли, раніше додані власником до індексу (`fillando-be/scripts/local-catalog-workspace.cjs`, `fillando-fe/e2e/helpers.ts`), не відформатовано — не змінювались |
| FE production-збірка (проти стенда, тимчасовий каталог) | 46 сторінок | **успішно, 46 сторінок**; `tsconfig.json` не змінено; збірку видалено |
| `yarn spec:export` | стабільний | **стабільний** (повторний експорт побайтово = файлу; partner-специфікація та сама) |
| Стенд: дані `fillando_catalog_local_v2` до → після | 0 відмінностей | **26 колекцій / 742 документи — 0 відмінностей** |
| Стенд: 110 відповідей API | 0, крім дати акції у фіді | **лише фід: 11 товарів з одним SKU без `g:item_group_id` (301 → 290 груп) + дата початку акції = час генерації** |
| Стенд: 37 адрес вітрини | — | **3 очікувані відмінності (рішення 5):** `?page=20` 404 → 308 `?page=10`; `?limit=36` 404 → 308 `?limit=48`; `?limit=36&page=2` 404 → 308 `?limit=48&page=2`; `?page=27` лишився 404 |

Знімки стенда видалено після порівняння.

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів не змінилось: **27 виконано в межах** (D06 і B/F — локально, не production), 2 у роботі (D02,
D08), 2 частково (F11, R01), 4 заплановано (D07, R02–R04).

## 2026-11-01 — докази R01 за рішенням власника 14 (локально)

Вибір власника 01.11 (з плану тестів вище): лист замовлення — записувач замість `EmailService` (замовлення
проходить справжній шлях, лист не може піти нікуди); вітрина — production-збірка (`next start`); лінивий режим меню
— включити. Код продукту не змінювався; лише тести й тестова обв’язка.

**Набір.** `fillando-fe/playwright.release.config.ts` запускає `fillando-be/test/release-e2e-server.ts` — увесь
`AppModule` на одноразовій базі `fillando-test-release-e2e` (27018), підмінено лише автентифікацію (заголовок
`x-test-role`), `EmailService` (записувач) і ліміти запитів; тестові маршрути `/__e2e/emails`, `/__e2e/purges`
(+ затримка очищення), `/__e2e/large-menu` (151 категорія з одним SKU). Вітрина — `next build` у `.next-e2e/release`
і `next start`; `REVALIDATE_SECRET`/`INTERNAL_API_TOKEN` — тестові значення конфігу, не `.env`. Фікстури — через
адмінський API (категорії, характеристики, типізовані товари, публікація). Опис — `fillando-fe/e2e/README.md`.

| Рядок §5 | Тест | Що доводить |
|---|---|---|
| Категорія на 5+ рівні | `e2e/release/catalog-depth.spec.ts` (2) | створення в адмінці до рівня 5 (позначка «рівень 5»), публікація, меню шапки до рівня 5, крихти й `BreadcrumbList`; переміщення в адмінці до рівня 6 — адреси ті самі, крихти й меню нові; лінивий режим (понад 150 посилань): у HTML два рівні, гілки до рівня 5 відкриваються на вимогу |
| Товарна категорія → група | `e2e/release/category-conversion.spec.ts` | без плану — 409, нічого не змінено; план із втратою значень не виконується (кнопки немає); застарілий план відхилено (в адмінці й через API); виконаний план: категорія — група, цільові категорії під нею, кожен SKU з тим самим id/SKU/адресою/ціною/статусом, вітрина групи показує всі товари нащадків, адреси товарів 200 |
| Товар без варіантів | `e2e/release/checkout.spec.ts` | картка, сторінка без перемикача й суфікса осі, одна пропозиція JSON-LD без кольору, кошик, checkout «Самовивіз»/«Готівка», справжній `POST /orders` 201, рядок замовлення з тим самим SKU і ціною, лист записано, позиція фіду без `g:color` і `g:item_group_id` |
| Ціна/акція/наявність | `e2e/release/checkout.spec.ts`, `e2e/release/price-purge.spec.ts`, `fillando-be/src/modules/product/typed-price-consistency.int-spec.ts` | акція 20 %: 720 у картці, на сторінці, в JSON-LD, кошику, checkout і замовленні, у фіді `g:price` 900 і `g:sale_price` 720; SKU без залишку — без кнопки, `OutOfStock`, `out_of_stock`; зміна ціни адміном → картка, сторінка, JSON-LD і фід рівні після очищення; контроль — поки очищення затримане, серверний HTML production-збірки віддає стару ціну, а фід уже нову; BE: деталь, картка `catalog/v2` і фід рівні до акції, з акцією і після її зняття, очищення `products` запитано |

**Перевірки.** Release E2E — три прогони поспіль, кожен 6/6 (≈ 1,4 хв тестів + збірка вітрини ≈ 1 хв). BE int-spec 1/1;
BE integration — 46 suites / 471 (перший запуск цієї сесії не дав виводу — результат не бачив; повтор із записом у
файл зелений). tsc: FE чисто; BE — лише наявна помилка `auth.controller.refresh.spec.ts`. Prettier — нові TS-файли;
`e2e/README.md` не форматувався й до цієї правки, тому весь файл не переформатовано. `tsconfig.json` FE збіркою не змінено.

**Знахідки (код не змінювався).**
- **Крихти товару без «Каталог».** Сторінка категорії: «Головна › Каталог › …», сторінка товару була «Головна › … ›
  товар» (і в `BreadcrumbList`). **Рішення власника 01.11 — додати; виконано:** `ProductPage.tsx` додає «Каталог» →
  `/catalog`, коли шлях прийшов із публічного дерева (як `typed-route.tsx`); `ProductPage.test.tsx` (+1, 2 оновлено),
  release E2E перевіряє точні крихти товару до й після переміщення — 6/6.
- **Застарілий план у майстрі** відхиляється як «Каталог уже змінився. Оновіть дерево перед наступною зміною.»
  (конфлікт ревізії), до перевірки самого плану не доходить; з актуальною ревізією й старим `plan_id` — 409
  `CONVERSION_PLAN_*`. Дані не змінюються в обох випадках.
- **Сторінка товару після гідрації перечитує API** (React Query): покупець бачить нову ціну й без очищення кешу;
  серверний HTML (Google, Merchant, JSON-LD для ботів) оновлює лише очищення — тест перевіряє саме його.
- **Очищення групуються вікнами по 5 с** (`StorefrontRevalidationService`): після серії записів вітрина сходиться за
  ≈ 10 с після останнього. Один прогін до виправлення тестів показав меню на `/` зі старим деревом одразу після
  переміщення, коли крихти вже були новими; причина не встановлена (підозра — рендер, що прочитав дерево до
  очищення, записав кеш після нього). Окрема діагностика (переміщення, `/` кожні 2 с) — свіже через 2 с; у трьох
  наступних прогонах не повторилось. Тести тепер чекають свіжого серверного HTML до 30 с і впадуть, якщо меню
  лишиться застарілим.
- Позиція фіду потребує характеристики «Виробник» (TD-0006) — товар без неї виключається; фікстури її задають.
- `next start` попереджає про `output: standalone` (прод запускає standalone-сервер); кеш сторінок той самий.
- Старт BE через ts-node — близько хвилини, на завантаженій машині понад 2 хв: тайм-аут старту в конфігу 5 хв.

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів не змінилось: **27 виконано в межах** (D06 і B/F — локально, не production), 2 у роботі (D02,
D08), 2 частково (F11, R01 — лишились репетиції на Railway/Atlas і свіжому дампі), 4 заплановано (D07, R02–R04).

### 01.11 (продовження): крихти, D07, D02

- **Крихти товару** — «Каталог» додано (рішення власника 01.11, вище); FE vitest 105 / 952, release E2E 6/6.
- **D07/F11** — чернетки текстів вітрини: [plan-0010-d07-content-drafts.md](plan-0010-d07-content-drafts.md). Спершу
  потрібне рішення власника, що продаємо в день релізу (лише філамент чи кілька напрямів); незалежно від нього
  знайдено розбіжності між сторінками: FAQ не називає оплату карткою (LiqPay) і накладний платіж (передоплата від
  200 ₴), оферта §4 не називає накладний платіж, «Підтримка 7 днів на тиждень» на головній проти «Пн–Пт,
  9:00–18:00» у контактах, «відправляємо щодня» проти «у робочі дні о 15:00–17:00» в оферті. У код не внесено.
- **D02** — рішення власника 01.11: baseline Search Console/Merchant читається через його Chrome (лише читання).
  Розширення Claude in Chrome ще не підключене — не знято.

Зведення 35 пунктів (перераховано з таблиць): **27 виконано в межах**, 3 у роботі (D02, D07, D08), 2 частково (F11,
R01), 3 заплановано (R02–R04).

## 2026-11-02 — передрелізні виправлення (рішення власника, локально)

Власник 02.11: «перед тим як виходити в реліз, треба все виправити» — усі знахідки аудиту 31.10, три пункти, відкладені
31.10 на після релізу (outbox очищення кешу, публікація частинами, sitemap у пам'яті), і старий борг (tsc, Prettier,
увесь лінт BE). Після релізу лишаються лише однакові назви категорій у різних гілках. Трекер — план §8 (P01–P19);
нічого не закомічено, production і бази стенда не змінювались.

| Стан | Пункти |
|---|---|
| Виконано локально | P01–P10 (P10 — емуляція Android; пристрій — чек-лист В), P12, P13, P14, P16, P17, P18, P19 |
| Виконано локально, перевірка на проді | P11 — код і тести; як проксі Railway веде `X-Forwarded-For`, документація не каже: рунбук §3.10 (`X-RateLimit-Remaining` з двох мереж і запит в обхід Cloudflare) |
| Частково | P15 — причину не встановлено (не відтворилось); закрито відлунням очищення через 10 с (P12) |

**Нове поводження, яке варто знати перед релізом.**
- Очищення кешу вітрини тепер у колекції `storefront_purges` до відповіді 2xx (P12): 401 від різних секретів чи
  недоступна вітрина вже не губить очищення — воно чекає й повторюється (до 5 хв між спробами), warn у лозі.
- Публікація категорії понад 500 записів журналу йде частинами (P13): між частинами категорія лишається чернеткою;
  перервану публікацію завершує повторна.
- Ліміти запитів рахуються на відвідувача за Cloudflare (P11); голова `X-Forwarded-For` більше не читається ніде.
- P19 (знайдено під час P18): cookie з префіксом `j:` давало 500 на `/auth/refresh` і `/auth/logout`.

### Перевірки коду (після §8)

| Перевірка | 01.11 | 02.11 |
|---|---|---|
| BE unit | 102 suites / 1 588 + 1 todo | **103 / 1 598 + 1 todo** |
| BE integration (`--runInBand`) | 46 / 476 | **47 / 484** (+ outbox: доставка, недоступна вітрина, серія, залишок зупиненого процесу, два процеси) |
| Тести скриптів (`node --test`) | 15 | **15** |
| BE tsc | помилка `auth.controller.refresh.spec.ts` | **чисто** |
| BE eslint (`--max-warnings 0`) | 344 помилки, 20 попереджень | **0 / 0** |
| FE tsc / vitest | чисто / 105 файлів, 952 | **чисто / 111 файлів, 970** |
| Prettier змінених файлів (BE, FE) | два файли не відформатовано | **чисто** |
| `yarn spec:export` | — | оновлено (описи P06, P08, P13); повторний експорт побайтово той самий |
| Mock E2E / категорії / release E2E | 12 / 7 / 6 | **12 / 7 / 9** (+ перенесена категорія одним 308, дотик на Android-планшеті й телефоні) — послідовно, без паралельних прогонів |
| FE `tsconfig.json` | = HEAD | **= HEAD** |

Тимчасові збірки (`.next-e2e`, звіти Playwright) видалено; тестова база 27018 без залишків. Порядок прогону —
один скрипт: BE tsc → eslint → unit → скрипти → integration → OpenAPI → Prettier → FE tsc → vitest → Prettier →
mock E2E → категорії → release E2E.

**Знахідки.**
- Release E2E тепер чекає порожнього outbox (`/__e2e/purges` → `pending`), а не 11 с від останнього запиту.
- Більшість `no-unsafe-*` у спеках — від `strictBindCallApply: false` у `tsconfig.json` BE (`bind`/`call`/`apply`
  повертають `any`); конфіг не змінювали, виклики переписано без них.
- Документація Railway не описує `X-Forwarded-For`; Cloudflare-діапазони (22) зафіксовано в коді з датою читання.

### Статуси (перераховано з таблиць плану)

Зведення 35 пунктів §4 не змінилось: **27 виконано в межах**, 3 у роботі (D02, D07, D08), 2 частково (F11, R01),
3 заплановано (R02–R04). Пункти §8 у зведення не входять.

### 02.11 (продовження): реліз одним скриптом (рішення власника)

Власник: «я думав так — оновлюю бек, оновлюю адмін і просто запускаю скрипт міграції»; обрано «один скрипт + коротка PDF».
День релізу — шість кроків: деплой BE → деплой FE → `RUN_CRON=false` → `node scripts/catalog-release.mjs` →
`RUN_CRON=true` → ручні перевірки ([план дня, PDF](../reports/fillando-release-day.pdf), рунбук §3.0). Скрипт викликає
ті самі CLI й зонди, що рунбук §3.4–3.10, у тому самому порядку; секрети — з оточення або прихованого запитання, URI лише
production-командам (до `mongodump` — через тимчасовий файл 0600); стан у `release-state.json`, повторний запуск
продовжує з кроку зупинки; `--revert` — відкат даних + очищення кешу.

**Знахідка в рунбуку:** §3.4 експортував `CATALOG_MIGRATION_URI` перед `backup-manifest`, а та команда відмовляє за
заданої змінної (читає лише локальну копію) — виправлено на `env -u CATALOG_MIGRATION_URI …`; репетиції, вочевидь,
запускали її в іншому терміналі. **Знахідка в `release-check.cjs`:** без `PARTNER_TOKEN` порожні списки partner API з
обох боків давали PASS без перевірки — тепер SKIP, як PDF без cookie.

| Перевірка (копія дампу 27.10, окремий MongoDB 27020 як `fillando-prod`, API з `dist` на фіктивних змінних, production-збірка вітрини) | Результат |
|---|---|
| Повний прогін без partner-токена й cookie | 0–8 зелені: 67 002 документи в маніфесті, dry-run 360 цілей, apply `completed`, `ALL CHECKS PASSED` (5 SKIP partner/PDF), очищення 3 × 200, `enable` `changed`, `seo-status` PASS; менше хвилини |
| `--revert` | `completed`, очищення 3 × 200; документи побайтово = дампу (0 змінених); відрізняється лише індекс `status_1_promo_percent_1_price_1`, який створює сам новий BE при старті, і службові `catalog_*` (за рунбуком лишаються) |
| Повний прогін з partner-токеном і cookie адміна, зупинка на питанні dry-run і продовження з `--expect` | зупинка з кодом 1; повтор пропустив бекап і знімок «до», `dry-run = репетиція В`, `ALL CHECKS PASSED` без SKIP |
| Запуск на вже мігрованому каталозі | зупинка на перевірці перед стартом |
| Запис у каталог після бекапу (імітація Prom sync) | apply: `BACKUP_DOES_NOT_MATCH_CATALOG` до запису, `phase: idle`, стан бекапу скинуто; повтор зробив новий бекап і пройшов |
| Невірний `REVALIDATE_SECRET` | зупинка на очищенні (401) до відкриття адмінки; повтор з правильним — продовжив з очищення |

Тестове середовище видалено (процеси, контейнер 27020, збірка вітрини, архіви з персональними даними, тимчасові бази).
Не перевірено: Atlas і Railway (чек-лист Б) — інша латентність і `mongodump` по мережі.

### 02.11 (продовження): ціль CLI — `DATABASE_URL` з `.env` (рішення власника)

Власник: «її треба брати з енв, тому що там вказана локальна база, а коли настане час зробити це на проді, я просто
підставлю продову БД». `catalog-cli-target.cjs` бере `DATABASE_URL` так само, як застосунок (оточення, інакше
`fillando-be/.env`, пакет `dotenv`); `CATALOG_MIGRATION_URI`, список дозволених локальних назв і заборона
production-URI в `.env` прибрано. Лишились: назва бази в команді = база в URI; віддалений сервер — лише з `--production`
(база `fillando-prod`, набране підтвердження, маніфест перевіреного бекапу); у логах лише хости. `catalog-release.mjs`
показує хост і питає підтвердження, зупиняється, якщо база локальна, а `--api`/`--site` віддалені (чи навпаки), і в кінці
нагадує повернути `.env` на локальну базу. Ризик, прийнятий власником: поки в `.env` production, `yarn start:dev` на
ноутбуці працює з production — у рунбуку §2.4 і в PDF (кроки 3 і 6).

| Перевірка | Результат |
|---|---|
| `node --test scripts/*.test.cjs` (нові випадки: `.env` і оточення, звірка назви, віддалений без `--production`, production-URI у `.env`, `--production` на локальній копії) | 15/15 |
| `catalog-release-cli.int-spec.ts`, `catalog-recover-cli.int-spec.ts` (production-шлях дочірніми процесами, тепер через `DATABASE_URL`) | 2 suites / 11 |
| Запобіжники скрипта релізу без підключення: локальна база + production `--api`; віддалена база + локальний `--api`; інша назва бази; ваш `.env` з відповіддю «ні» | усі чотири — зупинка з поясненням |
| Повний прогін на копії дампу (MongoDB 27020, API з `dist`, production-збірка вітрини) з `DATABASE_URL` і `--revert` | 0–8 зелені за 21 с; відкат `completed`; середовище прибрано |

### 02.11 (вечір): репетиція на свіжому дампі власника

Власник накотив свіжий дамп production у локальну `fillando-prod` (27019; останнє замовлення 02.11 08:11) і доручив
запуск. `node scripts/catalog-release.mjs --api=http://localhost:9001 --site=http://localhost:9000` — його бекенд
(`yarn start:dev`, база з `.env`) і вітрина (`yarn dev`); той самий production-шлях CLI (`--production`, підтвердження,
маніфест бекапу) на локальному сервері. Перед тим read-only dry-run CLI — переданий скрипту як `--expect`.

| Крок | Результат |
|---|---|
| dry-run (свіжий дамп) | 360 цілей; 44 товари (36 з віссю, 8 без), 301 SKU, 14 лендінгів, `{kolir: 36}`, брендів 0, зв'язки 1/1/0 — як на дампі 27.10 |
| Бекап і маніфест | 67 051 документ; каталог 1 / 44 / 301 / 14 / 122 / 0 |
| apply → перевірка | `completed`, `legacy_fingerprint_unchanged`; `ALL CHECKS PASSED` (SKIP: partner — без токена, PDF — без cookie); `phase: idle` |
| Очищення, адмінка, SEO | 3 × 200; `enable` `changed`; `seo-status` PASS; весь запуск — 28 с |
| Після | `/`, `/catalog`, `/filament`, `/filament/pla`, `/admin/categories`, `/admin/products` — 200; старий лістинг — 409 |

Локальні секрети: на локальній базі скрипт бере `INTERNAL_API_TOKEN`/`REVALIDATE_SECRET` з `fillando-be/.env` або працює
без них (локально вони не задані: вітрина поза production приймає очищення без секрету); для віддаленої бази — питає.
Бекап до міграції — `~/fillando-release-20261102/fillando-prod-20261102.archive`; `dry-run.json` там же — очікування для
`--expect` у день релізу, якщо production не зміниться. Лишається з чек-листа В: дотик на справжньому Android.


## 2026-11-04 — B10: правила фіду категорії прибрано, лишилась категорія Google (рішення власника, локально)

Хід рішення того ж дня. Спершу власник попросив явні галочки замість прихованих типових правил: «хай я явно
бачу галочки». Їх зроблено й перевірено, а потім відкликано, бо галочки бренду й кольору дублюють те, що й так
є в назві, а сама логіка лише ускладнює інтерфейс. Остаточно: «хай будується собі з тайтла як і раніше»; ID і шлях
категорії Google лишити. Production не змінювали; нічого не закомічено.

| Що | Результат |
|---|---|
| Адмінка «Google Shopping» | лише ID і шлях категорії Google, підказка «у фід іде лише ID» і «Зберегти»; галочок назви/highlights і полів міток немає |
| API | `GET/PATCH /categories/:id/admin/export` — `{expected_revision, google_product_category}`; `export_rules` у тілі → 400 `INVALID_EXPORT_FIELDS`; OpenAPI оновлено |
| Фід | назва й highlights — одне правило для всіх категорій (категорія + назва + бренд + діаметр і вага за підписом — варіант); мітки `custom_label_0..4` завжди обчислювані; правила категорії білдер не читає |
| Решта | журнал: профіль `export` — лише `google_product_category`; перетворення на групу більше не згадує `export_rules`; використання характеристики — лише «Картка товару»; міграція `export_rules` не пише |
| Локальна `fillando-prod` | записані вранці галочки філаменту (`export_rules`) прибрано; ID 499682 на місці |

**Перевірка на дампі production 02.11** (окрема база, справжній `FeedService`; база потім видалена): фід
legacy-даних старим кодом = знімок релізу 02.11; новий код на legacy-даних — 301/301 побайтово; після `apply`
міграції новим кодом (категорія v2, `export_rules` немає, ID 499682 є) — 301/301; після `revert` — 301/301.
Dry-run — 360 цілей; ця зміна звіт міграції не зачіпає. Але `dry-run.json` від 02.11 для `--expect` однаково
треба зняти заново: він має поле `relations`, якого після прибрання зв'язку рефілу (04.11) у звіті немає
(рунбук §1).

**Тести:** BE unit — 1590 (102 файли), BE integration — увесь набір 474 (45 файлів), усе зелене; `tsc`,
eslint і prettier змінених файлів чисті; FE — `tsc` чистий, тести адмінки категорій 87 (20 файлів).

## 2026-11-05 — F08/B10: дані товару, а не правила категорії (рішення власника, локально)

Власник про блок «Сторінка товару»: «Філамент (пластик для 3D-друку) воно просто в назві товару, його не треба
ніяким чином додатково вставляти»; «я просив міграцією додати в тайтл, все!»; «ти далі зациклився на філаменті
і пробуєш в категорію впихнути те що має стосуватися конкретного товару — провір це». Аудит BE+FE підтвердив
(заголовок фіду з назвою категорії й формулою діаметр/вага, попередження й «помітні значення» як правила
категорії, бренд і матеріал за підписом, highlights лише з філаментних ключів). Власник: «бери все в роботу».
Production не змінювали; нічого не закомічено.

| Що | Результат |
|---|---|
| Назва | міграція (`product_name_addition`) один раз дописує «— Філамент (пластик для 3D-друку)» до назви товару й SKU перед варіацією; SKU не у формі «товар — варіація» зупиняє план; `revert` повертає назви. Сторінка: назва як записана + варіант (title v1 до міграції — як раніше, з назвою категорії) |
| Попередження | `products.purchase_notice` — поле товару; адмінка товару, картка «Попередження перед покупкою»; міграція (`product_notices`) записує попередження про рефіл у рефіл; сторінка відповідає ним як `attribute_notice` |
| Категорія | `presentation` прибрано повністю (ендпоінт, профіль журналу, редактори v1 і v2, `category_presentation`, облік `settings`); таблиця = визначення в їхньому `order` без `visible_in_specs: false`; цей перемикач — лише таблиця сторінки: партнерам, у прайс і PDF характеристика йде, як «Матеріал»/«Виробник» завжди йшли (характеристик-«внутрішніх приміток» більше немає) |
| Бренд і матеріал | `semantic: 'brand'` (одна на категорію, текст або список) і `'material'`; v2-сторінка, фід, прайс і PDF беруть бренд із бренду товару або позначеної характеристики, ніколи за підписом «Виробник»; міграція позначає `vyrobnyk` брендом, `polymer` матеріалом (`semantics`), ховає `material` і `vyrobnyk` з таблиці (`hidden_keys`), ставить порядок (`definition_order`) |
| Фід | `title` = назва SKU; v2 highlights = характеристики таблиці без бренду й кольору; v1 до міграції — як було. `custom_label_0` (філаментні сімейства) і `_3` (пороги 500/1500 ₴) не чіпали — чекають рішення власника |
| Підписи значень | `enum_labels`: `polymer`/`finish`/`reinforcement`/`series` — списки з українськими підписами з колишнього v1 `filter-labels.ts` (у v2 фільтри показували «Silk», «CF», «Basic» сирими); id = збережене значення, тож товари, лендінги й фасети ті самі; таблиця сторінки, партнерам і `g:material` («TPU (Flex)», «PA6 (Нейлон)») — підпис. Дамп 02.11: опцій 7/9/2/4, фід 301/0 виключень, revert побайтово = дампу |
| Один колір | `single_sku_color_key: kolir` + `color_aliases` («Матова веселка» → Rainbow): 5 SKU з одним варіантом без кольору зі словника стають на вісь кольору (назва з кольором, адреса та сама), характеристики «Колір» товару більше немає — у категорії один «Колір» (власник: «чому колір дублюється» → «Так»). На дампі 02.11: 5 SKU, `kolir` відкинуто в 41 товарі, без осі лишились 3 товари без кольору; фід — `g:color` у всіх п'яти; revert побайтово = дампу |
| Злиття значень | `value_aliases` мапінгу: `finish` «Glow» → «Luminous» (власник: «виглядає як дублювання… Бамбулаб більше ніколи не буде поставлено»); на дампі 02.11 — 1 товар, лендінг `glow` закріплює одне значення; legacy-атрибути лишаються образом відкату |
| Реліз | `release-check.cjs` пропускає лише навмисні зміни (допис у назвах і злиття значень — з мапінгу; highlights), PDF — ті самі SKU (текст порівнювати порядково не можна: довші назви переносяться); рунбук і PDF дня релізу оновлено |

**Перевірка на дампі 02.11** (окрема база на тестовій Mongo 27018, потім видалена): dry-run — 360 цілей, 44 товари й
301 SKU перейменовано, 1 попередження; apply з перевірками — зелений; справжній `FeedService` після міграції —
301 позиція, 0 виключень, допис у всіх 301 заголовках, highlights у всіх; `revert` — 20 колекцій / 67 051 документ
побайтово = дампу. `release-check.cjs` на знімках 02.11 (до перейменування) — FAIL лише на двох нових перевірках допису.

**Репетиція на свіжому дампі production 05.11** (власник залив дамп; зі старої локальної бази прибрано шість службових
колекцій, яких у дампі немає — `catalog_*`, `storefront_settings`, `storefront_purges`): `catalog-release.mjs --api=localhost:9001
--site=localhost:9000 --assume-yes` — бекап і його відновлення, знімок «до», dry-run (360 цілей; 44/301 перейменовано, 1 попередження,
злиття Glow→Luminous в 1 товарі, 5 SKU на вісь кольору, списки 7/9/2/4), apply, знімок «після»: **ALL CHECKS PASSED** (partner і PDF —
SKIP без токенів), кеш очищено, записи нової адмінки відкрито, SEO-статуси пройшли; 36 с. Стенд після: назва з дописом, один «Колір»,
попередження на рефілі, підписи «Шовковий (Silk)» у фільтрах і таблиці.

**Тести:** BE unit 1590 (101 файл), BE integration — увесь набір 473 (44 файли), усе зелене; `tsc` і eslint усього BE
чисті. FE — `tsc` чистий, 987/987.
