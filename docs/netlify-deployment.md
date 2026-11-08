# Wortkarten frontend на Netlify

Инструкция от 08.11.2026 для Next.js 15.5.x. Приложению нужен Next.js runtime:
оно использует same-origin API proxy и HttpOnly cookies. Это не static export
и не загрузка папки out. Netlify автоматически подключает текущий OpenNext adapter;
закреплять старый nextjs plugin не нужно.
[Официальная инструкция Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/).

## 1. Создать проект

Netlify → Add new project → Import an existing project → GitHub →
AlexRosly/german-vocab-frontend → main. Выберите постоянное имя сайта заранее,
например YOUR-SITE.netlify.app. Этот origin потребуется backend и Google Cloud.

| Поле | Значение |
| --- | --- |
| Base directory | пусто, корень frontend-репозитория |
| Build command | из netlify.toml: `node scripts/check-netlify-env.mjs && npm run build` |
| Publish directory | `.next` |
| Node | 22, задано в netlify.toml |

Не задавать `next start` как команду запуска, не выбирать out и не добавлять
SPA-правило `/* /index.html 200`: они ломают Next.js proxy/runtime.

Перед первым deploy заполните переменные шага 2 и подготовьте публичный backend.

## 2. Environment variables

В Project configuration → Environment variables, для production deploy:

```text
NEXT_PUBLIC_API_URL=/api/v1
API_PROXY_ORIGIN=https://ypbooking.chost.com.ua
```

API_PROXY_ORIGIN — реальный публичный HTTPS origin готового backend, без
`/api/v1`, credentials, query и fragment. Если выделен другой API-домен,
подставьте его. `localhost` для Netlify означает сам Netlify, не VPS.
Переменные должны быть доступны сборке; при выборе scopes дать также Functions,
чтобы окружение было согласовано с runtime. После любого изменения сделать новый
deploy: NEXT_PUBLIC_API_URL и rewrite назначения фиксируются во время сборки.
[Next.js: build-time variables](https://nextjs.org/docs/app/guides/environment-variables).

DATABASE_URL, пароль БД и Client Secret во frontend не добавлять.
Google Client ID frontend получает от backend через /auth/google/config;
отдельная NEXT_PUBLIC_GOOGLE_CLIENT_ID не нужна. netlify.toml не содержит секретов.

## 3. Backend и Google

На backend .env:

```text
NODE_ENV=production
FRONTEND_ORIGIN=https://YOUR-SITE.netlify.app
GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=существующий Web Client ID Wortkarten
```

После изменения backend .env перезапустить только Wortkarten API. DATABASE_URL
оставить на текущей рабочей Neon. Для отдельного VPS backend можно сразу задать
Netlify origin, сохранив старый Render backend для старого frontend.

В Google Cloud → Google Auth Platform → Clients → существующий Web application:
добавить `https://YOUR-SITE.netlify.app` в Authorized JavaScript origins. При своём
домене добавить и его точный origin. Старый Render origin пока сохранить для отката.
Для используемого GIS popup redirect URI и Client Secret не требуются.
[Google: настройка Client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

Логин проверять на постоянном production URL, не на случайном deploy-preview:
Origin guard и Google не принимают wildcard-домены всех preview.

## 4. Deploy и проверка

Trigger deploy → Deploy site. В логе должны пройти проверка proxy configuration,
`next build` и настройка Netlify Next.js runtime. Для этого проекта файл netlify.toml
уже подготовлен. Сборку можно проверить локально на Node 22 с такими же переменными;
локальная сборка не заменяет реальный Netlify-тест cookies.

Проверить:

```bash
curl --fail https://YOUR-SITE.netlify.app/api/v1/health
curl --fail https://YOUR-SITE.netlify.app/api/v1/auth/google/config
curl -i -X POST https://YOUR-SITE.netlify.app/api/v1/auth/google/challenge -H 'Origin: https://YOUR-SITE.netlify.app'
```

Последний запрос создаёт только временную попытку входа. Ожидается 200 и Set-Cookie
для wortkarten_google_nonce: HttpOnly, Secure, SameSite=Lax, Path=/api/v1/auth.
Не публикуйте тело nonce/cookies из этого ответа. Затем в браузере проверить
вход, Google, reload, выход и словарь. У владельца должен остаться ADMIN и свой
словарь: пользовательские данные живут в Neon, а не в размещении frontend.

Все запросы приложения должны идти на адрес сайта `/api/v1/...`. Если браузер
напрямую обращается к onrender/localhost, NEXT_PUBLIC_API_URL задан неправильно
или открыта старая сборка. После переноса повторно войдите на новом домене:
cookies старого frontend не переносятся между разными доменами.

## 5. Типичные ошибки

| Симптом | Что проверить |
| --- | --- |
| Build остановлен check-netlify-env | Обе переменные, HTTPS origin без пути |
| /api/v1/health возвращает 404 | Next.js runtime и rewrite; нет ли SPA redirect |
|502 | Публичный HTTPS backend, PM2 и Hestia upstream |
|403 «Недопустимый источник запроса» | FRONTEND_ORIGIN совпадает с адресной строкой |
| Google-кнопки нет | config enabled:true на backend и через Netlify proxy |
| Google origin_not_allowed | Точный origin в том же Google Client ID |
| Вход теряется после reload | Set-Cookie, Secure/Path, передача cookies через proxy |

Для отката выберите предыдущий deploy Netlify. Для смены API_PROXY_ORIGIN нужен
новый deploy, не только сохранение переменной. Render не отключать до успешной
проверки реальных входов/словаря. Ни миграции БД, ни повторный импорт слов при
переносе frontend не требуются.

Статус: инструкция и конфигурация подготовлены. Сам Netlify-сайт, DNS и Google
Cloud этой работой не менялись; настоящий Netlify smoke-тест выполняется после deploy.
