# TD-0013 — безпечні зміни каталогу (D06)

Дата: 2026-10-23. **Специфікація, затверджена разом із TD-0013 (Approved, 2026-10-31; рішення власника 31.10 — §4, §11, навігація, межа операції); реалізовано й перевірено локально (B01–B04, D06 30.10, аудит 31.10), production не змінено.**
Пов’язано: [API-контракт](TD-0013-api-transition.md), [план](../plans/plan-0010-general-catalog-and-seo.md).

## 1. Обране рішення й межі

Залишаємо поточну standalone MongoDB. Один серіалізований writer для структурних
змін каталогу, persistent journal і короткий бар’єр читання на час застосування.
Не створюємо удавану транзакцію через Promise.all або process-local mutex.
MongoDB гарантує атомарність одного документа; очікуване значення у фільтрі update
дає compare-and-set, але updateMany не є атомарним для всіх документів.
Джерело: [MongoDB — Atomicity and Transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)
(перевірено 2026-10-23). Описаний нижче протокол — наше проєктне рішення.

Компроміс: коротка структурна зміна може тимчасово дати 503 на uncached catalog
reads; довгі міграції виконуються у погоджене вікно. Це не обіцянка zero downtime.
Покупець не отримує напівперенесені категорії. Переходу на replica set цей пакет
не робить; він був би окремою інфраструктурною зміною.

## 2. Стан, ownership та область блокування

Singleton `catalog_control`:
`{_id:"catalog", revision, epoch, phase:"idle"|"writing"|"published"|"recovery_required"|"recovering",
operation_id:null|UUID, owner_id:null|string}`. Створюється контрольованим bootstrap
з unique _id; відсутній control після активації протоколу — fail closed.
Revision збільшується після успішної конфігураційної зміни. Epoch збільшується
при кожному виході з writing, включно з rollback, щоб читач помітив навіть
зміну, яку скасували до завершення його запиту.

CAS idle→writing перевіряє revision і phase; тільки переможець може писати.
Global lock потрібен для category create/update/delete/move/convert,
definitions/options, product create/delete/category/axis/attributes/identity,
landing pins/category, routes, brand/settings та всіх backfill цих полів.
Імпорти, адміністративні PUT і фонові jobs не мають обходити writer.
Пакет B02 не вважається готовим без інвентарю всіх місць запису.

Stock/price/promo updates залишаються окремими atomic field updates: вони не
пишуть category_id, attributes, slug і не замінюють документ цілком.
Checkpoint/rollback ніколи не відновлює весь product/variant документ поверх
нової ціни чи залишку. Order snapshots не змінюються. Delete SKU/product має
також виконати чинні доменні обмеження замовлень/кошика; це не cascade з категорії.

Немає TTL, lease expiry, автоматичного takeover або кнопки «розблокувати».
Heartbeat — діагностика, не доказ смерті writer. owner_id змінюється лише після
контрольованої зупинки всіх попередніх writers, включно з jobs та in-flight DB
командами. Recovery runbook має заборонити старим instances знову підключитися.
Без цього не можна довести, що старий процес не допише після нового.

## 3. Порядок операції та відновлення

1. Створити operation за unique Idempotency-Key: normalized request hash,
   actor, expected_revision, status=pending. Повторний ключ не створює другий запис.
2. Захопити control CAS з operation_id. Якщо зайнято — 409
   CATALOG_WRITE_IN_PROGRESS або стан цього самого operation при retry.
   Stale revision — 409 CATEGORY_REVISION_CONFLICT; жодного domain write.
3. Після захоплення перечитати дерево/залежності, валідувати весь план.
   Записати immutable plan і before/after-images **лише змінюваних полів**,
   expected versions, hashes, детерміновані ID нових документів.
   Великі плани розбиті на journal item документи з unique (operation_id, sequence).
   Manifest із count/hash і status=prepared пишеться після всіх items.
   До prepared domain writes заборонені.
4. Для кожного item: якщо owned fields дорівнюють after-image — вже застосовано;
   якщо before-image — conditional update до after-image; інакше зупинити з
   RECOVERY_CONFLICT. Checkpoint пишеться після write. Збій між ними безпечний:
   повтор визначає виконання за after-image, не за checkpoint alone.
5. Перевірити всі after-images, links, category drift SKU, tree invariants,
   definitions/pins, route uniqueness. Записати durable result/outbox зі статусом
   verified. Жодних side effects до перевірки.
