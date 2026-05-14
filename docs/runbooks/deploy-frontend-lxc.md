# Deploy Frontend — LXC + Nginx Proxy Manager + GitHub Actions CI/CD

## Архітектура

```
Internet → Home Router (port forwarding)
  :80/:443 → NPM LXC (SSL termination, reverse proxy)
                → fillando.com → Frontend LXC :3000 (Next.js)
  :9990    → Frontend LXC :22 (SSH для GitHub Actions CI/CD)

LAN:
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  NPM LXC     │     │ Frontend LXC │     │ Backend LXC  │
  │  Nginx Proxy │────►│ Docker       │     │ NestJS :4000 │
  │  Manager     │     │ Next.js :3000│────►│ (API)        │
  │  :80 :443    │     │ SSH :22      │     │              │
  └──────────────┘     └──────────────┘     └──────────────┘
```

---

## Крок 1 — Підготовка Frontend LXC

SSH на Frontend LXC як root.

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
sudo ufw allow 3000
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

### 1.5 Swap (рекомендовано)

`next build` споживає багато RAM. Якщо LXC має 2GB або менше — додати swap.

> **Примітка:** Swap в LXC керується через Proxmox: CT → Resources → Swap → встановити значення (наприклад, 2048 MB). Команда `fallocate` не працює в LXC — використовуйте Proxmox UI.

Перевірити поточний swap:

```bash
free -h
```

### 1.6 SSH Deploy Key для GitHub

Згенерувати ключ:

```bash
ssh-keygen -t ed25519 -C "deploy@fillando-fe" -f ~/.ssh/github_deploy -N ""
```

Вивести публічний ключ:

```bash
cat ~/.ssh/github_deploy.pub
```

Скопіювати → GitHub repo `fillando-fe` → Settings → Deploy keys → Add deploy key (без write access).

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
# Hi vvbogdanovih/fillando-fe! You've been granted access.
```

### 1.7 Клонування репо

```bash
sudo mkdir -p /srv/fillando-frontend
sudo chown deploy:deploy /srv/fillando-frontend
```

```bash
git clone git@github.com:vvbogdanovih/fillando-fe.git /srv/fillando-frontend
cd /srv/fillando-frontend
```

---

## Крок 2 — .env.prod на сервері

Цей файл НЕ в git — створюється вручну на сервері.

### 2.1 Створити файл

```bash
nano /srv/fillando-frontend/.env.prod
```

Вставити вміст:

```env
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://api.fillando.com
NEXT_PUBLIC_SITE_URL=https://fillando.com
```

### 2.2 Захистити файл

```bash
chmod 600 /srv/fillando-frontend/.env.prod
```

---

## Крок 3 — Перший запуск

```bash
cd /srv/fillando-frontend

# Збілдити і запустити (перший build може зайняти багато часу)
docker compose -f docker-compose.prod.yml up -d --build

# Перевірити статус
docker compose -f docker-compose.prod.yml ps
# NAME           STATUS
# fillando-fe    Up

# Перевірити логи
docker logs fillando-fe --tail 50
# ▲ Next.js 16.x.x
# - Local: http://localhost:3000

# Тест
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# 200
```

---

## Крок 4 — Nginx Proxy Manager

У веб-інтерфейсі NPM (`http://<NPM_LXC_IP>:81`):

### Додати Proxy Host

1. **Proxy Hosts → Add Proxy Host**
2. Вкладка **Details**:

| Поле | Значення |
|------|----------|
| Domain Names | `fillando.com`, `www.fillando.com` |
| Scheme | `http` |
| Forward Hostname/IP | `<Frontend LXC LAN IP>` |
| Forward Port | `3000` |
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

4. **Save**

### DNS

Переконатися що A-записи налаштовані:

| Тип | Ім'я | Значення |
|-----|------|----------|
| A | `fillando.com` | `<ваш статичний IP>` |
| CNAME | `www` | `fillando.com` |

### Перевірка

```bash
curl https://fillando.com
```

---

## Крок 5 — Port Forwarding на роутері (MikroTik)

Якщо HTTP/HTTPS правила вже створені при деплої бекенду — додати тільки SSH правило. Якщо ні — створити всі:

```
/ip firewall nat
add action=dst-nat chain=dstnat dst-port=80 in-interface-list=WAN protocol=tcp to-addresses=<NPM_LXC_IP> to-ports=80 comment="HTTP -> NPM LXC"
add action=dst-nat chain=dstnat dst-port=443 in-interface-list=WAN protocol=tcp to-addresses=<NPM_LXC_IP> to-ports=443 comment="HTTPS -> NPM LXC"
add action=dst-nat chain=dstnat dst-port=9990 in-interface-list=WAN protocol=tcp to-addresses=<Frontend_LXC_IP> to-ports=22 comment="SSH -> Frontend LXC"
```

> **Важливо:** Використовуйте `in-interface-list=WAN`, а не `in-interface=ether1`. Якщо `ether1` є slave в bridge, правило стане invalid і не працюватиме.

Перевірити що правила активні (без позначки `I`):

```
/ip firewall nat print
```

---

## Крок 6 — GitHub Actions CI/CD

### 6.1 Згенерувати SSH ключ для CI

