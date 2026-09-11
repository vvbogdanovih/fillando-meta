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