6. CAS control із цим operation_id/owner переводить у published, revision+1, epoch+1.
   Gate ще закритий: ownership/operation_id зберігаються до durable receipt.
   Записати completed/result_revision у operation, тоді CAS published→idle.
   Це точка відкриття читання. Збій між кроками лишає published для recovery,
   а наступна операція не може затерти свідчення публікації.
   Outbox має committed revision; worker не доставляє подію до відкриття gate.
7. Доставити outbox з ідемпотентними retries. HTTP-відповідь
   може загубитися; повтор ключа повертає збережений результат, не виконує move ще раз.

Помилка валідації до domain write звільняє lock з epoch+1 і незмінною revision.
Якщо хоч один write міг відбутися — не звільняти lock у finally; operation
переходить у recovery_required. Збій до prepared дозволяє discard partial plan
після підтвердження відсутності domain writes. Збій після prepared — resume або
rollback за журналом. Якщо control idle і target_revision вже опублікована,
recovery не застосовує after-images повторно: лише завершує bookkeeping/outbox.

Rollback до publication іде у зворотному порядку items, conditional after→before;
вже before — пропуск; третє значення — fail closed. Новостворений документ
видаляється лише за перевіреною identity/owned fields і відсутності нових залежностей.
Після rollback повторно перевірити інваріанти; epoch+1, revision без змін.
Після publication rollback — **нова** компенсуюча операція з новою revision,
не приховане повернення історії. Для URL врахувати вже опубліковані адреси.

Перший recovery — операційний CLI під maintenance, не публічний HTTP endpoint.
Runbook: зупинити й ізолювати writers → backup → визначити operation/phase →
dry-run compare → resume/rollback → verify → відновити processes → smoke.
Невідома divergence не виправляється перезаписом «як у backup».

## 4. Читання, кеші та фід

Обіцянку попереднього draft «readers бачать snapshot» замінено цим точним правилом:
перед dependent read читати control із primary; якщо writing/recovery —
503 CATALOG_MAINTENANCE, Retry-After: 5. Після domain reads повторно прочитати
control. Віддати відповідь лише якщо phase=idle та epoch не змінилася;
інакше відкинути результат і повторити один раз або повернути 503.
Не стримити HTML/JSON до завершення перевірки. Немає stale secondary control reads.

Бар’єр охоплює category/product/landing detail, listings/search/facets, route lookup,
sitemap/feed/price sheet/partner export і checkout-читання змінюваних полів.
Checkout не створює order із напівоновлених даних; окрема платіжна callback-обробка
вже створеного order не залежить від tree lock. Catalog write після завершеного
read не робить відданий узгоджений snapshot помилковим; повної ізоляції цін/stock
цей протокол не додає.

API кеш ключується revision; SEO-залежні Next.js caches/tags invalidated outbox:
categories, old/new ancestor groups, affected products/landings, settings,
sitemap і feed. Publication відкриває тільки перевірені дані; cache purge може
відставати й повторюється до підтвердження. Старі cached сторінки допустимі лише
як повністю завершені попередні версії; зміни public visibility та URL не можна
покладати тільки на best-effort purge: для цих переходів потрібні purge ACK,
перевірка маршруту й maintenance release gate до відкриття нового стану у FE.
Для звичайних move URL незмінні. Feed/sitemap будуються в тимчасовий artifact і
публікуються atomic replace лише після повторної epoch-перевірки.

~~**Відхилення першого релізу (рішення власника 31.10.2026):** outbox і purge ACK не реалізовано; 3 спроби й
warn, застарілість до 1 год.~~ **Outbox з ACK (P12, рішення власника 02.11.2026 — до релізу):** запит на
очищення — документ у `storefront_purges`, один на ресурс (`categories` / `products` / `landings`); його
видаляє лише відповідь 2xx від `/api/revalidate`. Невдача (немає відповіді, тайм-аут 3 с, 401 чужого секрету,
5xx) лишає документ: повтор через 2 с з подвоєнням до 5 хв, warn із переліком сторінок на 3-й і кожен 10-й
спробі. Доставку бере один процес під lease 30 с (два процеси BE не шлють одне очищення двічі); перезапуск BE
чи FE очищення не губить. Вікно 5 с на ресурс лишається, тепер у самому outbox: перший запит — одразу, решта
серії — одним очищенням після вікна. Доставка знімає лише версію, яку несла; запит, що прийшов під час
відправлення, лишається в черзі. **Відлуння (P15):** підтверджене очищення повторюється раз через 10 с — рендер,
що прочитав старі дані до першого очищення й записав кеш після нього, теж застаріває. Без підключеного outbox
(скрипти, unit-тести) або коли сам MongoDB відмовив запису — старий шлях: 3 спроби й warn. Реалізація:
`StorefrontRevalidationService`, `StorefrontPurgeOutbox`; тест `storefront-revalidation.outbox.int-spec.ts`
(доставка й відлуння, недоступна вітрина, серія в одному вікні, залишок після зупиненого процесу, два процеси).

