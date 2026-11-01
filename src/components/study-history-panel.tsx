"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { displayTranslation } from "@/lib/word-view";
import { StudyHistoryClient, type HistoryDetail, type HistoryPage } from "@/lib/study-history-client";
import { safeErrorMessage } from "@/lib/i18n";
import { useI18n } from "./ui-language-provider";
import styles from "./study-history-panel.module.css";

const client = new StudyHistoryClient(apiFetch);
const emptyPage: HistoryPage = { sessions: [], nextCursor: null };

export function StudyHistoryPanel({ userId, language, version }: { userId: string; language: string; version: number }) {
  const { t, errorText, date, count } = useI18n();
  const [page, setPage] = useState<HistoryPage>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const moreController = useRef<AbortController | null>(null);
  const moreBusyRef = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1; moreController.current?.abort(); moreBusyRef.current = false;
    setMoreBusy(false); setMoreError(""); setPage(emptyPage); setSelected(null); setLoading(true); setError("");
    void client.page(undefined, controller.signal).then((data) => { if (!controller.signal.aborted) setPage(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Не удалось загрузить историю тренировок")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreController.current?.abort(); generation.current += 1; };
  }, [userId, language, version, attempt]);

  async function loadMore() {
    if (!page.nextCursor || moreBusyRef.current) return;
    const controller = new AbortController(); moreController.current = controller;
    const current = generation.current;
    moreBusyRef.current = true; setMoreBusy(true); setMoreError("");
    try {
      const next = await client.page(page.nextCursor, controller.signal);
      if (!controller.signal.aborted && generation.current === current) setPage((previous) => ({
        sessions: [...new Map([...previous.sessions, ...next.sessions].map((row) => [row.id, row])).values()], nextCursor: next.nextCursor,
      }));
    } catch (failure) {
      if (!controller.signal.aborted && generation.current === current) setMoreError(safeErrorMessage(failure, "Не удалось загрузить историю тренировок"));
    } finally {
      if (!controller.signal.aborted && generation.current === current) { moreBusyRef.current = false; setMoreBusy(false); }
    }
  }

  return <section className={styles.panel} aria-labelledby="history-heading">
    <div className={styles.heading}><div><p className="eyebrow">{t("ТВОЁ ОБУЧЕНИЕ")}</p><h3 id="history-heading">{t("История тренировок")}</h3></div>
      <button type="button" disabled={loading || moreBusy} onClick={() => setAttempt((value) => value + 1)}>{t("Обновить историю")}</button>
    </div>
    <p className={styles.hint}>{t("Здесь сохранённые тренировки вашего аккаунта. Откройте запись, чтобы посмотреть ответы по словам.")}</p>
    {loading ? <p role="status">{t("Загружаем историю…")}</p> : error ? <p className={styles.error} role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("Повторить")}</button></p>
      : !page.sessions.length ? <div className={styles.empty}><h4>{t("Пока нет сохранённых тренировок")}</h4><p>{t("Пройдите тренировку и сохраните результаты — запись появится здесь.")}</p></div>
      : <>
        <p className={styles.hint}>{t("Загружено тренировок: {count}", { count: page.sessions.length })}</p>
        <ol className={styles.list}>
          {page.sessions.map((session) => <li key={session.id} className={styles.session}>
            <div className={styles.heading}><h4><time dateTime={session.completedAt}>{date(session.completedAt)}</time></h4>
              <button type="button" aria-expanded={selected === session.id} aria-controls={`history-${session.id}`}
                onClick={() => setSelected((current) => current === session.id ? null : session.id)}>{t(selected === session.id ? "Скрыть слова" : "Показать слова")}</button>
            </div>
            <dl className={styles.totals}>
              <div><dt>{t("Всего слов")}</dt><dd>{count(session.totalWords)}</dd></div>
              <div><dt>{t("Знаю")}</dt><dd>{session.knownCount}</dd></div>
              <div><dt>{t("Нужно повторить")}</dt><dd>{session.needsReviewCount}</dd></div>
            </dl>
            {selected === session.id && <div id={`history-${session.id}`}><HistorySessionDetail key={`${session.id}-${language}-${version}`} sessionId={session.id} userId={userId} language={language} version={version} /></div>}
          </li>)}
        </ol>
        {moreError && <p className={styles.error} role="alert">{errorText(moreError)}</p>}
        {page.nextCursor && <button type="button" disabled={moreBusy} onClick={() => void loadMore()}>{t(moreBusy ? "Загружаем историю…" : "Загрузить ещё")}</button>}
      </>}
  </section>;
}

function HistorySessionDetail({ sessionId, userId, language, version }: { sessionId: string; userId: string; language: string; version: number }) {
  const { t, errorText } = useI18n();
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<"all" | "KNOWN" | "NEEDS_REVIEW">("all");
  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setError(""); setFilter("all");
    void client.detail(sessionId, userId, language, controller.signal).then((data) => { if (!controller.signal.aborted) setDetail(data); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Не удалось загрузить тренировку")); });
    return () => controller.abort();
  }, [sessionId, userId, language, version, attempt]);
  if (error) return <p className={styles.error} role="alert">{errorText(error)} <button type="button" onClick={() => setAttempt((value) => value + 1)}>{t("Повторить")}</button></p>;
  if (!detail) return <p role="status">{t("Загружаем тренировку…")}</p>;
  const words = detail.words.filter((row) => filter === "all" || row.answer === filter);
  return <section className={styles.details} aria-label={t("Ответы по словам")}>
    <p className={styles.hint}>{t("Ответы сохранены во время тренировки. Формы и переводы слов показаны в текущем виде.")}</p>
    {detail.words.length < detail.totalWords && <p className={styles.notice}>{t("Часть карточек сейчас недоступна. Итоговые счётчики тренировки сохранены.")}</p>}
    {!detail.words.length ? <p>{t("Детали карточек сейчас недоступны.")}</p> : <>
      <div className={styles.filters} aria-label={t("Фильтр ответов")}>
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t("Все ответы")}</button>
        <button type="button" aria-pressed={filter === "KNOWN"} onClick={() => setFilter("KNOWN")}>{t("Знаю")}</button>
        <button type="button" aria-pressed={filter === "NEEDS_REVIEW"} onClick={() => setFilter("NEEDS_REVIEW")}>{t("Нужно повторить")}</button>
      </div>
      {!words.length ? <p>{t("Нет ответов в этой категории.")}</p> : <ul className={styles.words}>{words.map((row) => <li key={row.id}>
        <div><strong>{row.word.article !== "none" && `${row.word.article} `}{row.word.german}</strong><p>{displayTranslation(row.word, t("Перевод отсутствует"))}</p></div>
        <span className={row.answer === "KNOWN" ? styles.known : styles.review}>{t(row.answer === "KNOWN" ? "Знаю" : "Нужно повторить")}</span>
      </li>)}</ul>}
    </>}
  </section>;
}
