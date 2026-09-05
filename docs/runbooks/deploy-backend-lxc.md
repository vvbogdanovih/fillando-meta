# Deploy Backend — LXC + Nginx Proxy Manager + GitHub Actions CI/CD

## Архітектура

```
Internet → Home Router (port forwarding)
  :80/:443 → NPM LXC (SSL termination, reverse proxy)
                → api.fillando.com → Backend LXC :4000 (NestJS)
  :9991    → Backend LXC :22 (SSH для GitHub Actions CI/CD)

LAN:
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  NPM LXC     │     │ Backend LXC  │     │ MongoDB      │
  │  Nginx Proxy │────►│ Docker       │────►│ (вже працює) │
  │  Manager     │     │ NestJS :4000 │     │ :27017       │
  │  :80 :443    │     │ SSH :22      │     │              │
  └──────────────┘     └──────────────┘     └──────────────┘
```

---

## Крок 1 — Підготовка Backend LXC

SSH на Backend LXC як root.

### 1.1 Оновити систему

```bash
apt update && apt upgrade -y
apt install -y curl git ufw
```

### 1.2 Створити deploy-юзера

```bash
adduser deploy
# Ввести пароль, решту полів пропустити (Enter)
usermod -aG sudo deploy
```

Перейти на deploy (всі наступні команди від нього):

```bash
su - deploy
```

### 1.3 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 4000
sudo ufw enable
```

### 1.4 Docker

Видалити конфліктні пакети (якщо є):

```bash
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
  sudo apt-get remove -y $pkg 2>/dev/null
done
```

Додати офіційний Docker apt-репозиторій:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Встановити Docker Engine та Docker Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Додати deploy до групи docker та перелогінитися:

```bash
sudo usermod -aG docker deploy
exit
su - deploy
```

Перевірити:

```bash
docker --version
docker compose version
sudo systemctl is-enabled docker
# docker  → enabled
```

### 1.5 SSH Deploy Key для GitHub

Згенерувати ключ:

```bash
ssh-keygen -t ed25519 -C "deploy@fillando-be" -f ~/.ssh/github_deploy -N ""
```

Вивести публічний ключ:

```bash
cat ~/.ssh/github_deploy.pub
```

Скопіювати → GitHub repo `fillando-be` → Settings → Deploy keys → Add deploy key (без write access).

Налаштувати SSH config:

```bash
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
```

```bash
chmod 600 ~/.ssh/config
```

Перевірити:

```bash
ssh -T git@github.com
# Hi vvbogdanovih/fillando-be! You've been granted access.
```

### 1.6 Клонування репо

```bash
sudo mkdir -p /srv/fillando-api
sudo chown deploy:deploy /srv/fillando-api
```

```bash
git clone git@github.com:vvbogdanovih/fillando-be.git /srv/fillando-api
cd /srv/fillando-api
```

---

## Крок 2 — .env.prod на сервері

Цей файл НЕ в git — створюється вручну на сервері.

### 2.1 Згенерувати секрети

```bash
openssl rand -hex 32   # → використати як JWT_SECRET
openssl rand -hex 32   # → використати як REFRESH_JWT_SECRET
openssl rand -hex 16   # → використати як PASSWORD_PEPPER
openssl rand -hex 32   # → використати як PAYMENT_ENCRYPTION_KEY (мін. 32 символи; зробити бекап)
```

### 2.2 Створити файл

```bash
nano /srv/fillando-api/.env.prod
```

Вставити вміст (замінити `<...>` на реальні значення):

```env
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
FRONTEND_URL=https://fillando.com
# Публічна адреса API — з неї будується LiqPay server_url callback
PUBLIC_API_URL=https://api.fillando.com

# MongoDB (LAN IP вашої MongoDB VM/LXC)
DATABASE_URL=mongodb://<USER>:<PASS>@<MONGO_LAN_IP>:27017/<DB>?authSource=admin

# JWT
JWT_SECRET=<згенерований hex>
JWT_EXPIRATION=15
ACCSESS_TOKEN_NAME=access_token

REFRESH_JWT_SECRET=<згенерований hex>
REFRESH_JWT_EXPIRATION=10080
REFRESH_TOKEN_NAME=refresh_token

# Password
PASSWORD_PEPPER=<згенерований hex>

# Payments — ключ шифрування секретів провайдерів у базі (мін. 32 символи)
PAYMENT_ENCRYPTION_KEY=<згенерований hex>

# Google OAuth
GOOGLE_CLIENT_ID=<з Google Cloud Console>
GOOGLE_CLIENT_SECRET=<з Google Cloud Console>
GOOGLE_CALLBACK_URL=https://api.fillando.com/auth/google/callback