## 5. Конвертація категорії

`POST /categories/:id/conversion-plan` (ADMIN) — read-only dry-run;
`{target_kind, assignments:[{product_id,target_category_id}],
landing_assignments:[{landing_id,target_category_id}], expected_revision}`.
Успіх: `{plan_id,source_revision,hash,counts,warnings}`; payload зберігається
сервером. Клієнт не передає довільні journal writes.
`POST /categories/:id/conversion` із `{plan_id,expected_revision}` та Idempotency-Key
повертає 202 operation. План одноразовий для revision; stale — перепобудова.

Для product→group усі існуючі товари й landings мають рівно одну assignment,
цілі — інші product-категорії з сумісними definitions/pins. Нові leaf-категорії
створюються заздалегідь; після conversion їх можна перемістити під нову group.
Не переносимо definitions на group; зберігаємо before-image у журналі.
SKU отримують category_id свого product. Для group→product спочатку явно
перемістити всіх дітей; порожня group конвертується з новими definitions.
План не передбачає непомітного перенесення чи видалення нащадків.

Delete відхиляє children/products/landings і посилання settings/relations;
невикористана категорія може видалятися лише після перевірки route policy.
Індексований URL не зникає через звичайний delete: archived + явна SEO-рішення
404/410/релевантний redirect за матрицею. Випадкове перенаправлення на головну
не є автоматичною fallback-поведінкою.

## 6. Міграція, індекси та вимірювання

Порядок: backup+restore rehearsal → audit D02 → additive BE/read adapters →
підключити всі writers до gate → backfill root/product/version1 → definitions
mapping → новий FE → v2 по категоріях → окремий URL release. Dry-run нічого не
пише в domain collections; verify порівнює counts/ID/SKU/prices/stock і pins.
Slug global unique зберігається, name unique видаляється після відповідного
оновлення валідаторів/споживачів. Нові індекси: category(parent_id,order,_id),
category(status), product(category_id), variant(category_id,status,_id), unique
route(path), operation(idempotency_key), journal(operation_id,sequence).
Вибір sort/facet індексів за explain на фактичних запитах, не індекс на кожну опцію.
29.10 за explain додано `product_variants {status, promo_percent, price}` — обхід сторінки за ціною
(весь каталог і великі групи); інших індексів дерева не знадобилося.

Не зберігаємо ancestor paths: джерело — parent_id, adjacency map кешується revision.
Traversal ітеративний; список product descendants обчислюється один раз на scope.
Довільна глибина не означає один необмежений HTTP payload.

Початкові **цілі приймання, не результати заміру**: tree page ≤ 500 ms p95,
каталог із facets ≤ 1000 ms p95, peak RSS BE ≤ 512 MiB на fixture 10 000 categories /
100 000 SKU при 10 concurrent reads; move без товарного перенесення ≤ 2 s p95.
Додатковий stress fixture — chain 20 000 і wide 150 000 вузлів для core;
кожен API payload ≤ 2 MiB, oversized detail/ancestors — paginated окреме читання,
не truncation ancestry. Профіль host, indexes, cold/warm, 5-minute run і explain
додаються до evidence; цілі переглядаються тільки з явним записом причини.
Заміри 28.10 (локально, синтетичний каталог, Plan-0010 M0 evidence): дерево p95 198 мс, каталог
категорії/групи p95 513/527 мс — у цілях; весь каталог p95 3,3 с і піковий RSS 703 MiB — ні (причини й
варіанти — там же); move і stress chain/wide не заміряні. Conversion bulk — batches до 500 items;
час maintenance оцінюється dry-run rehearsal, не обіцяється за кількістю документів.

