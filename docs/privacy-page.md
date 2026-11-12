# Публичная страница обработки данных — 12.11.2026

- `/privacy` доступна без входа; статический текст на английском и русском.
- Общий footer содержит описание Wortkarten и ссылку на страницу на RU/EN/DE/UK.
- Контакт `rosly.a777@gmail.com` владелец подтвердил для публикации в чате.
- Текст сверялся с Prisma, Google ID-token flow, cookie (refresh до7 дней),
  localStorage языка, Google Fonts, Web Speech, Netlify/VPS/Neon и фактическими
  backup на Drive. Доступ к Drive пользователя для обычного входа не запрашивается.
- Для Google Branding после деплоя: `https://deutsch-wortkarten.netlify.app/privacy`.
  Сначала проверить URL в приватном окне без аккаунта, затем сохранить Branding
  и повторить Publish app в Audience. Terms link не заполнять несуществующим адресом.
- Эта работа не закрывает R12 целиком. Полное имя/организация ответственного,
  страна, почтовый адрес при необходимости, юридическая применимость,
  действительные соглашения с обработчиками, международные передачи и сроки
  инфраструктурных логов ещё не подтверждены. Не выдумывать эти сведения.
  Текст описывает текущую реализацию и не является заключением о соответствии GDPR.
- Удаление аккаунта и полный экспорт пока отсутствуют в UI; requests через email,
  оператор должен обеспечить их фактическую обработку. Нельзя обещать автоматическое
  удаление старых backup или немедленную очистку корзины Drive.
- Внешние Google Fonts/Identity сейчас загружаются по существующей реализации;
  локальное размещение шрифтов и отдельная оценка оснований внешних запросов
  остаются частью дальнейшего privacy review. Cookie consent banner этой правкой
  не добавлялся, соответствие всем требованиям из-за одной страницы не заявляется.

Источники: [Google branding requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification),
[Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies),
[GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
