import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Wortkarten — Privacy policy / Конфиденциальность",
  description: "How Wortkarten uses account, Google sign-in and vocabulary learning data.",
};

const english = [
  ["Account and learning data", "Wortkarten provides German vocabulary cards and spaced repetition. It stores your email, account identifier, sign-in method, language and study settings, dictionary selections, personal notes and translations, training answers and progress. Password registration stores a password hash rather than the original password. Session credentials are stored as hashes on the server."],
  ["Google sign-in", "Google sign-in is optional. Wortkarten verifies a Google ID token and uses the Google account identifier, email and email verification status to create or link your account. It does not receive your Google password. Google sign-in does not request access to your Gmail or Drive files. Google processes sign-in requests under its own privacy policy."],
  ["Private and shared content", "Personal notes, personal translations, dictionary selections and learning history are not displayed to other users. Administrators have technical access needed to operate and support the service. Shared words, examples, translations, source books and word relations can be published to the common library after moderation or an administrator-approved import. Correction proposals are available to administrators. Please avoid including personal or sensitive information in shared content."],
  ["Purposes and legal bases", "Account and learning data are used to provide the service you request (Article 6(1)(b) GDPR, where applicable). Security, troubleshooting and backups serve the legitimate interest of operating a reliable service (Article 6(1)(f)). Data are not sold or used for advertising profiles. This application does not make automated decisions with legal or similarly significant effects."],
  ["Cookies, browser storage and external services", "An essential HttpOnly cookie keeps your sign-in session for up to seven days; a short-lived cookie protects Google sign-in. The selected interface language is stored in browser local storage. The application code does not include advertising or audience analytics trackers. Pages load fonts from Google Fonts, and the sign-in form loads Google Identity Services when Google sign-in is enabled; those requests disclose connection data such as your IP address to Google. Optional pronunciation uses the browser's speech service; depending on your device and selected voice, text may be processed by its provider."],
  ["Hosting and administrative backups", "The frontend runs on Netlify, the API on a VPS, and the database on Neon PostgreSQL. Hosting providers process technical connection data, including IP addresses, to deliver and protect the service. Database and project backups are stored on the VPS and in the operator's Google Drive. They include account and learning data, password and session hashes. The administrative rclone client requests drive.file access to manage its backup files. This connection uses the operator's Drive, not users' personal Drives."],
  ["Retention and deletion", "Account and learning data are retained while they are needed to provide your account; there is currently no automatic inactivity deletion. You can request deletion by email. Backup rotation targets seven days on the VPS and thirty days in the active Drive backup folder. Deleted Drive files may remain in Google's trash according to its settings. Removing live data does not immediately remove historical backup copies; those copies are restricted to recovery and removed through rotation or targeted handling of a deletion request."],
  ["Your choices and rights", "You can edit your settings and personal materials, sign out and end active sign-ins in the application. To request access, correction, a copy, deletion, restriction or portability of your personal data, or to object to processing based on legitimate interests, contact the email above. Where GDPR applies, you may complain to a competent supervisory authority. Account deletion and a full data export are currently handled by contacting the operator rather than dedicated self-service buttons."],
  ["Providers and changes", "Providers may process data in countries other than your own under their service arrangements. For questions about recipients, processing locations or safeguards, contact the operator. This page will be updated when the service's data practices change."],
] as const;