**Рішення для всього каталогу (29.10, за замірами).** Обрано варіант «кеш тоталів/фасетів + позиції
індексом», не денормалізовану колекцію лістингу. Причина: explain показав, що вартість — повний прохід
100 000 SKU з обчисленням ефективної ціни на кожен запит (~230 мс у Mongo + 2 × ~70 мс відбиток категорій),
а сторінку можна прочитати обходом індексу (1–2 тис. документів); денормалізовану колекцію мали б
синхронно оновлювати всі записувачі цін, залишків, статусів і акцій (Prom sync, акції, журнал, CLI,
сирі скрипти), і її узгодженість зі сторонніми записами не доводиться, тоді як кеш тоталів скидається
серверним лічильником записів `product_variants` (`$collStats`, рахує записи будь-якого клієнта), ключем
дерева, фактами області, найближчим завершенням акції й 60 с. Відповіді API не кешуються (рішення
власника). Порядок «в наявності першими» зберігається двома прогонами сторінки; ціна — злиття SKU без
акції (індекс `{status, promo_percent, price}`) з акційними за ефективною ціною; мала область чи глибока
сторінка — колишнє сортування. Рівність із єдиною агрегацією — інтеграційний тест на ~1 000 запитах.

**Результат 29.10 (локально; macOS і Linux-контейнер `node:24-alpine`, купа 400 МБ, 10 паралельних, 5 хв):**

| Ціль | Результат | Стан |
|---|---|---|
| сторінка дерева ≤ 500 мс p95 | 172 мс (Linux) / 159 мс (macOS) | ✓ |
| каталог із фасетами ≤ 1 000 мс p95 | весь каталог 305 мс (Linux; було 3 302), категорія 308, група 227 | ✓ |
| пік RSS ≤ 512 MiB | читання каталогу: VmHWM 392 MiB (Linux) ✓; генерація фіду при старті на 100 000 SKU: 518 MiB ✗ | частково |
| move без перенесення товарів ≤ 2 с p95 | опублікована 781 мс, чернетка 1 008 мс, створення 827 мс (92 операції, купа 400 МБ) | ✓ |
| stress chain 20 000: payload ≤ 2 MiB, пагінація | усі 14 читань ≤ 2 MiB (найбільше — деталь найглибшої категорії/товару з 19 999 предками, 1,76 MiB) | ✓ на фікстурі |
| stress wide 150 000: payload ≤ 2 MiB, пагінація | дерево й children пагіновані (сторінка ≤ 226 KiB), деталі, каталог, sitemap ✓; старий список `GET /categories` — 247 МБ ✗; розібране дерево в пам’яті ~730 MiB (купа 400 МБ — OOM) ✗ | частково |
| sitemap: файл ≤ 50 000 URL, payload ≤ 2 MiB | індекс + частини (110 020 URL → 5 частин ≤ 1,5 MiB) | ✓ |

**Залишок (ціль не переглядається, причини):** (1) пік процесу задає генерація Google-фіду — увесь
робочий набір (100 000 SKU з товаром і категорією) і весь XML у пам’яті процесу; потрібна потокова
генерація (курсор, XML у стиснений буфер/файл). (2) `GET /categories` — список усіх товарних категорій з
визначеннями без пагінації (17,7 МБ на 10 000, 247 МБ на 150 000); головна вітрини його більше не читає,
адмінські форми — ще так. (3) Мемо публічного дерева тримає всі видимі категорії повністю розібраними
(~5 КБ на категорію з визначеннями), а відбиток категорій — повний прохід на кожен запит (~1 с на 150 000):
широке дерево потребує легкого мемо (топологія + вміст на вимогу). (4) Предки в деталі категорії й товару
вбудовуються повністю (1,76 MiB на 20 000 рівнях з короткими назвами): окреме пагіноване читання предків
не зроблене — межа 2 MiB залежить від довжини назв (≈ 3 000 рівнів за назв 200 символів).

**Результат 30.10 — залишок закрито (локально; Linux-контейнер, купа 400 МБ; фікстура тепер з фото — усі 100 000 SKU
є позиціями фіду):**