# AWS S3
AWS_REGION=eu-north-1
AWS_ACCESS_KEY_ID=<з AWS IAM>
AWS_SECRET_ACCESS_KEY=<з AWS IAM>
AWS_S3_BUCKET_NAME=<назва бакету>
AWS_S3_PUBLIC_URL=https://<бакет>.s3.eu-north-1.amazonaws.com

# Nova Post
NOVA_POS_API_KEY=<з кабінету Нової Пошти>

# Prom.ua (синхронізація цін/наявності постачальника)
PROM_API_KEY=<з кабінету Prom>

# Cron — Prom-синк у процесі; true лише на одному інстансі
RUN_CRON=true

# Email (Resend)
RESEND_API_KEY=<з Resend dashboard>
SERVICE_EMAIL=<email для сервісних сповіщень>
ALLOW_EMAIL_SENDING=true

# INTERNAL_API_TOKEN — опційний і поки не потрібний (фронтенд його не надсилає).
# НЕ додавати рядок із порожнім значенням: `INTERNAL_API_TOKEN=` валить старт API
# (валідація min 32 символи). Якщо додавати — лише повне значення (openssl rand -hex 32).
```

### 2.3 Захистити файл

```bash
chmod 600 /srv/fillando-api/.env.prod
```

---

## Крок 3 — Перший запуск

```bash
cd /srv/fillando-api
docker compose -f docker-compose.prod.yml up -d --build

# Перевірити статус
docker compose -f docker-compose.prod.yml ps
# NAME           STATUS
# fillando-be    Up

# Перевірити логи
docker logs fillando-be --tail 50

# Тест що API відповідає
curl http://localhost:4000/categories
# Має повернути JSON (або [] якщо БД порожня)
```

---

## Крок 4 — Nginx Proxy Manager

Відкрити веб-інтерфейс NPM: `http://<NPM_LXC_IP>:81`

### Додати Proxy Host

1. **Proxy Hosts → Add Proxy Host**
2. Вкладка **Details**:

| Поле | Значення |
|------|----------|
| Domain Names | `api.fillando.com` |
| Scheme | `http` |
| Forward Hostname/IP | `<Backend LXC LAN IP>` |
| Forward Port | `4000` |
| Cache Assets | Off |
| Block Common Exploits | On |
| Websockets Support | Off |

3. Вкладка **SSL**:

| Поле | Значення |
|------|----------|
| SSL Certificate | Request a new SSL Certificate |
| Force SSL | On |
| HTTP/2 Support | On |
| HSTS Enabled | Off |
| HSTS Sub-domains | Off |
| Use DNS Challenge | Off |

4. Вкладка **Advanced** — вставити:

```nginx
client_max_body_size 50m;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 86400s;
```

5. **Save**

### Перевірка

```bash
curl https://api.fillando.com/categories
```

---

## Крок 5 — Port Forwarding на роутері (MikroTik)

В терміналі MikroTik (WinBox → Terminal, або SSH на роутер):

```
/ip firewall nat
add action=dst-nat chain=dstnat dst-port=80 in-interface-list=WAN protocol=tcp to-addresses=<NPM_LXC_IP> to-ports=80 comment="HTTP -> NPM LXC"
add action=dst-nat chain=dstnat dst-port=443 in-interface-list=WAN protocol=tcp to-addresses=<NPM_LXC_IP> to-ports=443 comment="HTTPS -> NPM LXC"
add action=dst-nat chain=dstnat dst-port=9991 in-interface-list=WAN protocol=tcp to-addresses=<Backend_LXC_IP> to-ports=22 comment="SSH -> Backend LXC"
```

> **Важливо:** Використовуйте `in-interface-list=WAN`, а не `in-interface=ether1`. Якщо `ether1` є slave в bridge, правило стане invalid і не працюватиме.

Перевірити що правила активні (без позначки `I`):

```
/ip firewall nat print
```

Перевірити з зовнішньої мережі:

```bash
curl -v https://api.fillando.com
ssh -p 9991 deploy@<ваш-статичний-IP>
```

---

## Крок 6 — GitHub Actions CI/CD

### 6.1 Згенерувати SSH ключ для CI

На локальній машині (Mac):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy@fillando-be" -f ~/.ssh/github_actions_fillando_be -N ""
```

### 6.2 Додати публічний ключ на Backend LXC

Скопіювати публічний ключ на локальній машині:

```bash
cat ~/.ssh/github_actions_fillando_be.pub
```

На Backend LXC як deploy user вставити скопійований ключ:

```bash
mkdir -p ~/.ssh
echo "<вставити вміст .pub>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 6.3 Перевірити SSH з локальної машини

