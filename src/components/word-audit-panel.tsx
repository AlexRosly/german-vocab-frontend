"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { WordAuditClient, type AuditPage } from "@/lib/word-audit-client";
import { useI18n } from "./ui-language-provider";
import styles from "./data-controls.module.css";
const client = new WordAuditClient(apiFetch);
const entities: Record<string,string> = { words:'Слово и грамматика',word_translations:'Перевод слова',word_examples:'Пример',word_example_translations:'Перевод примера',word_relations:'Связь слов',word_source_books:'Общий источник',word_verb_forms:'Формы глагола',word_collocations:'Сочетание с глаголом',word_collocation_translations:'Перевод сочетания',word_images:'Изображение карточки' };
export function WordAuditPanel({ userId }: { userId: string }) {
  const { t, errorText, language } = useI18n();
  const [enabled,setEnabled]=useState<boolean|null>(null),[open,setOpen]=useState(false),[data,setData]=useState<AuditPage|null>(null),[page,setPage]=useState(1),[search,setSearch]=useState(''),[draft,setDraft]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  useEffect(()=>{const c=new AbortController();void client.config(c.signal).then(v=>{if(!c.signal.aborted)setEnabled(v)}).catch(e=>{if(!c.signal.aborted)setError(e)});return()=>c.abort()},[userId,attempt]);
  useEffect(()=>{if(!enabled||!open)return;const c=new AbortController();setBusy(true);setData(null);setError(null);void client.list(page,search,c.signal).then(v=>{if(!c.signal.aborted)setData(v)}).catch(e=>{if(!c.signal.aborted)setError(e)}).finally(()=>{if(!c.signal.aborted)setBusy(false)});return()=>c.abort()},[userId,enabled,open,page,search,attempt]);
  if(enabled===false)return null;
  return <section className={styles.panel} aria-labelledby="word-audit-title"><h3 id="word-audit-title">{t('Журнал общих изменений')}</h3><p className="hint">{t('Только для администратора. Записи появляются с момента включения журнала; прежняя история не выдумывается. Личные материалы и прогресс сюда не попадают.')}</p>
    <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)} disabled={enabled!==true}>{t(open?'Скрыть журнал':'Открыть журнал')}</button>
    {open&&<><form className={styles.filters} onSubmit={e=>{e.preventDefault();setPage(1);setSearch(draft);setAttempt(n=>n+1)}}><label>{t('Поиск по слову в журнале')}<input value={draft} maxLength={200} onChange={e=>setDraft(e.target.value)} /></label><button type="submit" disabled={busy}>{t('Найти изменения')}</button></form>
    {busy&&<p role="status">{t('Загружаем журнал…')}</p>}{data&&<><p>{t('Найдено изменений: {count}',{count:data.total})}</p>{!data.items.length&&<p>{t('Изменений пока нет')}</p>}<ol className={styles.events}>{data.items.map(e=><li className={styles.event} key={e.id}><strong>{e.wordGerman}</strong><p>{t(entities[e.entity])} · {t(e.action==='INSERT'?'Добавлено':e.action==='DELETE'?'Удалено':'Изменено')} · {new Date(e.createdAt).toLocaleString(language)}</p><p>{t(e.actor==='admin'?'Администратор':e.actor==='user'?'Пользователь':'Система или обезличенный автор')}</p><details><summary>{t('Посмотреть изменения')}</summary><div className={styles.snapshots}><div><h4>{t('До изменения')}</h4><pre>{e.before?JSON.stringify(e.before,null,2):'—'}</pre></div><div><h4>{t('После изменения')}</h4><pre>{e.after?JSON.stringify(e.after,null,2):'—'}</pre></div></div></details></li>)}</ol><nav className={styles.pagination} aria-label={t('Страницы журнала')}><button type="button" disabled={busy||page<=1} onClick={()=>setPage(n=>n-1)}>{t('Предыдущая страница')}</button><span>{page} / {Math.max(1,Math.ceil(data.total/25))}</span><button type="button" disabled={busy||page*25>=data.total} onClick={()=>setPage(n=>n+1)}>{t('Следующая страница')}</button></nav></>}
    </>}{!!error&&<p role="alert">{errorText(error)} <button type="button" onClick={()=>setAttempt(n=>n+1)}>{t('Повторить')}</button></p>}
  </section>;
}