| Ціль | Результат | Стан |
|---|---|---|
| пік RSS ≤ 512 MiB з генерацією фіду | фід потоковий (курсор, XML у gzip, ті самі байти й заголовки): при старті 49 с, 313 MiB; при старті + 10 паралельних читань 5 хв — **450 MiB**; лише читання — 340 MiB | ✓ |
| каталог/дерево не гірше 29.10 | дерево p95 44 мс, весь каталог 299, група 157, категорія 316, товар 91; пропускна здатність ×1,8 | ✓ |
| stress wide 150 000: без OOM, payload ≤ 2 MiB, пагінація | усі читання `tree-ops reads` — 200, VmHWM 458 MiB, ≤ 387 KiB; старий список `GET /categories` лишається для старого FE до R04 і з приймання виключений, новий FE читає `GET /categories/options` (сторінки ≤ 1 000) і категорію за id | ✓ |
| пагіноване читання предків, без обрізання | `GET /categories/:id/ancestors`; деталь вбудовує шлях до 1 MiB (побайтово як раніше), далі — `ancestors_paged`; chain 20 000 × 200 символів: деталь 2 KiB, 20 сторінок ≤ 455 KiB | ✓ |
| навігація понад 100 товарних категорій | лічильники без межі фасета (`/products/catalog/v2/category-counts`); шапка — два рівні в HTML, глибше ліниво (рішення власника 30.10); панель «Каталог» відкривається наведенням або шевроном, не фокусом — шеврон є кнопкою з `aria-expanded` (Enter/Space відкриває, Escape закриває й повертає фокус на шеврон), закрита панель поза порядком Tab, «Каталог» лишається посиланням на `/catalog` (рішення власника 31.10; дотик на Android перевіряється перед релізом); сторінки на 10 000 — 230–470 KiB | ✓ |

Механізми: **одна топологія категорій на з’єднання** (`category-topology.ts`, потокова побудова з перевірками
`projectCategoryTree`) — з неї всі подання дерева й легкий публічний читач (вміст категорії — на вимогу, LRU 500);
**відбиток O(1)** — `$collStats` + UUID колекції + `processId`; повний прохід лише як запасний шлях. Обмеження:
**`$merge` у `categories` не видно лічильникам** (MongoDB 7 і 8) — такий запис потрапляє в читання після спливання мемо
(60 с); те саме — для мітки SKU тоталів. Свідома зміна шляху помилки: категорія з вмістом, що не розбирається, валить лише
читання, яким потрібна саме вона. Деталі й заміри — Plan-0010 M0 evidence (30.10).

~~D06 ще потребує фактичного реєстру old→new URL із D02, репетиції міграції/restore
та вимірів.~~ Виконано локально 30.10 (Plan-0010 D06, evidence 30.10); production — R02.

## 7. Обов’язкові fault/integration сценарії B02/B04

- Два одночасні move A під B і B під A: лише одна операція проходить revision;
  жодного циклу. Create product vs convert/delete проходять той самий lock.
- Збій після кожного кроку: lock, partial journal, prepared, domain write до
  checkpoint, verify, publication, до completed, до/після outbox delivery.
- Retry same key; інший payload під key; stale revision; двічі recovery;
  чужий owner; зупинений і знову запущений старий instance не допускається до writes.
- Price/stock update між write й rollback не губиться; Prom не пише full document.
- Read почався до writing і закінчився після rollback: epoch відкидає mixed result.
  Feed/SSR/sitemap не публікують partial output.
- Невідомий journal divergence не знімає lock; idempotent resume не дублює SKU,
  routes чи outbox. Відсутній control не переводить систему в unlocked mode.
- Nonempty convert/delete, несумісні attrs/pins, hidden ancestor, duplicate route;
  жодного domain write до validation. Public legacy read не відкриває drafts.

Unit topology tests, що вже проходять, не замінюють ці DB/fault tests.

## 8. Локальна реалізація gate, 2026-10-23

У BE додано CatalogWriteGate з journal-acknowledged Mongo writes, унікальним
резервуванням operation key, CAS ownership/revision, epoch read barrier і
проміжним published. 9 integration tests пройшли на disposable MongoDB.
Повний domain journal, recovery CLI, outbox і підключення HTTP ще не реалізовані.
Поточні API не користуються gate; ці гарантії не поширюються на чинний магазин.

Update journal реалізовано локально для allowlisted updates: атомарний план
до 500 цілей / 8 MiB, before/after, conditional writes, reverse rollback,
перевірка всіх images перед відкриттям gate. 8 journal integration cases
(разом із gate — 17). Це обмежений перший механізм: chunked manifests,
create/delete, recovery CLI/ownership transfer та outbox ще не реалізовані.