З LAN (напряму по LAN IP):

```bash
ssh -i ~/.ssh/github_actions_fillando_be deploy@<Backend LXC LAN IP>
```

> **Note:** NAT правила мають `in-interface-list=WAN`, тому з LAN перевіряємо напряму. GitHub Actions підключається ззовні через `<статичний-IP>:9991` — для них NAT спрацює.

Має підключитися без запиту пароля.

### 6.4 Додати GitHub Secrets

Repo `fillando-be` → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Значення |
|--------|----------|
Спочатку скопіювати приватний ключ в буфер обміну (на локальній машині):

```bash
cat ~/.ssh/github_actions_fillando_be | pbcopy
```

Потім додати секрети:

| Secret | Значення |
|--------|----------|
| `SSH_HOST` | Ваш статичний IP |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | Вставити з буфера (приватний ключ, починається з `-----BEGIN OPENSSH PRIVATE KEY-----`) |
| `SSH_PORT` | `9991` |

### 6.5 Workflow

Файл `fillando-be/.github/workflows/deploy.yml` вже налаштований:

```yaml
name: Deploy Backend

on:
    push:
        branches: [main]

jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            - name: Deploy via SSH
              uses: appleboy/ssh-action@v1
              with:
                  host: ${{ secrets.SSH_HOST }}
                  username: ${{ secrets.SSH_USER }}
                  key: ${{ secrets.SSH_KEY }}
                  port: ${{ secrets.SSH_PORT }}
                  script: |
                      cd /srv/fillando-api
                      git pull origin main
                      docker compose -f docker-compose.prod.yml build --no-cache api
                      docker compose -f docker-compose.prod.yml up -d --no-deps api
                      docker image prune -f
```

Що відбувається при push в `main`:

1. GitHub Actions підключається по SSH до Backend LXC через port forwarding
2. `git pull` — завантажує нові зміни
3. `docker compose build --no-cache api` — перебілджує контейнер
4. `docker compose up -d --no-deps api` — перезапускає без downtime
5. `docker image prune -f` — очищує старі Docker образи

---

## Крок 7 — Тестування CI/CD

1. Зробити будь-яку зміну в `fillando-be`
2. Push в `main`
3. GitHub → Actions → побачити запущений workflow
4. Зачекати завершення
5. Перевірити:

```bash
curl https://api.fillando.com/categories
```

---

## Верифікація (checklist)

**Мережа:**
- [ ] DNS A-запис `api.fillando.com` вказує на статичний IP
- [ ] Port forwarding працює (80, 443 → NPM; 9991 → Backend LXC SSH)

**SSL:**
- [ ] `https://api.fillando.com` — валідний сертифікат (замочок в браузері)

**Backend:**
- [ ] `https://api.fillando.com/swagger` — Swagger UI відкривається
- [ ] `https://api.fillando.com/categories` — повертає JSON
- [ ] `docker logs fillando-be` — без помилок
- [ ] MongoDB підключення працює

**CI/CD:**
- [ ] Push в `main` → GitHub Actions → автодеплой
- [ ] SSH з GitHub Actions доходить до Backend LXC

---

## Корисні команди

```bash
# Логи
docker logs fillando-be --tail 100 -f

# Статус
docker compose -f docker-compose.prod.yml ps

# Рестарт
docker compose -f docker-compose.prod.yml restart

# Повний перезбір
docker compose -f docker-compose.prod.yml up -d --build

# Очистити Docker
docker image prune -f

# Disk usage
docker system df
```

---

## Troubleshooting

### 502 Bad Gateway в NPM

NPM не може достукатися до Backend LXC:

```bash
# З NPM LXC перевірити
curl http://<Backend_LXC_IP>:4000/categories
```

Якщо не відповідає:
- Backend LXC запущений?
- Docker контейнер працює? (`docker ps` на Backend LXC)
- Firewall дозволяє порт 4000? (`sudo ufw status`)

### GitHub Actions SSH timeout

```bash
# Перевірити port forwarding з локальної машини
ssh -p 9991 -i ~/.ssh/github_actions_fillando_be deploy@<статичний-IP>
```

- Timeout → порт не прокинутий на роутері
- Connection refused → sshd не працює або firewall блокує

### Disk space

Docker образи накопичуються:

```bash
# Видалити невикористовувані образи
docker image prune -f

# Повне очищення (обережно — видаляє volumes!)
docker system prune -a --volumes
```