const russian = [
  ["Аккаунт и учебные данные", "Wortkarten — сервис карточек немецких слов и интервального повторения. Он хранит email, идентификатор аккаунта, способ входа, языковые и учебные настройки, состав личного словаря, личные заметки и переводы, ответы на тренировках и прогресс. При регистрации по паролю сохраняется хеш пароля. Исходный пароль не сохраняется. Учётные данные сессий на сервере также хранятся в виде хешей."],
  ["Вход через Google", "Вход через Google необязателен. Wortkarten проверяет ID-токен Google и использует идентификатор Google-аккаунта, email и статус подтверждения email для создания или подключения аккаунта. Пароль Google приложение не получает. При входе не запрашивается доступ к Gmail или файлам Drive. Google обрабатывает запросы входа по своей политике конфиденциальности."],
  ["Личные и общие материалы", "Личные заметки, личные переводы, состав словаря и история обучения не показываются другим пользователям. Администраторы имеют технический доступ, необходимый для поддержки сервиса. Общие слова, примеры, переводы, книги-источники и связи могут публиковаться в общей библиотеке после модерации или импорта, разрешённого администратором. Предложения исправлений доступны администраторам. Не добавляйте персональные или чувствительные сведения в общие материалы."],
  ["Цели и основания обработки", "Аккаунт и учебные данные используются для предоставления запрошенного сервиса (статья 6(1)(b) GDPR, когда она применима). Защита, устранение сбоев и резервирование служат законному интересу в надёжной работе сервиса (статья 6(1)(f)). Данные не продаются и не используются для рекламного профилирования. Приложение не принимает автоматизированных решений с юридическими или сопоставимыми существенными последствиями."],
  ["Cookie, браузерное хранилище и внешние сервисы", "Необходимый HttpOnly cookie поддерживает вход до семи дней; короткоживущий cookie защищает вход через Google. Язык интерфейса сохраняется в localStorage браузера. В код приложения не включены рекламные и аналитические трекеры. Страницы загружают шрифты Google Fonts, а форма входа — Google Identity Services, когда Google-вход включён. При этих запросах Google получает технические данные соединения, например IP-адрес. Озвучка по запросу использует речевой сервис браузера: в зависимости от устройства и голоса текст может обрабатываться его провайдером."],
  ["Хостинг и административные копии", "Фронтенд размещён на Netlify, API — на VPS, база — в Neon PostgreSQL. Хостинг-провайдеры обрабатывают технические данные соединения, включая IP-адреса, для доставки и защиты сервиса. Копии базы и проекта хранятся на VPS и в Google Drive оператора. В них входят данные аккаунтов и обучения, хеши паролей и сессий. Административный клиент rclone запрашивает drive.file для работы с файлами резервных копий. Он подключён к Drive оператора, а не к личным дискам пользователей."],
  ["Хранение и удаление", "Данные аккаунта и обучения хранятся, пока нужны для работы аккаунта. Автоматического удаления за неактивность сейчас нет. Удаление можно запросить по email. Ротация резервных копий рассчитана на семь дней на VPS и тридцать дней в основной папке Drive. Удалённые файлы Drive могут оставаться в корзине согласно настройкам Google. Удаление из рабочей базы не означает немедленного удаления из старых копий: они используются для восстановления и удаляются ротацией либо при отдельной обработке запроса на удаление."],
  ["Возможности и права", "В приложении можно менять настройки и личные материалы, выходить и завершать активные входы. Для запроса доступа, исправления, копии, удаления, ограничения или переноса персональных данных, а также возражения против обработки на основании законного интереса напишите на email выше. Когда применяется GDPR, можно обратиться с жалобой в компетентный надзорный орган. Удаление аккаунта и полный экспорт пока запрашиваются у оператора: отдельных кнопок самообслуживания для них нет."],
  ["Провайдеры и изменения", "Провайдеры могут обрабатывать данные в других странах в соответствии с условиями своих сервисов. С вопросами о получателях, местах обработки и мерах защиты обращайтесь к оператору. При изменении обработки данных эта страница будет обновляться."],
] as const;

export default function PrivacyPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.back} href="/">← Wortkarten</Link>
      <p className={styles.eyebrow}>WORTKARTEN · PRIVACY</p>
      <h1>Privacy policy<br /><span lang="ru">Политика конфиденциальности</span></h1>
      <p className={styles.meta}>Updated / Обновлено: <time dateTime="2026-11-12">12.11.2026</time></p>
      <nav className={styles.languages} aria-label="Policy languages / Языки политики">
        <a href="#english" lang="en">English</a><a href="#russian" lang="ru">Русский</a>
      </nav>
    </header>
    <section className={styles.contact} aria-label="Contact / Контакт">
      <strong>Wortkarten</strong>
      <p>Data and privacy contact / Вопросы о персональных данных:</p>
      <a href="mailto:rosly.a777@gmail.com">rosly.a777@gmail.com</a>
    </section>
    <nav className={styles.providers} aria-label="Provider privacy policies / Политики провайдеров">
      <span>Provider policies / Политики провайдеров:</span>
      <a href="https://policies.google.com/privacy">Google</a>
      <a href="https://www.netlify.com/privacy/">Netlify</a>
      <a href="https://neon.com/privacy-policy">Neon</a>
    </nav>
    {[{ id: "english", lang: "en", title: "Privacy policy", sections: english }, { id: "russian", lang: "ru", title: "Политика конфиденциальности", sections: russian }].map(({ id, lang, title, sections }) => <article key={id} id={id} lang={lang} className={styles.article}>
      <h2>{title}</h2>
      {sections.map(([heading, body]) => <section key={heading}><h3>{heading}</h3><p>{body}</p></section>)}
    </article>)}
  </main>;
}