2026-10-24: додано recovering phase для керованої передачі owner з epoch+1.
Послідовність: inspect → зупинка/ізоляція старих writers → claimRecovery →
adoptRecovery journal → finishRecovery receipt/control → execute → domain
verification. Retry тієї самої передачі підтримано; 21 integration case проходить.
Повторний takeover іншого recovery-процесу, reconciliation published та CLI ще
не реалізовані. Поточний API не використовує цей протокол.

2026-10-24: publication reconciliation реалізовано. Перехід до published атомарно
фіксує outcome; receipt містить token. Повтор завершує bookkeeping, не змінюючи
domain data/revision повторно і не відкриваючи gate наступного writer. Невідомий
outcome або суперечність лишають fail closed. 27 integration cases проходять.
CLI, takeover іншого recovery-owner, outbox та domain API integration ще попереду.

## 9. Інвентар підключення writers (локальний код, 2026-10-24)

`CategoryTreeWriter` вже виконує bounded create/move під gate, але не є provider
публічного застосунку. Це свідомий стан розгортання до інтеграції всіх споживачів.

| Шлях запису | Поля/залежності | Що потрібно до активації дерева |
|---|---|---|
| CategoryService create/update/replace/delete | identity, definitions, presentation, видалення вузла | Перевести на coordinator; не дозволяти PUT обійти topology/contract |
| ProductService create/update/delete, add/update/delete variant | category_id, attributes, axis, identity; category_id денормалізовано на SKU | Серіалізувати структурні зміни, перевіряти definitions і непорожнє видалення |
| ProductVariantRepository.updateCategoryByProductId | updateMany category_id | Замінити структурним journal планом; updateMany не атомарна batch-операція |
| LandingService create/update/delete | category_id, pins | Спільна revision і перевірка сумісності категорії |
| ColorService update + updateColorFamilyByColorId/renameVariants | словник → family/name SKU | Узгоджений writer для пов’язаних змін; не переписувати v_value/slug |
| PromSyncService.variantRepo.update | price/stock і відповідні timestamps | Може лишатися поза structural gate лише з цим вузьким patch; без category/identity |
| ProductService promotions/images | вузькі promo/images updates | Не замінювати документ; зберігати сумісність із read barrier та purge |
| scripts/catalog-stage.cjs | additive definitions/attributes_v2 | Тільки ізольовані writers; localhost rehearsal, без v2 activation |

Нативні lifecycle inserts поки дозволені journal лише для `categories`; rollback
перевіряє посилання `catalog_routes.entity_type/entity_id` і
`storefront_settings.home_category_ids/collections.category_id` разом із чинними
товарними залежностями. Майбутні reference-поля потрібно додавати до цієї перевірки.
HTTP create має зберегти draft-default і не обходити окреме visibility publication.
Повтор завершеного внутрішнього request повертає попередню revision, а не поточний
стан category; незавершений request ще не має HTTP status adapter.

## 10. Видалення та конвертація чернеток (локально, 2026-10-24)

`deleteDraft` працює лише з v2 draft без children/products/SKU/landings,
категорійних routes (включно з aliases) та storefront references. Journal зберігає
повний `deletion` before-image; CAS видаляє тільки незмінний документ. Підготовка
перевіряє залежності до першого запису; execute перевіряє знову, навіть якщо після
втраченого acknowledgement документ уже відсутній. Немає cascade delete.

Rollback відновлює точний BSON image. Новий документ із тим самим ID, конфлікт
name/slug або втрачений/несумісний parent залишають gate закритим. Це відновлення
в межах незавершеної операції, не довільний undo вже опублікованої зміни.

`convertDraft` явно змінює group ↔ product для порожньої v2 draft, замінюючи
kind/attribute_definitions одним field patch. Перед цим перевіряє typed definitions
та відсутність children/products/SKU/landings. Group не може мати definitions.
Identity, parent, order і slug не змінюються. Наявні товари не перетворюються
приховано; для них потрібен окремий план сумісності/перенесення.

Обидві операції будують план під тим самим gate. Помилка до виконання не тримає
каталог заблокованим; після початку виконання потрібен явний recovery. Операції
не підключені до HTTP. Видалення/конвертація активних чи archived категорій,
архівація, route retirement та видимість залишаються окремою роботою.

## 11. Зміни опублікованої категорії за точним usage (локально, 2026-10-29)

