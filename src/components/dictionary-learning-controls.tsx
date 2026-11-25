"use client";
import { bookFilterOptions, lessonsForBook, matchesBook } from '@/lib/word-books';
import { lessonDisplayName, personalTagOptions } from '@/lib/organization-client';
import { activeTrainingWords } from '@/lib/dictionary-entry-client';
import type { LessonSelection, TrainingSelection, WorkspaceWord } from '@/lib/dictionary-workspace';
import { useI18n } from './ui-language-provider';
import styles from './dictionary-workspace.module.css';

function BookLessonFields({ words, selection, onChange, learning }: {
  words: readonly WorkspaceWord[]; selection: LessonSelection;
  onChange: (selection: LessonSelection) => void; learning: boolean;
}) {
  const { t } = useI18n();
  const active = activeTrainingWords(words);
  const lessons = [...new Set(active.flatMap(word => lessonsForBook(word, selection.book)))].sort((a,b) => a-b);
  const hasNoLesson = active.some(word => matchesBook(word, selection.book) && !lessonsForBook(word, selection.book).length);
  return <div className={styles.scopeFields}>
    <label>{t(learning ? 'Книга для обучения' : 'Книга для тренировки')}
      <select value={selection.book} onChange={e => onChange({ book: e.target.value, lesson: learning ? '' : 'all' })}>
        <option value="">{t(learning ? 'Выберите книгу' : 'Все книги')}</option>
        <option value="none">{t('Без книги')}</option>
        {bookFilterOptions(active, selection.book).map(book => <option key={book.key} value={book.key}>{book.title}</option>)}
      </select>
    </label>
    <label>{t(learning ? 'Урок для обучения' : 'Урок для тренировки')}
      <select value={selection.lesson} disabled={learning && !selection.book} onChange={e => onChange({ ...selection, lesson: e.target.value })}>
        {learning && <option value="">{t('Выберите урок')}</option>}
        <option value="all">{t('Все уроки')}</option>
        {hasNoLesson && <option value="none">{t('Без урока')}</option>}
        {lessons.map(number => <option key={number} value={number}>{t('Урок')} {number}{lessonDisplayName(active,selection.book,number) ? ` · ${lessonDisplayName(active,selection.book,number)}` : ''}</option>)}
      </select>
    </label>
  </div>;
}

export function LearningControls({ words, selection, onChange, total, started, position, disabled, onBegin, onPrevious, onNext, onTrain }: {
  words: readonly WorkspaceWord[]; selection: LessonSelection; onChange: (selection: LessonSelection) => void;
  total: number; started: boolean; position: number; disabled: boolean;
  onBegin: () => void; onPrevious: () => void; onNext: () => void; onTrain: () => void;
}) {
  const { t, count } = useI18n();
  return <section aria-label={t('Обучение по книге и уроку')}>
    <fieldset className={styles.filters} disabled={disabled}>
      <legend>{t('Выберите книгу и урок')}</legend>
      <BookLessonFields words={words} selection={selection} onChange={onChange} learning />
      <p className={styles.hint}>{t('Просмотр карточек не меняет прогресс и сроки повторения.')}</p>
      {selection.book && selection.lesson && <p role="status">{t('Для обучения: {0}', { 0: count(total) })}</p>}
      {!started && <button type="button" disabled={!selection.book || !selection.lesson || !total} onClick={onBegin}>{t('Начать обучение')}</button>}
    </fieldset>
    {started && <div className={styles.learningNavigation}>
      <p aria-live="polite">{total ? t('Карточка {current} из {total}', { current: position + 1, total }) : t('В выбранном уроке нет активных слов')}</p>
      <div className={styles.lessonButtons}>
        <button type="button" disabled={disabled || position === 0 || !total} onClick={onPrevious}>{t('Предыдущая карточка')}</button>
        <button type="button" disabled={disabled || position >= total - 1 || !total} onClick={onNext}>{t('Следующая карточка')}</button>
        <button type="button" disabled={disabled || !total} onClick={onTrain}>{t('Тренировать этот урок')}</button>
      </div>
      <p className={styles.hint}>{t('Отмечайте трудные слова прямо в карточке. Их можно повторить отдельно в тренировке.')}</p>
    </div>}
  </section>;
}

export function TrainingSelectionControls({ words, selection, onChange, disabled, difficultEnabled }: {
  words: readonly WorkspaceWord[]; selection: TrainingSelection; onChange: (selection: TrainingSelection) => void;
  disabled: boolean; difficultEnabled: boolean;
}) {
  const { t } = useI18n();
  return <fieldset className={styles.filters} disabled={disabled}>
    <legend>{t('Набор для тренировки')}</legend>
    <BookLessonFields words={words} selection={selection} onChange={next => onChange({ ...selection, ...next })} learning={false} />
    <p className={styles.hint}>{t('Поиск слов не влияет на этот набор. Архивные слова не участвуют.')}</p>
    <details className={styles.searchOptions}>
      <summary>{t('Дополнительные параметры тренировки')}</summary>
      <div>
        <label>{t('Раздел словаря')}<select value={selection.view} onChange={e => onChange({ ...selection, view: e.target.value as TrainingSelection['view'] })}>
          <option value="active">{t('Активные слова')}</option><option value="favorites">{t('Избранное')}</option>{difficultEnabled && <option value="difficult">{t('Трудные слова')}</option>}
        </select></label>
        <label>{t('Личный тег')}<select value={selection.tag} onChange={e => onChange({ ...selection, tag: e.target.value })}>
          <option value="">{t('Все теги')}</option><option value="none">{t('Без тегов')}</option>{personalTagOptions(words, selection.tag).map(tag => <option key={tag.key} value={tag.key}>{tag.title}</option>)}
        </select></label>
        <label>{t('Уровень')}<select value={selection.level} onChange={e => onChange({ ...selection, level: e.target.value })}>
          <option value="all">{t('Все уровни')}</option>{['A1','A2','B1','B2','C1','C2'].map(level => <option key={level} value={level}>{level}</option>)}
        </select></label>
        <label>{t('Артикль')}<select value={selection.article} onChange={e => onChange({ ...selection, article: e.target.value })}>
          <option value="all">{t('Все категории')}</option><option value="der">{t('der — мужской')}</option><option value="das">{t('das — средний')}</option><option value="die">{t('die — женский')}</option><option value="plural">{t('Множественное число')}</option><option value="unknown">{t('Артикль неизвестен')}</option><option value="not_applicable">{t('Артикль неприменим')}</option>
        </select></label>
      </div>
    </details>
  </fieldset>;
}
