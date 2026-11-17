# Локальна MongoDB для розробки

Дата: 2026-09-11. Стосується локального backend, запущеного через `yarn start:dev`.

## Конфігурація

| Параметр | Значення |
| --- | --- |
| Compose-файл | `repos/fillando-be/docker-compose.local.yml` |
| Compose project / service | `fillando-local` / `mongo` |
| Образ | `mongo:8.0` |
| Підключення з комп’ютера | `mongodb://127.0.0.1:27019/fillando` |
| Дані | `repos/fillando-be/.local/mongo-8/` → `/data/db` |
| Службові дані | `repos/fillando-be/.local/mongo-8-config/` → `/data/configdb` |

MongoDB доступна тільки через localhost, без автентифікації. Backend працює на комп’ютері,
тому використовує порт **27019**; усередині MongoDB-контейнера порт — **27017**.
Порт 27018 належить окремій disposable-базі інтеграційних тестів.

Уся `.local/` виключена з Git і Docker build context. Це bind mounts у папці backend,
а не Docker named volumes. Зупинка чи перевідтворення контейнера не стирає дані.

## Перший запуск

Потрібні Docker із Compose (на macOS — запущений Docker Desktop), Node.js та Yarn.
Усі наступні команди виконуються **з кореня backend**:

```bash
cd repos/fillando-be
```