На локальній машині (Mac):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy@fillando-fe" -f ~/.ssh/github_actions_fillando_fe -N ""
```

### 6.2 Додати публічний ключ на Frontend LXC

Скопіювати публічний ключ на локальній машині:

```bash
cat ~/.ssh/github_actions_fillando_fe.pub
```

На Frontend LXC як deploy user вставити скопійований ключ:

```bash
mkdir -p ~/.ssh
echo "<вставити вміст .pub>" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 6.3 Перевірити SSH з локальної машини

З LAN (напряму по LAN IP):

```bash
ssh -i ~/.ssh/github_actions_fillando_fe deploy@<Frontend LXC LAN IP>
```

> **Note:** NAT правила мають `in-interface-list=WAN`, тому з LAN перевіряємо напряму. GitHub Actions підключається ззовні через `<статичний-IP>:9990` — для них NAT спрацює.

Має підключитися без запиту пароля.

### 6.4 Додати GitHub Secrets

Repo `fillando-fe` → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Значення |
|--------|----------|
Спочатку скопіювати приватний ключ в буфер обміну (на локальній машині):

```bash
cat ~/.ssh/github_actions_fillando_fe | pbcopy
```

Потім додати секрети:

| Secret | Значення |
|--------|----------|
| `SSH_HOST` | Ваш статичний IP |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | Вставити з буфера (приватний ключ, починається з `-----BEGIN OPENSSH PRIVATE KEY-----`) |
| `SSH_PORT` | `9990` |

### 6.5 Workflow

Файл `fillando-fe/.github/workflows/deploy.yml` вже налаштований:

```yaml
name: Deploy Frontend

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
                      cd /srv/fillando-frontend
                      git pull origin main
                      docker compose -f docker-compose.prod.yml build --no-cache frontend
                      docker compose -f docker-compose.prod.yml up -d --no-deps frontend
                      docker image prune -f
```

Що відбувається при push в `main`:

1. GitHub Actions підключається по SSH до Frontend LXC через port forwarding
2. `git pull` — завантажує нові зміни
3. `docker compose build --no-cache frontend` — перебілджує контейнер (включаючи `next build`)
4. `docker compose up -d --no-deps frontend` — перезапускає
5. `docker image prune -f` — очищує старі Docker образи

---

## Крок 7 — Тестування CI/CD

1. Зробити будь-яку зміну в `fillando-fe`
2. Push в `main`
3. GitHub → Actions → побачити запущений workflow
4. Зачекати завершення
5. Перевірити:

```bash
curl https://fillando.com
```

---

## Верифікація (checklist)

**Мережа:**
- [ ] DNS A-запис `fillando.com` вказує на статичний IP
- [ ] CNAME `www.fillando.com` → `fillando.com`
- [ ] Port forwarding працює (80, 443 → NPM; 9990 → Frontend LXC SSH)

**SSL:**
- [ ] `https://fillando.com` — валідний сертифікат (замочок в браузері)
- [ ] `https://www.fillando.com` — редиректить або працює

**Frontend:**
- [ ] `https://fillando.com` — сторінка завантажується
- [ ] `https://fillando.com/auth/login` — форма логіну працює
- [ ] Каталог товарів завантажується (перевірка звʼязку з API)
- [ ] Зображення з S3 відображаються
- [ ] `docker logs fillando-fe` — без помилок

**Auth (потребує працюючий бекенд):**
- [ ] Реєстрація нового користувача
- [ ] Логін/логаут
- [ ] Google OAuth
- [ ] Cookies передаються між `fillando.com` ↔ `api.fillando.com`

**CI/CD:**
- [ ] Push в `main` → GitHub Actions → автодеплой
- [ ] SSH з GitHub Actions доходить до Frontend LXC

---

## Корисні команди

```bash
# Логи
docker logs fillando-fe --tail 100 -f

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

### Docker build OOM (Next.js)

Якщо `docker build` падає при `next build`:

```bash
# Перевірити swap
free -h

# Якщо swap 0 — додати (див. Крок 1)
# Для LXC в Proxmox: CT → Resources → Swap → 2048 MB
```

### 502 Bad Gateway в NPM

NPM не може достукатися до Frontend LXC:

```bash
# З NPM LXC перевірити
curl http://<Frontend_LXC_IP>:3000
```

Якщо не відповідає:
- Frontend LXC запущений?
- Docker контейнер працює? (`docker ps` на Frontend LXC)
- Firewall дозволяє порт 3000? (`sudo ufw status`)

### GitHub Actions SSH timeout

```bash
# Перевірити port forwarding з локальної машини
ssh -p 9990 -i ~/.ssh/github_actions_fillando_fe deploy@<статичний-IP>
```

- Timeout → порт не прокинутий на роутері
- Connection refused → sshd не працює або firewall блокує

### Сторінка завантажується, але API не відповідає

- Перевірити що бекенд працює: `curl https://api.fillando.com/categories`
- Перевірити CORS: в `.env.prod` бекенду `FRONTEND_URL=https://fillando.com`
- Перевірити cookie domain: `.fillando.com` (з крапкою на початку)
- Перевірити `NEXT_PUBLIC_API_BASE_URL` — має бути `https://api.fillando.com`

### Disk space

Docker образи Next.js великі і накопичуються:

```bash
# Видалити невикористовувані образи
docker image prune -f

# Повне очищення (обережно — видаляє volumes!)
docker system prune -a --volumes
```
