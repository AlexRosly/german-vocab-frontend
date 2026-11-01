# Демо на Render: frontend

Обновлено 01.11.2026. Демо размещено пользователем:
frontend https://german-vocab-frontend.onrender.com,
API https://german-vocab-backend-pxp3.onrender.com.
После применения auth-миграции к ветке «миграцион» проверены health и чтение
сессий через proxy; регистрация подтверждена пользователем, ADMIN назначен.
Полный smoke-тест двух аккаунтов остаётся в плане. Ниже — воспроизводимые
настройки и порядок для нового размещения, а не список уже ожидающих действий.

## Схема

Браузер → HTTPS frontend (Next.js Web Service) → `/api/v1/*` → HTTPS backend
(NestJS Web Service) → выбранная демо/тестовая база Neon PostgreSQL.

Браузер использует один origin. Next.js rewrites проксирует только фиксированный
API-префикс. Refresh cookie остаётся HttpOnly/SameSite=Lax, в production Secure;
ослаблять cookie для разных хостинговых доменов не требуется. CORS и AuthOriginGuard
на backend сохраняются. Этот режим требует Node Web Service, не Static Site.

## Настройки Web Service

| Поле | Значение |
| --- | --- |
| Repository | AlexRosly/german-vocab-frontend |
| Branch / Region / Plan | main / Frankfurt / Free |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm run start -- --hostname 0.0.0.0` |
| Health check | `/` |
| NODE_VERSION / NODE_ENV | `22` / `production` |
| NEXT_PUBLIC_API_URL | `/api/v1` |
| API_PROXY_ORIGIN | фактический HTTPS origin API, без `/api/v1` |

`render.yaml` задаёт те же параметры. Значения URL уточняются после создания
сервисов. Изменение build-time переменных требует повторной сборки. При включённом
прокси клиентский URL должен оставаться `/api/v1`; неверная комбинация остановит
сборку. Не хранить DATABASE_URL во frontend. Обычный локальный режим без
API_PROXY_ORIGIN сохраняет прежнее поведение.

## Порядок размещения

1. Выбрать копию/демо-ветку Neon и проверить её миграции. Основную базу не менять
   без отдельного согласия. Подготовить два демо-аккаунта USER и ADMIN отдельно.
2. Создать backend по инструкции в его `docs/render-deployment.md`; получить URL API.
3. Создать frontend и указать этот URL в API_PROXY_ORIGIN. Получить URL frontend.
4. Указать точный URL frontend без завершающего слеша в FRONTEND_ORIGIN backend,
   перезапустить backend. Первый временный FRONTEND_ORIGIN не считать рабочим.
5. Проверить frontend `/api/v1/health`, регистрацию, вход, перезагрузку страницы,
   выход и второй аккаунт. В браузере запросы должны идти на frontend `/api/v1`,
   не напрямую на API. Проверить сохранение сессии после refresh cookie.
6. Проверить настоящее создание слова, модерацию, перевод и тренировку с реальной
   выбранной БД. Прежние mock-тесты этого не подтверждают.

В конфигурации auto-deploy выключен: push остаётся частью рабочего процесса,
а обновление публичного демо выполняется отдельным действием после проверки.
Позже его можно включить осознанно вместе с CI. Перед показом открыть приложение
заранее, пройти короткую тренировку и подготовить локальный резервный показ.

## Ограничения бесплатного размещения

Render Free усыпляет неактивный web service после 15 минут; пробуждение занимает
примерно минуту. 750 часов в месяц общие на workspace, а не на каждый сервис.
Два постоянно активных сервиса не укладываются в этот общий месячный лимит.
Для демо подходит; гарантированную постоянную доступность Free не обещает.
Базу оставляем в Neon: бесплатная БД Render имеет срок жизни 30 дней.

Источники, проверены 01.11.2026: [Render Free](https://render.com/docs/free),
[Next.js на Render](https://render.com/docs/deploy-nextjs-app),
[Node version](https://render.com/docs/node-version),
[Next 15 rewrites](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/rewrites),
[Blueprint](https://render.com/docs/blueprint-spec), [Neon](https://neon.com/docs/introduction/plans).
