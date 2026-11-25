import type { Metadata } from "next";
import Link from "next/link";
import styles from "../privacy/privacy.module.css";
export const metadata: Metadata = { title: "Wortkarten — Kontakt / Contact / Контакты", description: "Operator and contact details for the free personal Wortkarten learning project." };
export default function ContactPage() { return <main className={styles.page}>
  <header className={styles.header}><Link className={styles.back} href="/">← Wortkarten</Link><h1>Kontakt / Contact / Контакты</h1><p className={styles.meta}>24.11.2026</p></header>
  <section className={styles.contact}><h2>Oleksandr Roslyi</h2><p>Deutschland · Germany · Германия</p><p><a href="mailto:rosly.a777@gmail.com">rosly.a777@gmail.com</a></p></section>
  <article className={styles.article} lang="de"><h2>Über das Projekt</h2><p>Wortkarten ist ein kostenloses persönliches Lernprojekt für deutsche Vokabeln. Es wird derzeit nicht als Angebot eines Unternehmens betrieben. Es gibt keine kostenpflichtige Mitgliedschaft.</p><p>Für Unterstützung, Fehlerhinweise und Datenschutzanfragen kontaktiere den Betreiber per E-Mail. Bitte keine Passwörter oder Anmeldecodes senden. Bei Kartenfehlern nutze auch „Korrektur vorschlagen“ im Wörterbuch.</p></article>
  <article className={styles.article} lang="en"><h2>About the project</h2><p>Wortkarten is a free personal project for learning German vocabulary. It is currently not operated as an organization’s commercial service. There is no paid membership.</p><p>Contact the operator by email for support, error reports and privacy requests. Do not send passwords or sign-in codes. Card corrections can also be proposed from the dictionary.</p></article>
  <article className={styles.article} lang="ru"><h2>О проекте</h2><p>Wortkarten — бесплатный личный учебный проект для изучения немецких слов. Сейчас он не является коммерческим сервисом организации. Платной подписки нет.</p><p>По вопросам поддержки, ошибок и персональных данных напишите владельцу. Пароли и коды входа отправлять не нужно. Ошибку в карточке можно сообщить кнопкой «Предложить исправление».</p></article>
  <nav className={styles.providers}><Link href="/privacy">Datenschutz / Privacy / Конфиденциальность</Link><Link href="/terms">Nutzungsregeln / Rules / Правила</Link></nav>
</main>; }