1. Встановити залежності: `yarn install`.
2. Якщо `.env` ще немає, скопіювати `.env.example` у `.env` і заповнити обов’язкові
   змінні за [README backend](../../repos/fillando-be/README.md#environment-variables).
   Наявний `.env` не перезаписувати.
3. У `.env` встановити:

   ```dotenv
   DATABASE_URL=mongodb://127.0.0.1:27019/fillando
   ```

4. Якщо використовується `scripts/sync-env.sh` мета-репозиторію, встановити такий самий
   `DATABASE_URL` у master `.env`, щоб наступна синхронізація не повернула стару адресу.
5. Запустити MongoDB, а потім backend:

   ```bash
   yarn db:up
   yarn start:dev
   ```

`db:up` очікує успішного healthcheck. Перший запуск може завантажувати образ.
Після зміни `.env` перезапустити вже запущений backend через `Ctrl+C` → `yarn start:dev`.
Нова база порожня: старі товари та користувачі з’являться лише після відновлення дампу.

## Щоденна робота та перевірка

```bash
yarn db:up    # Запуск; повторний виклик не очищає базу
yarn db:logs  # Логи; Ctrl+C припиняє лише перегляд
yarn db:down  # Зупинка і видалення контейнера зі збереженням даних
```

Команди `db:*` передають `--env-file /dev/null`: Compose не читає секрети застосунку
та не інтерполює символи `$` з його `.env`. Backend продовжує читати `.env` звичайним способом.
Для прямих викликів Compose використовувати ті самі прапорці:

```bash
docker compose --env-file /dev/null -p fillando-local -f docker-compose.local.yml ps

docker compose --env-file /dev/null -p fillando-local -f docker-compose.local.yml exec -T mongo \
  mongosh --quiet --eval 'db.adminCommand({ ping: 1 })'
```

Очікувано: сервіс `mongo` має статус `healthy`, команда повертає `ok: 1`.
Для MongoDB Compass використати URL із таблиці вище.

## Резервна копія

Зупинити backend та інші процеси запису на час копіювання. MongoDB залишити запущеною.
Інструменти `mongodump` і `mongorestore` запускаються всередині контейнера, встановлювати їх
на комп’ютер для наведених команд не потрібно.

```bash
mkdir -p .local/backups
mongo_backup_file=".local/backups/fillando-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose --env-file /dev/null -p fillando-local -f docker-compose.local.yml exec -T mongo \
  mongodump --uri=mongodb://127.0.0.1:27017/fillando --archive --gzip > "$mongo_backup_file"
```

Перевірити exit code команди: `echo $?` має повернути `0`. При помилці файл може бути
неповним. Дампи в `.local/backups/` також ігноруються Git; для збереження поза комп’ютером
скопіювати успішний дамп в окреме сховище.

## Сумісність версій і назва бази у дампі

Локальна dev-база використовує MongoDB 8.0 для дампу з production MongoDB 8.0.32.
Інтеграційна тестова база залишається на MongoDB 7. Не відновлювати дамп MongoDB 8 у 7.
Після переходу dev Compose на 8.0 старі файли MongoDB 7 залишаються в `.local/mongo/`
і `.local/mongo-config/`; новий контейнер використовує окремі папки з таблиці вище.

Для перевірки namespace без запису даних (якщо `mongorestore` встановлений на комп’ютері):

```bash
mongorestore --uri='mongodb://127.0.0.1:27019' \
  --archive='/absolute/path/backup.archive' --gzip --dryRun --verbose
```

Назву бази для archive задавати через `--nsInclude`, а перейменування — через
`--nsFrom` / `--nsTo`. `/fillando` у URI не перейменовує `fillando-prod` на `fillando`.
Перевірений production-архів має namespace `fillando-prod.*`. Для його відновлення
у порожню локальну `fillando`:

```bash
mongorestore --uri='mongodb://127.0.0.1:27019' \
  --archive='/absolute/path/fillando_prod_db_backup.archive' --gzip \
  --nsInclude='fillando-prod.*' --nsFrom='fillando-prod.*' --nsTo='fillando.*' \
  --stopOnError
```

Перед restore зупинити backend; для непорожньої бази спершу виконати резервне копіювання
або вибрати нову базу. `--drop` видаляє відповідні колекції — для порожньої бази він не потрібний.

## Відновлення з archive.gz

Нижче — для архіву, створеного через `mongodump --archive --gzip`, з базою `fillando`.
Зупинити backend. Перед відновленням база `fillando` повинна бути порожньою;
якщо вона містить потрібні дані, спершу створити резервну копію та використати процедуру
нової бази нижче. Команда навмисно без `--drop` і з `--stopOnError`.

Замінити шлях на фактичний шлях до архіву:

```bash
yarn db:up
docker compose --env-file /dev/null -p fillando-local -f docker-compose.local.yml exec -T mongo \
  mongorestore --uri=mongodb://127.0.0.1:27017/fillando \
  --archive --gzip --nsInclude='fillando.*' --stopOnError < /absolute/path/fillando.archive.gz
```

Перевірити exit code `0` і кількість відновлених документів у звіті. Якщо вихідна база
називалася інакше, замінити `--nsInclude='fillando.*'` на
`--nsInclude='SOURCE_DB.*' --nsFrom='SOURCE_DB.*' --nsTo='fillando.*'`, де `SOURCE_DB` —
фактична назва бази у дампі. Неправильна назва може дати нуль відновлених документів.

Після помилки restore частина документів уже може бути записана: не повторювати
відновлення поверх частково заповненої бази. Використати нову порожню базу.
Для BSON-дампу каталогу та його міграцій див. [ранбук міграції свіжої бази](migrate-fresh-database.md).
Після успішного відновлення запустити backend і перевірити каталог та вхід користувача.

## Нова порожня база без видалення старих даних

Щоб почати з чистого стану, змінити лише назву бази в `.env`, наприклад:

```dotenv
DATABASE_URL=mongodb://127.0.0.1:27019/fillando_scratch
```

Перезапустити backend. MongoDB створить базу під час першого запису; стара `fillando`
залишиться доступною. Для повернення відновити попередній URL і перезапустити backend.
Для restore у нову базу також змінити назву в URI та `--nsTo` команди відновлення.

Не видаляти `.local/mongo-8/` чи `.local/mongo-8-config/` для звичайного перезапуску:
це файли бази, а не кеш. `yarn db:down` достатньо для зупинки.

## Діагностика

| Симптом | Перевірка / дія |
| --- | --- |
| `Cannot connect to the Docker daemon` | Запустити Docker Desktop і повторити `yarn db:up`. |
| `port is already allocated` | Перевірити `lsof -nP -iTCP:27019 -sTCP:LISTEN`. Якщо порт потрібно змінити, оновити і Compose `ports`, і `DATABASE_URL`. |
| MongoDB `unhealthy` або постійно перезапускається | `yarn db:logs`; перевірити вільне місце та доступ Docker до папки репозиторію. Не стирати файли бази як перший крок. |
| Backend показує `Found 0 errors` і далі мовчить | Це завершення компіляції, не підтвердження запуску HTTP. Перевірити healthcheck MongoDB, актуальний `DATABASE_URL` та перезапустити backend. |
| `ECONNREFUSED` на порту 27019 | Перевірити `yarn db:up` і адресу підключення. |
| Frontend отримує `ECONNREFUSED` на порту 9001 | Перевірити запуск backend і його `PORT`; MongoDB сама не запускає API. |
| Каталог порожній або старий користувач не входить | Нова база не містить попередніх даних; перевірити назву бази й результат restore. |
| Compose попереджає про невідому змінну із `.env` | Використати `yarn db:*` або повну команду з `--env-file /dev/null`. |

Перевірено під час налаштування: Compose запускається до `healthy`, MongoDB відповідає
на `ping`, обидва bind mounts ведуть у `.local/` backend, Git ігнорує дані.
Команди backup/restore в цьому ранбуці не виконувалися на користувацьких даних.

## Локальний редактор каталогу v2 (26.10.2026)

За запитом власника нову адмінку перенесено з 9010 на **9000**. API нового
каталогу — 9002. Початкова база `fillando-prod` на **локальному** MongoDB
`127.0.0.1:27019` збережена; її API 9001 залишається окремим. Назва бази не
означає з’єднання з production. Поточний стенд:

- Адмінка: `http://localhost:9000/admin/categories`.
- API: `http://localhost:9002`.
- База: `fillando_catalog_local_v2` на тому самому локальному MongoDB.
- Дані: копія каталогу плюс draft приклад АВР 16/32/63 А.
- Cookies: `fillando_catalog_local_access` / `fillando_catalog_local_refresh`,
  незалежні від основного localhost.
- Локальний ADMIN: дані входу в `repos/fillando-be/.local/catalog-workspace-login.json`
  (mode 0600, gitignored). Використовувати вхід email/пароль. Google OAuth для
  цього окремого origin не налаштовувався. Пароль не додається до документації.

Підготовка з директорії backend:

```bash
node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/local-catalog-workspace.cjs
```

Скрипт має фіксований localhost URI та окрему цільову базу. Джерело не змінює,
нічого не видаляє; повторний запуск зберігає вже внесені зміни. Частково створену
базу без ready marker не перезаписує: потрібна явна діагностика. Готує локальний
ADMIN із випадковим паролем, не змінює пароль жодного скопійованого користувача.

Після `yarn build` запустити API стенда в окремому терміналі backend:

```bash
DATABASE_URL=mongodb://127.0.0.1:27019/fillando_catalog_local_v2 PORT=9002 FRONTEND_URL=http://localhost:9000 RUN_CRON=false ACCSESS_TOKEN_NAME=fillando_catalog_local_access REFRESH_TOKEN_NAME=fillando_catalog_local_refresh node --enable-source-maps dist/main
```

В іншому терміналі frontend:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:9002 NEXT_DIST_DIR=.next-e2e/catalog-local yarn next dev --webpack -p 9000 --hostname 127.0.0.1
```

Основні `.env` залишаються незмінними. Frontend `.env.local` (gitignored)
задає `NEXT_PUBLIC_API_BASE_URL=http://localhost:9002` та
`NEXT_DIST_DIR=.next-e2e/catalog-local`; звичайний `yarn dev` також працює на 9000
з цією базою. Старий frontend 9010 зупинено. Після переключення може знадобитися
повторний вхід локальним ADMIN із файла вище. Після змін backend коду повторити build
і перезапустити процеси, що працюють через `node dist/main`; такий процес сам
не підхоплює нову збірку. Застарілий процес 9001 був причиною помилки дерева:
`/categories/tree` потрапляв у старий `/:id` і спричиняв ObjectId cast error.

Цей стенд призначений для нової адмінки. Public storefront/feed у ньому ще
блокуються v2 read barrier, бо їхні адаптери не завершені. Основна база лишається
без catalog_control, її дані не змінені; frontend на 9000 тепер підключений до v2 бази.
Новий редактор відкривається через **Products → товарна категорія → товар**,
через **Categories → товарна чернетка → Товари категорії**, а також напряму
через `/admin/products/:id/edit` для підготовленої v2 чернетки. На стенді перевірено
додавання, архівацію та відновлення демонстраційного варіанта 63 A (FL-000305);
ідентифікатор, URL, ціна й залишок після відновлення зберігаються.
Не вмикати rollout flag у початковій базі лише для усунення жовтого повідомлення.

27.10.2026: API9002 також обслуговує публічне читання категорій і
`GET /products/catalog/v2`. Read-only перевірка на копії: HTTP 200, 301 активний SKU,
20 на першій сторінці; нові товарні чернетки залишаються прихованими. Це не
повне ввімкнення вітрини: старі `/products/catalog`, detail/feed/checkout consumers
ще мають захисний бар’єр, доки не підключено відповідні адаптери й UI.

27.10.2026 (пізніше): на стенді працює покупецька вітрина нового каталогу —
`http://localhost:9000/catalog`, група `/local-electrical`, категорія
`/local-transfer-switches`, товар `/products/lokalnyy-avr-stvoreno-cherez-formu-63-a`.
Група й категорія опубліковані журнальною операцією (revision 12); «Демонстраційний АВР»
лишився чернеткою. Панель «Публікація» в `/admin/categories` знімає/повертає публікацію.
Відкривати стенд саме з `localhost:9000`: API дозволяє CORS лише для цього origin, із
`127.0.0.1:9000` браузерні запити до API падають. Створення замовлення надсилає справжні
листи через Resend зі спільного `.env` (на одне замовлення — два: покупцю й службовий на
SERVICE_EMAIL): у тестових замовленнях вказувати лише SERVICE_EMAIL
і не створювати їх масово (так перевірено FO-0000173, 27.10.2026).

27.10.2026 (міграція): філамент на стенді переведено на v2 командою
`node scripts/catalog-v2-migrate.cjs apply fillando_catalog_local_v2 filament-v2-20261027b --writers-stopped`
(перед цим скопійовано 14 активних лендінгів філаменту з локальної копії `fillando-prod` —
лише читання з неї; першу спробу `filament-v2-20261027` відкочено `revert` через виправлення
mapping). Revision 15. API9002 на час apply зупиняли. Після міграції dev-сервер FE треба
перезапустити й очистити `.next-e2e/catalog-local/dev/cache/fetch-cache`, інакше він віддає
закешовану v1-категорію. ~~Повернути legacy-стан: `... revert fillando_catalog_local_v2
filament-v2-20261027b --writers-stopped`~~ — команду `revert` прибрано 06.11.2026 (рішення власника);
legacy-стан повертається відновленням колекцій каталогу з дампу (рунбук релізу §5).

27.10.2026 (R01): свіжий дамп `~/Desktop/fillando_prod_db_backup.archive` відновлено в
`fillando_rehearsal_20261027` (еталон, не змінювати) і `fillando_rehearsal_work_20261027`
(робоча копія; дозволена для `catalog-v2-migrate.cjs`). Після репетиції робоча копія
повернута командою `revert` до стану дампу. Обидві бази містять персональні дані замовлень —
лише локально, не експортувати.

28.10.2026 (R01, повна репетиція): на `fillando_rehearsal_work_20261027` тимчасово працювали новий
BE (9003, `node dist/main`) і старий BE з `origin/production` (9004, збірка в тимчасовій теці) —
обидва з `RUN_CRON=false`, окремим `JWT_SECRET` і `INTERNAL_API_TOKEN` для репетиції; FE
production-збірка на 9100 (`NEXT_DIST_DIR=.next-e2e/r01`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:9003`).
Бекенд **не стартує з порожнім `RESEND_API_KEY`**, тож API репетиції працював зі справжнім ключем
і замовлень не створювали (`POST /orders` перехоплювався в браузері). Тимчасовий партнерський
токен створено й видалено. Після `revert r01-filament-20261028b` робоча копія побайтово збігається
з еталоном у всіх 19 колекціях дампу (67 002 документи) та індексах; додатково лишаються
`catalog_control`, `catalog_mutation_plans`, `catalog_operations`, `catalog_stage_runs`. Для
порівнянь Prom sync створювались і видалялись `fillando_r01_prom_legacy` / `fillando_r01_prom_v2`.
Скрипти зняття стану — `scripts/catalog-rehearsal/`. Чернетка релізу — `catalog-v2-release.md`.

28.10.2026 (передумови релізу): production-режим CLI міграції репетирувався **не** на 27019, а в
тимчасовому Docker-MongoDB `127.0.0.1:27020` (tmpfs) з копією дампу під назвою `fillando-prod` —
локальна `fillando-prod` на 27019 як ціль `--production` заборонена самим CLI. Перевірка restore
backup — у `fillando_release_check_20261028` на 27019 (видалено після репетиції). На
`fillando_rehearsal_work_20261027` повторено міграцію заради partner API (тимчасовий токен
`flnd_live_…` створено й видалено); після `revert r01-partner-20261028` копія побайтово = еталону.
Порівняння баз — `scripts/catalog-rehearsal/db-compare.cjs` (лише читання). API стенда 9002
перезапущено з новою збіркою BE.

