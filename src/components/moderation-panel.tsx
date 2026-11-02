"use client";
import { RelatedWords } from "./related-words";
import { safeErrorMessage } from "@/lib/i18n";
import { useI18n } from "./ui-language-provider";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ModerationClient, ModerationError, type ModerationWord, type PublicationStatus, type ReviewCard } from "@/lib/moderation-client";
import { publicationLabel } from "@/lib/word-view";
import styles from "./moderation-panel.module.css";

const client = new ModerationClient(apiFetch);
const statuses: PublicationStatus[] = ["PENDING_REVIEW", "PUBLISHED", "REJECTED"];
const actionLabels: Record<PublicationStatus, string> = {
  PUBLISHED: "Опубликовать", REJECTED: "Отклонить", PENDING_REVIEW: "Вернуть на проверку",
};
const message = (error: unknown) => error instanceof Error ? safeErrorMessage(error) : "Не удалось выполнить запрос. Повторите попытку.";

export function ModerationPanel({ decisionsLocked, onDecision, onBusyChange, translationVersion, onEditTranslations, translationLanguage }: {
  decisionsLocked: boolean; onDecision: () => Promise<void>; onBusyChange: (busy: boolean) => void;
  translationLanguage: string; translationVersion: number; onEditTranslations: (word: { id: string; german: string }) => void;
}) {
  const { t, errorText } = useI18n();
  const [filter, setFilter] = useState<PublicationStatus>("PENDING_REVIEW");
  const [listAttempt, setListAttempt] = useState(0);
  const [words, setWords] = useState<ModerationWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [detail, setDetail] = useState<ReviewCard | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [confirmation, setConfirmation] = useState<PublicationStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError(""); setWords([]);
    void client.list(filter, controller.signal).then((data) => { if (!controller.signal.aborted) setWords(data); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setListError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, listAttempt, translationVersion]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setDetailLoading(true); setDetail(null); setDetailError(""); setDecisionError("");
    setDuplicateId(null); setConfirmation(null); setBlocked(false);
    void client.detail(selectedId, controller.signal).then((data) => { if (!controller.signal.aborted) setDetail(data); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setDetailError(message(error)); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, detailAttempt, translationVersion]);

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  function openCard(id: string) {
    if (savingRef.current) return;
    setNotice(""); setDetail(null); setSelectedId(id); setDetailAttempt((value) => value + 1);
  }

  async function decide() {
    if (!detail || !confirmation || decisionsLocked || blocked || savingRef.current) return;
    savingRef.current = true; setSaving(true); onBusyChange(true); setDecisionError(""); setNotice("");
    try {
      const updated = await client.changeStatus(detail, confirmation);
      setDetail(updated); setConfirmation(null);
      setNotice("Решение сохранено.");
      setListAttempt((value) => value + 1);
      await onDecision();
    } catch (error) {
      setConfirmation(null); setBlocked(true); setDecisionError(message(error));
      if (error instanceof ModerationError && error.code === "DUPLICATE_WORD") setDuplicateId(error.wordId ?? null);
    } finally { savingRef.current = false; setSaving(false); onBusyChange(false); }
  }

  return <section className={styles.panel} aria-labelledby="moderation-heading">
    <div className={styles.heading}><div><p className="eyebrow">{t("АДМИНИСТРАТОР")}</p><h3 id="moderation-heading">{t("Модерация карточек")}</h3></div>
      <div className={styles.filters}><label htmlFor="moderation-filter">{t("Статус карточек")}</label>
        <select id="moderation-filter" value={filter} disabled={saving} onChange={(event) => {
          setFilter(event.target.value as PublicationStatus); setSelectedId(null); setDetail(null); setDetailLoading(false);
          setDetailError(""); setDecisionError(""); setConfirmation(null); setNotice("");
        }}>{statuses.map((status) => <option key={status} value={status}>{t(publicationLabel(status))}</option>)}</select>
        <button type="button" disabled={saving || loading} onClick={() => setListAttempt((value) => value + 1)}>{t("Обновить список")}</button>
      </div>
    </div>
    <p className={styles.hint}>{t("Откройте карточку, проверьте все переводы и примеры, затем выберите решение.")}</p>
    {decisionsLocked && <p role="status" className={styles.warning}>{t("Для решения завершите тренировку и сохраните результаты.")}</p>}
    {notice && <p role="status" className={styles.notice}>{t(notice)}</p>}
    <div className={styles.layout}>
      <div aria-label={t("Список карточек на модерации")}>
        {loading ? <p role="status">{t("Загружаем список…")}</p> : listError ? <p role="alert" className={styles.error}>{errorText(listError)}</p> : !words.length ? <p>{t("Карточек с этим статусом нет.")}</p> : <ul className={styles.queue}>
          {words.map((word) => <li key={word.id}><button type="button" disabled={saving} aria-pressed={selectedId === word.id} onClick={() => openCard(word.id)}>
            <strong>{word.article !== "none" && `${word.article} `}{word.german}</strong>
            <span>{t(publicationLabel(word.publicationStatus))} · {word.level ?? t("Без уровня")}</span>
          </button></li>)}
        </ul>}
      </div>
      <section className={styles.review} aria-label={t("Проверка карточки")} aria-busy={detailLoading || saving}>
        {!selectedId ? <p className={styles.hint}>{t("Выберите карточку в списке.")}</p> : <>
          <button type="button" className={styles.reload} disabled={detailLoading || saving} onClick={() => openCard(selectedId)}>{t("Открыть актуальную карточку")}</button>
          {detailLoading ? <p role="status">{t("Загружаем карточку…")}</p> : detailError ? <p className={styles.error} role="alert">{errorText(detailError)}</p> : detail && <>
            <p className={styles.status}>{t(publicationLabel(detail.publicationStatus))}</p>
            <h4>{detail.article !== "none" && `${detail.article} `}{detail.german}</h4>
            <dl className={styles.facts}>
              <div><dt>{t("Число")}</dt><dd>{{ singular: t("Единственное"), plural: t("Множественное"), not_applicable: t("Не применимо") }[detail.grammaticalNumber]}</dd></div>
              <div><dt>{t("Мн. форма")}</dt><dd>{detail.pluralForm || t("Не указана")}</dd></div>
              <div><dt>{t("Уровень / урок")}</dt><dd>{detail.level ?? "—"} / {detail.lessonNumber ?? "—"}</dd></div>
            </dl>
            {detail.notes && <p className={styles.notes}>{detail.notes}</p>}
            <RelatedWords key={detail.id} wordId={detail.id} language={translationLanguage} />
            <h5>{t("Переводы карточки")}</h5>
            {!detail.translations.length ? <p>{t("Переводов пока нет.")}</p> : <dl className={styles.translations}>{detail.translations.map((row) => <div key={row.language}><dt>{row.language.toUpperCase()}</dt><dd>{row.text}</dd></div>)}</dl>}
            <button type="button" disabled={saving || decisionsLocked} onClick={() => {
              setConfirmation(null); onEditTranslations(detail);
            }}>{t("Редактировать переводы")}</button>
            <h5>{t("Примеры употребления")}</h5>
            {!detail.examples.length ? <p className={styles.hint}>{t("Примеров пока нет.")}</p> : <>{detail.examples.map((example) => <blockquote key={example.id}><p>{example.german}</p>{example.translations.length ? example.translations.map((entry) => <p className={styles.hint} key={entry.language}>{entry.language}: {entry.text}</p>) : <p className={styles.hint}>{t("Переводов пока нет.")}</p>}</blockquote>)}</>}
            {decisionError && <div className={styles.warning} role="alert"><p>{errorText(decisionError)}</p><p>{t("Перед следующим решением откройте актуальную карточку и проверьте её ещё раз.")}</p>
              {duplicateId && <button type="button" disabled={saving} onClick={() => openCard(duplicateId)}>{t("Посмотреть существующую карточку")}</button>}
            </div>}
            <div className={styles.actions}>{statuses.filter((status) => status !== detail.publicationStatus).map((status) => <button type="button" key={status}
              disabled={saving || blocked || decisionsLocked} className={status === "PUBLISHED" ? styles.primary : undefined} onClick={() => setConfirmation(status)}>
              {status === "REJECTED" && detail.publicationStatus === "PUBLISHED" ? t("Снять с публикации") : t(actionLabels[status])}
            </button>)}</div>
            {confirmation && <section className={styles.confirmation} aria-label={t("Подтверждение решения")}>
              <p><strong>{t(actionLabels[confirmation])} «{detail.german}»?</strong></p>
              <p className={styles.hint}>{confirmation === "PUBLISHED" ? t("Карточка станет доступна в общей библиотеке.") : t("Карточка останется у автора. Другие пользователи увидят её снова после публикации; их прогресс сохранится.")}</p>
              <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || decisionsLocked} onClick={() => void decide()}>{saving ? t("Сохраняем…") : t("Подтвердить решение")}</button>
                <button type="button" disabled={saving} onClick={() => setConfirmation(null)}>{t("Отмена")}</button></div>
            </section>}
          </>}
        </>}
      </section>
    </div>
  </section>;
}
