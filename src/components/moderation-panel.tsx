"use client";
import { ModerationDialog } from "./moderation-dialog";
import { WordRelationsEditor } from "./word-relations-editor";
import { RelatedWords } from "./related-words";
import { safeErrorMessage } from "@/lib/i18n";
import { useI18n } from "./ui-language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ModerationClient, ModerationError, type ModerationWord, type PublicationStatus, type ReviewCard } from "@/lib/moderation-client";
import { adjacentModerationWord, moderationQueue, MODERATION_PAGE_SIZE } from "@/lib/moderation-queue";
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
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [relationsBusy, setRelationsBusy] = useState(false);
  const [relationsVersion, setRelationsVersion] = useState(0);
  const invalidateRelations = useCallback(() => setRelationsVersion(value => value + 1), []);
  const queueButtons = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<PublicationStatus>("PENDING_REVIEW");
  const [search, setSearch] = useState("");
  const [lesson, setLesson] = useState("all");
  const [page, setPage] = useState(0);
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
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const queue = moderationQueue(words, search, lesson, page);
  const lessonOptions = [...new Set([...words.map(word => word.lessonNumber).filter((value): value is number => value !== null), ...(lesson === "all" ? [] : [Number(lesson)])])].sort((a, b) => a - b);
  const selectedIndex = queue.matches.findIndex(word => word.id === selectedId);
  const previousId = selectedId ? adjacentModerationWord(queue.matches, selectedId, -1) : null;
  const nextId = selectedId ? adjacentModerationWord(queue.matches, selectedId, 1) : null;
  const navigationLocked = loading || !!listError || saving || relationsBusy || relationsOpen;

  function clearSelection() {
    setRelationsOpen(false); setSelectedId(null); setDetail(null); setDetailLoading(false); setDetailError("");
    setDecisionError(""); setConfirmation(null); setNotice(""); setDuplicateId(null); setBlocked(false);
  }
  function selectCard(id: string, source: readonly ModerationWord[] = queue.matches) {
    const index = source.findIndex(word => word.id === id);
    if (index >= 0) setPage(Math.floor(index / MODERATION_PAGE_SIZE));
    setRelationsOpen(false); setDetail(null); setSelectedId(id); setDetailAttempt(value => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setListError("");
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

  useEffect(() => { onBusyChange(saving || relationsBusy); return () => onBusyChange(false); }, [saving, relationsBusy, onBusyChange]);
  useEffect(() => { if (detail && !detailLoading) reviewHeading.current?.focus(); }, [detail, detailLoading]);

  function openCard(id: string) {
    if (savingRef.current || relationsBusy || relationsOpen) return;
    setNotice(""); selectCard(id);
  }

  async function decide(advance = false) {
    if (!detail || !confirmation || decisionsLocked || blocked || savingRef.current || relationsBusy || relationsOpen) return;
    const next = advance ? adjacentModerationWord(queue.matches, detail.id, 1) : null;
    const remaining = queue.matches.filter(word => word.id !== detail.id);
    savingRef.current = true; setSaving(true); setDecisionError(""); setNotice("");
    try {
      let updated: ReviewCard;
      try { updated = await client.changeStatus(detail, confirmation); }
      catch (error) {
        setConfirmation(null); setBlocked(true); setDecisionError(message(error));
        if (error instanceof ModerationError && error.code === "DUPLICATE_WORD") setDuplicateId(error.wordId ?? null);
        return;
      }
      setDetail(updated); setConfirmation(null); setNotice("Решение сохранено.");
      setWords(current => current.filter(word => word.id !== updated.id));
      setListAttempt(value => value + 1);
      if (next) selectCard(next, remaining);
      // A later dashboard refresh failure cannot turn a committed decision into a failed mutation.
      try { await onDecision(); }
      catch { setNotice("Решение сохранено. Не удалось обновить словарь; обновите страницу."); }
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <section className={styles.panel} aria-labelledby="moderation-heading">
    <div className={styles.heading}><div><p className="eyebrow">{t("АДМИНИСТРАТОР")}</p><h3 id="moderation-heading">{t("Модерация карточек")}</h3></div>
      <div className={styles.filters}><label htmlFor="moderation-filter">{t("Статус карточек")}</label>
        <select id="moderation-filter" value={filter} disabled={saving} onChange={(event) => {
          setFilter(event.target.value as PublicationStatus); setWords([]); setSearch(""); setLesson("all"); setPage(0); clearSelection();
        }}>{statuses.map((status) => <option key={status} value={status}>{t(publicationLabel(status))}</option>)}</select>
        <button type="button" disabled={saving || loading} onClick={() => setListAttempt((value) => value + 1)}>{t("Обновить список")}</button>
      </div>
    </div>
    <p className={styles.hint}>{t("Откройте карточку, проверьте все переводы и примеры, затем выберите решение.")}</p>
    {decisionsLocked && <p role="status" className={styles.warning}>{t("Для решения завершите тренировку и сохраните результаты.")}</p>}
    {notice && <p role="status" className={styles.notice}>{t(notice)}</p>}
    <div className={styles.search} role="search" aria-label={t("Поиск в очереди модерации")}>
      <label htmlFor="moderation-search">{t("Слово, перевод или общая заметка")}
        <input ref={searchInput} id="moderation-search" type="search" maxLength={200} value={search} disabled={saving} onChange={event => { setSearch(event.target.value); setPage(0); clearSelection(); }} />
      </label>
      <label htmlFor="moderation-lesson">{t("Урок")}
        <select id="moderation-lesson" value={lesson} disabled={saving || loading} onChange={event => { setLesson(event.target.value); setPage(0); clearSelection(); }}>
          <option value="all">{t("Все уроки")}</option>{lessonOptions.map(number => <option key={number} value={number}>{number}</option>)}
        </select>
      </label>
      {(search || lesson !== "all") && <button type="button" disabled={saving} onClick={() => { setSearch(""); setLesson("all"); setPage(0); clearSelection(); }}>{t("Сбросить поиск и фильтры")}</button>}
    </div>
    {!loading && !listError && <p className={styles.hint} role="status">{t("Найдено карточек: {0}", { 0: queue.matches.length })}</p>}
    <div className={styles.layout}>
      <div aria-label={t("Список карточек на модерации")}>
        {loading ? <p role="status">{t("Загружаем список…")}</p> : listError ? <p role="alert" className={styles.error}>{errorText(listError)}</p> : !words.length ? <p>{t("Карточек с этим статусом нет.")}</p> : !queue.matches.length ? <p>{t("По этому запросу карточки не найдены.")}</p> : <><ul className={styles.queue}>
          {queue.items.map((word) => <li key={word.id}><button ref={element => { if (element) queueButtons.current.set(word.id, element); else queueButtons.current.delete(word.id); }} type="button" disabled={saving} aria-pressed={selectedId === word.id} onClick={() => openCard(word.id)}>
            <strong>{word.article !== "none" && `${word.article} `}{word.german}</strong>
            <span>{t(publicationLabel(word.publicationStatus))} · {word.level ?? t("Без уровня")}{word.lessonNumber !== null ? t(" · Урок {0}", { 0: word.lessonNumber }) : ""}</span>
          </button></li>)}
        </ul>
        <nav className={styles.paging} aria-label={t("Страницы очереди модерации")}>
          <button type="button" disabled={saving || queue.page === 0} onClick={() => { setPage(queue.page - 1); clearSelection(); }}>{t("Предыдущая страница")}</button>
          <span>{t("Страница {current} из {total}", { current: queue.page + 1, total: queue.pages })}</span>
          <button type="button" disabled={saving || queue.page + 1 === queue.pages} onClick={() => { setPage(queue.page + 1); clearSelection(); }}>{t("Следующая страница")}</button>
        </nav></>}
      </div>
      {selectedId && <ModerationDialog locked={saving || relationsBusy} onClose={() => { if (!savingRef.current && !relationsBusy) clearSelection(); }} restoreFocus={() => { (queueButtons.current.get(selectedId) ?? searchInput.current)?.focus({ preventScroll: true }); }}>
      <section className={styles.review} aria-label={t("Проверка карточки")} aria-busy={detailLoading || saving}>
        {notice && <p role="status" className={styles.notice}>{t(notice)}</p>}
        <>
          <button type="button" className={styles.reload} disabled={detailLoading || navigationLocked} onClick={() => openCard(selectedId)}>{t("Открыть актуальную карточку")}</button>
          <div className={styles.paging}>
            <button type="button" disabled={navigationLocked || !previousId} onClick={() => previousId && openCard(previousId)}>{t("Предыдущая карточка")}</button>
            <button type="button" disabled={navigationLocked || !nextId} onClick={() => nextId && openCard(nextId)}>{t("Следующая карточка")}</button>
          </div>
          {selectedIndex >= 0 && <p className={styles.hint}>{t("Карточка {current} из {total}", { current: selectedIndex + 1, total: queue.matches.length })}</p>}
          {detailLoading ? <p role="status">{t("Загружаем карточку…")}</p> : detailError ? <p className={styles.error} role="alert">{errorText(detailError)}</p> : detail && <>
            <p className={styles.status}>{t(publicationLabel(detail.publicationStatus))}</p>
            <h4 ref={reviewHeading} tabIndex={-1}>{detail.article !== "none" && `${detail.article} `}{detail.german}</h4>
            <dl className={styles.facts}>
              <div><dt>{t("Число")}</dt><dd>{{ singular: t("Единственное"), plural: t("Множественное"), not_applicable: t("Не применимо") }[detail.grammaticalNumber]}</dd></div>
              <div><dt>{t("Мн. форма")}</dt><dd>{detail.pluralForm || t("Не указана")}</dd></div>
              <div><dt>{t("Уровень / урок")}</dt><dd>{detail.level ?? "—"} / {detail.lessonNumber ?? "—"}</dd></div>
            </dl>
            {detail.notes && <p className={styles.notes}>{detail.notes}</p>}
            <RelatedWords key={detail.id + ":" + relationsVersion} wordId={detail.id} language={translationLanguage} />
            <button type="button" disabled={saving || relationsBusy || decisionsLocked} onClick={() => { setConfirmation(null); setRelationsOpen(value => !value); }}>{relationsOpen ? t("Закрыть редактор связей") : t("Редактировать связи")}</button>
            {relationsOpen && <><p className={styles.hint}>{t("Закройте редактор связей перед решением по карточке.")}</p><WordRelationsEditor key={detail.id} wordId={detail.id} language={translationLanguage} disabled={saving || decisionsLocked} onChanged={invalidateRelations} onBusyChange={setRelationsBusy} /></>}
            <h5>{t("Переводы карточки")}</h5>
            {!detail.translations.length ? <p>{t("Переводов пока нет.")}</p> : <dl className={styles.translations}>{detail.translations.map((row) => <div key={row.language}><dt>{row.language.toUpperCase()}</dt><dd>{row.text}</dd></div>)}</dl>}
            <button type="button" disabled={saving || decisionsLocked || relationsOpen} onClick={() => {
              setConfirmation(null); onEditTranslations(detail);
            }}>{t("Редактировать переводы")}</button>
            <h5>{t("Примеры употребления")}</h5>
            {!detail.examples.length ? <p className={styles.hint}>{t("Примеров пока нет.")}</p> : <>{detail.examples.map((example) => <blockquote key={example.id}><p>{example.german}</p>{example.translations.length ? example.translations.map((entry) => <p className={styles.hint} key={entry.language}>{entry.language}: {entry.text}</p>) : <p className={styles.hint}>{t("Переводов пока нет.")}</p>}</blockquote>)}</>}
            {decisionError && <div className={styles.warning} role="alert"><p>{errorText(decisionError)}</p><p>{t("Перед следующим решением откройте актуальную карточку и проверьте её ещё раз.")}</p>
              {duplicateId && <button type="button" disabled={saving} onClick={() => openCard(duplicateId)}>{t("Посмотреть существующую карточку")}</button>}
            </div>}
            <div className={styles.actions}>{statuses.filter((status) => status !== detail.publicationStatus).map((status) => <button type="button" key={status}
              disabled={saving || blocked || decisionsLocked || relationsOpen} className={status === "PUBLISHED" ? styles.primary : undefined} onClick={() => setConfirmation(status)}>
              {status === "REJECTED" && detail.publicationStatus === "PUBLISHED" ? t("Снять с публикации") : t(actionLabels[status])}
            </button>)}</div>
            {confirmation && <section className={styles.confirmation} aria-label={t("Подтверждение решения")}>
              <p><strong>{t(actionLabels[confirmation])} «{detail.german}»?</strong></p>
              <p className={styles.hint}>{confirmation === "PUBLISHED" ? t("Карточка станет доступна в общей библиотеке.") : t("Карточка останется у автора. Другие пользователи увидят её снова после публикации; их прогресс сохранится.")}</p>
              <div className={styles.actions}><button type="button" className={styles.primary} disabled={saving || decisionsLocked} onClick={() => void decide()}>{saving ? t("Сохраняем…") : t("Подтвердить решение")}</button>
                {nextId && <button type="button" disabled={saving || decisionsLocked || navigationLocked} onClick={() => void decide(true)}>{t("Подтвердить и открыть следующую")}</button>}
                <button type="button" disabled={saving} onClick={() => setConfirmation(null)}>{t("Отмена")}</button></div>
            </section>}
          </>}
        </>
      </section>
      </ModerationDialog>}
    </div>
  </section>;
}