Попереднє правило «будь-який товар, SKU чи лендінг категорії блокує всі визначення» замінено точним usage за
ключем, прочитаним під тим самим gate (`category-definition-change.ts`). Правила однакові для чернетки й
опублікованої категорії; відрізняється лише обов’язковість:

- дозволено: label, порядок, одиниця ключа, значення якого немає в жодному товарі чи SKU, «у характеристиках», нові необов’язкові
  характеристики, нові/перейменовані/переставлені варіанти списку; фільтр незакріпленого ключа; видалення й
  будь-яка зміна ключа, який нічого не тримає;
- відхиляється до запису: видалення ключа, який тримають товари, SKU осі, лендінги чи налаштування картки/фіду;
  зміна `value_type`/`multiple`/`semantic` використаного ключа; зміна одиниці ключа, значення якого має хоч один
  товар чи SKU (`DEFINITION_UNIT_LOCKED`, 409 з лічильником; значення не перераховуються — «1000 г» не стає «1000 кг»;
  рішення власника 31.10, скасовує правило 29.10 «одиниця без перерахунку»); видалення використаного варіанта; зміна фільтра
  під закріпленням лендінгу; в опублікованій категорії — обов’язковість, якої товари ще не мають (чернетка може
  бути неповною, публікація перевіряє готовність);
- останній рубіж: жоден рядок, коректний за старими визначеннями, не стає некоректним за новими (рядки, некоректні
  вже, не блокують інших змін).

Журнал пише лише `attribute_definitions` (назва/зображення — окремою операцією); збереження без змін — побайтово той
самий документ. ~~Після справжньої зміни поля міграції `revert` відмовляє (`RECOVERY_CONFLICT` з переліком цілей) і
звільняє gate; після повернення значення проходить як `<op>-revert-2` (репетиція на production-копії 29.10).~~
Рішення власника 06.11.2026: `revert` міграції прибрано; невдалий реліз відкочується відновленням колекцій каталогу
з бекапу релізу (рунбук релізу §5).

Тим самим протоколом (gate + журнал) закрито решту записів, які після міграції блокує інтерлок: словник кольорів
(профіль `colors`: колір і денормалізовані `color_family`/`name` його SKU одним планом, видалення лише
невикористаного), акції й постачальник товару, архівування всіх SKU, видалення товару/SKU лише без замовлень,
кошиків, зв’язків і старих адрес (повні before-images; SKU, які видаляє той самий план, не рахуються посиланням на
товар). Переміщення опублікованої гілки та атомарний план конвертації (§5) лишаються окремою роботою.

## 12. Переміщення опублікованих гілок і конвертація за планом (локально, 29.10.2026, друга сесія)

**Переміщення.** Опублікована категорія переїжджає лише під опубліковану групу або в корінь (`CATEGORY_PARENT_NOT_PUBLIC`):
активний вузол завжди має активний ланцюг предків, тож видимість гілки не змінюється, а адреси (плоскі
`/{slug}`, `/{категорія}/{лендінг}`, `/products/{slug}`) від дерева не залежать. Гілка-чернетка, як і раніше,
переїжджає будь-куди. Окремий recovery не потрібен: це той самий однодокументний план `parent_id/order`.

**Конвертація товарної категорії на групу (§5) реалізована з такими уточненнями:**

- read-only `POST /categories/:id/admin/conversion-plan` → `{plan_id|null, executable, counts, products, landings,
  problems, warnings}`; план зберігається в `catalog_conversion_plans` лише якщо виконуваний, для своєї revision;
  `POST /categories/:id/admin/conversion` з `plan_id` повертає **200** з квитанцією (а не 202: план ≤ 500 змін
  виконується за один запит, як інші журнальні операції); повтор ключа — та сама квитанція;
- під gate план перебудовується з тих самих призначень; відбиток записів (без часових міток і id нових аліасів)
  має збігтися з перевіреним, інакше `CONVERSION_PLAN_CHANGED`, інша revision — `CONVERSION_PLAN_STALE`;
- «сумісні definitions/pins» означає: перенесення товару без жодної втрати значень (той самий `planTransfer`, що й
  у F04), вісь варіантів виражається в цілі, опублікована ціль має всі обов’язкові значення; закріплення лендінгу
  переносяться в ключі цілі тим самим зіставленням (ключ або назва, одиниця має збігатися);
- лендінг змінює адресу (`/{джерело}/{лендінг}` → `/{ціль}/{лендінг}`): для опублікованого стара адреса стає аліасом
  у тому самому плані (B07), добірки вітрини йдуть за лендінгом;
