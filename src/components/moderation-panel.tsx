"use client";

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
const message = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить запрос. Повторите попытку.";

export function ModerationPanel({ decisionsLocked, onDecision, onBusyChange, translationVersion, onEditTranslations }: {
  decisionsLocked: boolean; onDecision: () => Promise<void>; onBusyChange: (busy: boolean) => void;
  translationVersion: number; onEditTranslations: (word: { id: string; german: string }) => void;
}) {
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
      setNotice(`«${updated.german}»: ${publicationLabel(updated.publicationStatus)}. Решение сохранено.`);
      setListAttempt((value) => value + 1);
      await onDecision();
    } catch (error) {
      setConfirmation(null); setBlocked(true); setDecisionError(message(error));
      if (error instanceof ModerationError && error.code === "DUPLICATE_WORD") setDuplicateId(error.wordId ?? null);
    } finally { savingRef.current = false; setSaving(false); onBusyChange(false); }
  }

  return <section className={styles.panel} aria-labelledby="moderation-heading">
    <div className={styles.heading}><div><p className="eyebrow">АДМИНИСТРАТОР</p><h3 id="moderation-heading">Модерация карточек</h3></div>
      <div className={styles.filters}><label htmlFor="moderation-filter">Статус карточек</label>
        <select id="moderation-filter" value={filter} disabled={saving} onChange={(event) => {
          setFilter(event.target.value as PublicationStatus); setSelectedId(null); setDetail(null); setDetailLoading(false);
          setDetailError(""); setDecisionError(""); setConfirmation(null); setNotice("");
        }}>{statuses.map((status) => <option key={status} value={status}>{publicationLabel(status)}</option>)}</select>
        <button type="button" disabled={saving || loading} onClick={() => setListAttempt((value) => value + 1)}>Обновить список</button>
      </div>
    </div>
    <p className={styles.hint}>Откройте карточку, проверьте все переводы и примеры, затем выберите решение.</p>
    {decisionsLocked && <p role="status" className={styles.warning}>Для решения завершите тренировку и сохраните результаты.</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.layout}>
      <div aria-label="Список карточек на модерации">
        {loading ? <p role="status">Загружаем список…</p> : listError ? <p role="alert" className={styles.error}>{listError}</p> : !words.length ? <p>Карточек с этим статусом нет.</p> : <ul className={styles.queue}>
          {words.map((word) => <li key={word.id}><button type="button" disabled={saving} aria-pressed={selectedId === word.id} onClick={() => openCard(word.id)}>
            <strong>{word.article !== "none" && `${word.article} `}{word.german}</strong>
            <span>{publicationLabel(word.publicationStatus)} · {word.level ?? "Без уровня"}</span>
          </button></li>)}
        </ul>}
      </div>
      <section className={styles.review} aria-label="Проверка карточки" aria-busy={detailLoading || saving}>
        {!selectedId ? <p className={styles.hint}>Выберите карточку в списке.</p> : <>
          <button type="button" className={styles.reload} disabled={detailLoading || saving} onClick={() => openCard(selectedId)}>Открыть актуальную карточку</button>
          {detailLoading ? <p role="status">Загружаем карточку…</p> : detailError ? <p className={styles.error} role="alert">{detailError}</p> : detail && <>
            <p className={styles.status}>{publicationLabel(detail.publicationStatus)}</p>
            <h4>{detail.article !== "none" && `${detail.article} `}{detail.german}</h4>
            <dl className={styles.facts}>
              <div><dt>Число</dt><dd>{{ singular: "Единственное", plural: "Множественное", not_applicable: "Не применимо" }[detail.grammaticalNumber]}</dd></div>
              <div><dt>Мн. форма</dt><dd>{detail.pluralForm || "Не указана"}</dd></div>
              <div><dt>Уровень / урок</dt><dd>{detail.level ?? "—"} / {detail.lessonNumber ?? "—"}</dd></div>
            </dl>
            {detail.notes && <p className={styles.notes}>{detail.notes}</p>}
            <h5>Переводы карточки</h5>
            {!detail.translations.length ? <p>Переводов пока нет.</p> : <dl className={styles.translations}>{detail.translations.map((row) => <div key={row.language}><dt>{row.language.toUpperCase()}</dt><dd>{row.text}</dd></div>)}</dl>}
            <button type="button" disabled={saving || decisionsLocked} onClick={() => {
              setConfirmation(null); onEditTranslations(detail);
            }}>Редактировать переводы</button>
            <h5>Примеры употребления</h5>
            {!detail.examples.length ? <p className={styles.hint}>Примеров пока нет.</p> : <>{detail.examples.map((example) => <blockquote key={example.id}><p>{example.german}</p>{example.translations.length ? example.translations.map((entry) => <p className={styles.hint} key={entry.language}>{entry.language}: {entry.text}</p>) : <p className={styles.hint}>Переводов пока нет.</p>}</blockquote>)}</>}
            {decisionError && <div className={styles.warning} role="alert"><p>{decisionError}</p><p>Перед следующим решением откройте актуальную карточку и проверьте её ещё раз.</p>
              {duplicateId && <button type="button" disabled={saving} onClick={() => openCard(duplicateId)}>Посмотреть существующую карточку</button>}
            </div>}
            <div className={styles.actions}>{statuses.filter((status) => status !== detail.publicationStatus).map((status) => <button type="button" key={status}
              disabled={saving || blocked || decisionsLocked} className={status === "PUBLISHED" ? styles.primary : undefined} onClick={() => setConfirmation(status)}>
              {status === "REJECTED" && detail.publicationStatus === "PUBLISHED" ? "Снять с публикации" : actionLabels[status]}
            </button>)}</div>
            {confirmation && <section className={styles.confirmation} aria-label="Подтверждение решения">
              <p><strong>{actionLabels[confirmation]} «{detail.german}»?</strong></p>
              <p className={styles.hint}>{confirmation === "PUBLISHED" ? "Карточка станет доступна в общей библиотеке." : "Карточка останется у автора. Другие пользователи увидят её снова после публикации; их прогресс сохранится."}</p>
              <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || decisionsLocked} onClick={() => void decide()}>{saving ? "Сохраняем…" : "Подтвердить решение"}</button>
                <button type="button" disabled={saving} onClick={() => setConfirmation(null)}>Отмена</button></div>
            </section>}
          </>}
        </>}
      </section>
    </div>
  </section>;
}
