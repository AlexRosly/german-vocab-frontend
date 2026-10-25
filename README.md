# german-vocab-frontend

Frontend-репозиторий приложения для изучения немецких слов.

## Требования
- Node.js 20.9+
- Запущенный backend из репозитория `german-vocab-backend`

## Запуск
```bash
cp .env.example .env.local
npm install
npm run dev
```
Откройте http://localhost:3000.

`NEXT_PUBLIC_API_URL` должен указывать на backend, по умолчанию `http://localhost:3001/api/v1`.

## Текущий объём
- Адаптивный стартовый экран.
- Форма добавления слова.
- Список слов, загружаемый с API.
- Визуальные категории: der — синий, das — зелёный, die (женский род) — красный/розовый, множественное число — жёлтый/оранжевый.
- Это начальный каркас; авторизация, полноценная локализация, повторение и PWA-манифест будут добавлены следующими итерациями.

## Git
```bash
git init
git add .
git commit -m "chore: initialize frontend"
```