- додатково до §5: `adopt_targets` переносить цільові категорії під нову групу **в тому самому плані** — без
  проміжного стану, коли товари вже в цілях, а цілі ще поза групою; опублікована ціль під групою-чернеткою
  відхиляється (`CATEGORY_PARENT_NOT_PUBLIC`);
- не переносяться на групу й лишаються в before-images: `attribute_definitions`, `presentation`,
  `google_product_category` (попередження `CONVERSION_SETTINGS_NOT_CARRIED`; `export_rules` прибрано 04.11.2026);
- межа одного плану — 500 змін (журнал); більше — `CONVERSION_PLAN_TOO_LARGE`, розподіл частинами через перенесення
  товарів (F04). Chunked manifests для більших конвертацій лишаються поза обсягом.

Group → product з дітьми — як у §5: спершу явно перемістити дітей, потім конвертувати порожній вузол. Деталі —
BE `src/docs/CATEGORY_TREE.md`; доказ — Plan-0010 M0 evidence, 29.10 (друга сесія).

## Аудит 31.10.2026: шлях збою writer і операторське відновлення (локально)

Розбіжність коду з §3, знайдена аудитом: HTTP-writers звільняли gate лише до `execute`. Якщо `execute`
відмовляв на своїй попередній перевірці (ціль змінилась між збереженням плану й виконанням — Prom sync
перевіряє gate, потім пише) — доменних записів не було, але gate лишався `writing` назавжди, і всі
читання каталогу й checkout відповідали 503 до ручного втручання. Після доменного запису стан
`recovery_required` не встановлювався, а операторського CLI для HTTP-операцій не було (лише для
власних запусків міграції/staging).

Тепер (у межах §3, без зміни протоколу):

- `CatalogWriteGate.afterFailedWrite(token, executionStarted)` — єдиний шлях збою всіх 15 writers:
  до `execute` — `abortBeforeWrites`; після — звільнення, якщо `writes_started: false` (CAS), інакше
  `requireRecovery` (`recovery_required`). Відповідь адмінці не змінилась (503 з `operation_id`).
- `fillando-be/scripts/catalog-recover.cjs inspect|resume|rollback` — операційний CLI з §3 (зупинені
  writers, `--production` + типізоване підтвердження, без друку токена): нічого не записано → звільнення;
  збій після публікації → завершення bookkeeping; інакше `claimRecovery → adoptRecovery → finishRecovery →
  execute` і перевірка кожної цілі (і дерева) перед відкриттям gate. Розбіжність (третє значення) —
  відмова адопції, як у §3. Запуски міграції/staging — їхніми CLI.
- Кожне завершення операції (`finishPublication`) просить перебудову фіду: штамп фіду змінюється за будь-якого
  результату (§4).
- Створення категорії й типізованого лендінгу перевіряє зарезервовані шляхи й старі адреси інших сутностей,
  як зміна slug (B07).

Тести: `catalog-mutation-journal.int-spec.ts`, `catalog-recover-cli.int-spec.ts` (production-режим),
`typed-product-published.int-spec.ts`, `typed-product*.int-spec.ts` (перерване збереження відкочується
протоколом оператора). Outbox/ACK для очищення кешів вітрини (§4) — реалізовано до релізу (P12, рішення
власника 02.11), з відлунням через 10 с (P15).

**Межа однієї операції — 500 записів журналу** (`PLAN_MAX_TARGETS`). ~~Понад неї публікацію відхилено (409
`PUBLICATION_TOO_LARGE`, рішення 31.10).~~ **Публікація частинами (P13, рішення власника 02.11):** коли категорія
перемикає більше SKU, ніж вміщує одна операція, вони йдуть пачками по 500, кожна — окрема операція журналу під
gate (своя ревізія, свій журнал, відновлення як у будь-якої операції), а категорія — останньою операцією з рештою
під ключем запиту. Публікація: доки категорія чернетка, активовані SKU не видно — категорія з'являється разом з
усіма. Зняття: SKU зникають пачками, потім категорія. Збій між пачками лишає лише записане пачками; повторна
публікація планує від поточного стану й завершує. Нові готові SKU, що з'явилися під час пачок і не вміщуються, —
409 `PUBLICATION_CHANGED` (публікувати ще раз). Межа в інших операціях (перетворення, кольори) — як була, з
`limit` у відповіді.

