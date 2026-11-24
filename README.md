# Dzen AI Studio — Конвейер контента (Модули 1–4)

Веб-приложение с защищённой админ-панелью по адресу `http://igrovoikompas.ru/dzen/` для автоматизации создания, «очеловечивания», проверки и подготовки статей для Дзена.

## Возможности
- **Модуль 1 (Радар тем):** предустановленные ТОП-10 ниш (с ориентирами RPM и времени чтения) + свои ниши, быстрый запуск по теме и живой парсинг трендов (Google Trends RU / Google News RSS + Search Grounding) со скорингом.
- **Модуль 2 (7-этапный пайплайн и 10-пт Валидатор):** *Стратег → SEO-оптимизатор → Архитектор → Писатель → Детектор + Стилист + Инжектор человечности → Фактчекер → Редактор*, библиотека стиля RAG, справочник CPA-офферов и детерминированный 10-пунктный чек-лист приёмки.
- **Модуль 3 (Визуал):** генерация не-стоковых обложек (`16:9`) и внутренних иллюстраций (`4:3`).
- **Модуль 4 (Выдача и публикация):** режим по умолчанию **«Копирование с вёрсткой»** (HTML-буфер, `.docx`, `.md`, `.html`, `.zip`-архив картинок) и опциональная отправка в Telegram-канал для `@zen_sync_bot` по тумблеру в админке.
- **Мультипровайдерность:** серверный адаптер для Gemini, Z.ai (Zhipu GLM + CogView), Ollama (локально / self-hosted), OpenRouter, DeepSeek, OpenAI, Groq, Qwen, Mistral, xAI Grok, Together AI, Anthropic Claude, YandexGPT, кастомных OpenAI-совместимых API и Kandinsky.

---

## 1. Загрузка проекта в GitHub (`https://github.com/doktorpull/dzen2.git`)

1. Скачайте архив проекта из Google AI Studio (или используйте встроенный экспорт в GitHub в панели AI Studio, если подключён аккаунт).
2. Распакуйте проект локально и выполните в папке с проектом:

```bash
git init
git add .
git commit -m "Initial commit: Dzen AI Studio (Modules 1-4)"
git branch -M main
git remote add origin https://github.com/doktorpull/dzen2.git
git push -u origin main
```

> Файлы `.env` и локальная папка `data/` уже добавлены в `.gitignore` и не попадут в репозиторий.

---

## 2. Установка и запуск на VPS (Docker + порт 8003)

### Требования на сервере
- Docker и Docker Compose (`docker compose version`)
- Nginx (для проксирования `http://igrovoikompas.ru/dzen/` на порт `8003`)

### Шаг 1. Клонирование репозитория на VPS

```bash
mkdir -p /opt/projects
cd /opt/projects
git clone https://github.com/doktorpull/dzen2.git
cd dzen2
```

### Шаг 2. Настройка переменных окружения `.env`

Скопируйте шаблон и заполните своими значениями:

```bash
cp .env.example .env
nano .env
```

Обязательные параметры в `.env`:
```env
PORT=8003
APP_URL="http://igrovoikompas.ru/dzen/"
DATA_DIR="/app/data"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="задайте_сложный_пароль"
SESSION_SECRET="сгенерируйте_случайную_строку_64_символа"

# Нужен хотя бы один текстовый провайдер (или локальная Ollama):
GEMINI_API_KEY="ваш_ключ_gemini"
# ZAI_API_KEY=""          # Z.ai (Zhipu GLM + CogView)
# OLLAMA_BASE_URL="http://host.docker.internal:11434/v1" # Ollama на хосте VPS
# OPENROUTER_API_KEY=""   # Единый ключ к 200+ моделям
# DEEPSEEK_API_KEY=""
# OPENAI_API_KEY=""
# GROQ_API_KEY=""
# QWEN_API_KEY=""
# MISTRAL_API_KEY=""
# XAI_API_KEY=""
# TOGETHER_API_KEY=""
# ANTHROPIC_API_KEY=""
# YANDEX_API_KEY=""
# YANDEX_FOLDER_ID=""
# KANDINSKY_API_KEY=""
# KANDINSKY_SECRET_KEY=""
# TELEGRAM_BOT_TOKEN=""
# TELEGRAM_CHANNEL_ID=""
```

Сгенерировать надёжный `SESSION_SECRET` можно командой:
```bash
openssl rand -hex 32
```

### Шаг 3. Сборка и запуск Docker-контейнера

```bash
mkdir -p data/images
docker compose up -d --build
```

Проверка, что сервис запущен на порту `8003`:
```bash
docker compose ps
curl -s http://127.0.0.1:8003/api/health
# Ожидаемый ответ: {"ok":true,"service":"dzen-ai-studio"}
```

Просмотр логов при необходимости:
```bash
docker compose logs -f dzen-ai-studio
```

---

## 3. Настройка Nginx для `http://igrovoikompas.ru/dzen/`

Откройте конфигурацию виртуального хоста `igrovoikompas.ru` (обычно `/etc/nginx/sites-available/igrovoikompas.ru` или `/etc/nginx/conf.d/igrovoikompas.ru.conf`) и добавьте внутрь блока `server { ... }` содержимое файла `nginx.dzen.conf`:

```nginx
location = /dzen {
    return 301 /dzen/;
}

location /dzen/ {
    proxy_pass http://127.0.0.1:8003/dzen/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Важно для работы потокового отображения 7 этапов (SSE)
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    client_max_body_size 20M;
}
```

Проверьте и перезапустите Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

После этого админка откроется по адресу **`http://igrovoikompas.ru/dzen/`**.

---

## 4. Обновление проекта на VPS

Когда вы вносите изменения в GitHub-репозиторий, обновление на сервере занимает две команды (база `./data/dzen.db` и сгенерированные картинки сохраняются в томе `./data`):

```bash
cd /opt/projects/dzen2
git pull
docker compose up -d --build
```
