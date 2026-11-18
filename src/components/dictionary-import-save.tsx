"use client";
import {useEffect,useRef,useState} from 'react';
import {apiClient,apiFetch} from '@/lib/api';
import type {ImportPreview} from '@/lib/dictionary-import-client';
import {DictionaryImportSaveClient,initialDecisions,unresolvedChoices,batchStorageKey,type ImportBatch,type ImportDecision} from '@/lib/dictionary-import-save-client';
import {useI18n} from './ui-language-provider';import {ModerationDialog} from './moderation-dialog';import styles from './dictionary-import-panel.module.css';
const client=new DictionaryImportSaveClient(apiFetch,()=>apiClient.getSnapshot().user?.id??null);
export function DictionaryImportSave({userId,file,preview,onBusy}:{userId:string;file:File|null;preview:ImportPreview|null;onBusy:(value:boolean)=>void}){
 const {t,errorText}=useI18n();const [enabled,setEnabled]=useState(false),[choices,setChoices]=useState<ImportDecision[]>([]),[batch,setBatch]=useState<ImportBatch|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[confirm,setConfirm]=useState(false),[page,setPage]=useState(0),[all,setAll]=useState(false),[paused,setPaused]=useState(false);
 const progress=useRef(0);
 const active=useRef<AbortController|null>(null),pendingKey=useRef<string|null>(null),prepareButton=useRef<HTMLButtonElement>(null);
 const current=()=>apiClient.getSnapshot().user?.id===userId;
 const remember=(key:string|null)=>{pendingKey.current=key;try{if(key)sessionStorage.setItem(batchStorageKey(userId),key);else sessionStorage.removeItem(batchStorageKey(userId));}catch{/* Server receipts remain available for the current session. */}};
 useEffect(()=>{setChoices(preview?initialDecisions(preview):[]);setPage(0);setAll(false);},[preview]);
 useEffect(()=>{const controller=new AbortController();void client.config(controller.signal).then(async ready=>{if(controller.signal.aborted)return;setEnabled(ready);let key:string|null=null;try{key=sessionStorage.getItem(batchStorageKey(userId));}catch{}if(ready&&key){pendingKey.current=key;try{const saved=await client.get(key,userId,controller.signal);if(!controller.signal.aborted)setBatch(saved);}catch(failure){if(!controller.signal.aborted){setError(failure);if((failure as {status?:number}).status===404){sessionStorage.removeItem(batchStorageKey(userId));pendingKey.current=null;}}}}else if(ready){const saved=await client.latest(userId,controller.signal);if(saved&&!controller.signal.aborted){pendingKey.current=saved.key;try{sessionStorage.setItem(batchStorageKey(userId),saved.key);}catch{}setBatch(saved);}}}).catch(e=>{if(!controller.signal.aborted)setError(e);});return()=>{controller.abort();active.current?.abort();};},[userId]);
 useEffect(()=>{onBusy(busy);return()=>onBusy(false);},[busy,onBusy]);
 async function operation(work:(signal:AbortSignal)=>Promise<void>){if(active.current)return;const controller=new AbortController();active.current=controller;setBusy(true);setError(null);progress.current=Date.now();const timer=window.setInterval(()=>{if(Date.now()-progress.current<90000)return;setError(new Error('Не удалось сохранить импорт. Проверьте состояние пакета.'));controller.abort();},5000);try{await work(controller.signal);}catch(e){if(!controller.signal.aborted&&current())setError(e);}finally{window.clearInterval(timer);if(active.current===controller){active.current=null;setBusy(false);}}}
 const prepare=()=>operation(async signal=>{if(!file||!preview||unresolvedChoices(choices))return;const key=pendingKey.current??crypto.randomUUID();remember(key);const saved=await client.prepare(file,choices,key,userId,signal);if(!signal.aborted&&current()){setBatch(saved);setConfirm(saved.state==='PLANNED');}});
 async function run(){setConfirm(false);setPaused(false);await operation(async signal=>{const key=batch?.key??pendingKey.current;if(!key)return;let saved=await client.get(key,userId,signal);if(!signal.aborted&&current())setBatch(saved);while(!signal.aborted&&['PLANNED','IMPORTING'].includes(saved.state)){const cursor=saved.cursor;saved=await client.apply(key,cursor,userId,signal);progress.current=Date.now();if(!signal.aborted&&current())setBatch(saved);if(saved.cursor<=cursor&&saved.state!=='COMPLETED')throw new Error('Не удалось сохранить импорт. Проверьте состояние пакета.');}});}
 const close=()=>operation(async signal=>{if(batch&&!['COMPLETED','EXPIRED'].includes(batch.state))await client.discard(batch.key,userId,signal);if(!signal.aborted&&current()){remember(null);setBatch(null);setConfirm(false);setPaused(false);}});
 if(!enabled)return error?<p role="alert">{errorText(error)}</p>:null;
 const unresolved=unresolvedChoices(choices),shown=preview?.rows.filter(r=>all||!choices[r.row-1]?.action)??[],pages=Math.max(1,Math.ceil(shown.length/25));
 return <section className={styles.panel} aria-label={t('Сохранение CSV')}>
  <h4>{t('Сохранение CSV')}</h4>
  <p>{t('Новые карточки отправятся на модерацию. У найденных карточек общие тексты, примеры и формы не меняются. Личные книги и уроки добавляются только вам.')}</p>
  <p className={styles.hint}>{t('Существующие личные заметки, переводы, архив и избранное сохраняются. Отличия будут в отчёте. При остановке уже сохранённые слова останутся.')}</p>
  {!batch&&preview&&<>
   <p>{t('Требуют выбора: {count}',{count:unresolved})}</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setAll(v=>!v);setPage(0);}}>{t(all?'Показать только нерешённые':'Показать все решения')}</button>
   <ol className={styles.rows}>{shown.slice(page*25,(page+1)*25).map(row=>{const choice=choices[row.row-1],value=choice?.action==='existing'?'existing:'+choice.wordId:choice?.action==='reuse'?'reuse:'+choice.referenceRow:choice?.action??'';return <li key={row.row}><label htmlFor={'import-choice-'+row.row}>{t('Запись {number}',{number:row.row})}: {row.article!=='none'?row.article+' ':''}{row.german}</label>
    <select id={'import-choice-'+row.row} disabled={busy||row.status==='error'} value={value} onChange={e=>{const v=e.target.value;setPage(0);setChoices(previous=>previous.map(d=>d.row!==row.row?d:{row:row.row,...(v.startsWith('existing:')?{action:'existing' as const,wordId:v.slice(9)}:v.startsWith('reuse:')?{action:'reuse' as const,referenceRow:Number(v.slice(6))}:{action:v as ImportDecision['action']})}));}}><option value="">{t('Выберите действие')}</option><option value="skip">{t('Пропустить')}</option>{row.status==='new'&&<option value="new">{t('Создать новую карточку')}</option>}{row.status!=='error'&&<option value="newMeaning">{t('Это отдельное значение — создать карточку')}</option>}{row.candidates.map(c=><option key={c.id} value={'existing:'+c.id}>{t('Использовать карточку')}: {c.german} · {c.translations.map(tr=>tr.language+': '+tr.text).join('; ')}</option>)}{row.relatedRows.filter(r=>r<row.row).map(r=><option key={r} value={'reuse:'+r}>{t('Использовать запись {number} из файла',{number:r})}</option>)}</select>
    {row.moreCandidates&&<p>{t('Если нужного совпадения нет среди показанных, пропустите запись и уточните её в библиотеке.')}</p>}
   </li>;})}</ol>
   {pages>1&&<nav className={styles.actions}><button type="button" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}>{t('Предыдущая страница')}</button><span>{page+1} / {pages}</span><button type="button" disabled={page+1>=pages||busy} onClick={()=>setPage(p=>p+1)}>{t('Следующая страница')}</button></nav>}
   <button ref={prepareButton} type="button" disabled={busy||!file||unresolved>0||choices.every(c=>c.action==='skip')} onClick={()=>void prepare()}>{t('Подготовить сохранение')}</button>
  </>}
  {batch&&<>
   <p role="status">{t('Обработано {done} из {total}',{done:batch.cursor,total:batch.summary.total})}</p><progress aria-label={t('Ход импорта')} value={batch.cursor} max={batch.summary.total}/>
   <p>{t('Создано: {created}. Добавлено: {attached}. Уже в словаре: {already}. Пропущено: {skipped}.',{...batch.counts})}</p>
   <p>{t('Личные отличия сохранены без перезаписи: {count}',{count:batch.counts.warnings})}</p>
   {(paused||batch.state==='IMPORTING')&&<p>{t('Импорт можно продолжить с последней сохранённой порции.')}</p>}
   {batch.state==='PLANNED'&&<button type="button" disabled={busy} onClick={()=>setConfirm(true)}>{t('Проверить и подтвердить пакет')}</button>}
   {batch.state==='IMPORTING'&&<button type="button" disabled={busy} onClick={()=>void run()}>{t('Продолжить импорт')}</button>}
   {batch.state==='COMPLETED'&&<><p role="status">{t('Импорт завершён. Повторный запрос не добавит копии.')}</p><button type="button" onClick={()=>window.location.reload()}>{t('Открыть обновлённый словарь')}</button></>}
   {batch.state==='EXPIRED'&&<p>{t('Срок пакета истёк. Уже сохранённые слова остаются; проверьте исходный файл заново.')}</p>}
   <details><summary>{t('Отчёт по записям')}</summary><ul>{batch.results.filter(r=>r.warnings.length).slice(0,25).map(r=><li key={r.row}>{t('Запись {number}',{number:r.row})}: {t('Существующие личные значения оставлены без изменений.')}</li>)}</ul>{batch.counts.warnings>25&&<p>{t('Показаны первые 25 записей с отличиями.')}</p>}</details>
   <button type="button" disabled={busy} className="secondary-button" onClick={()=>void close()}>{t(batch.state==='COMPLETED'?'Закрыть отчёт':'Закрыть пакет, сохранив добавленные слова')}</button>
  </>}
  {busy&&<button type="button" className="secondary-button" onClick={()=>{active.current?.abort();setPaused(true);}}>{t('Приостановить')}</button>}
  {error!==null&&<p role="alert">{errorText(error)}{typeof(error as {row?:unknown})?.row==='number'&&' · '+t('Запись {number}',{number:(error as {row:number}).row})}</p>}
  {!!error&&pendingKey.current&&!busy&&<button type="button" onClick={()=>void operation(async signal=>{const saved=await client.get(pendingKey.current!,userId,signal);if(!signal.aborted&&current())setBatch(saved);})}>{t('Проверить состояние пакета')}</button>}
  {confirm&&batch&&<ModerationDialog title={t('Подтвердить импорт')} locked={busy} onClose={()=>setConfirm(false)} restoreFocus={()=>prepareButton.current?.focus()}>
   <p>{t('Новых карточек: {count}',{count:batch.summary.new})}</p><p>{t('Существующих карточек: {count}',{count:batch.summary.existing})}</p><p>{t('Объединяемых записей файла: {count}',{count:batch.summary.reuse})}</p><p>{t('Пропускаем: {count}',{count:batch.summary.skip})}</p>
   <p>{t('При конфликтах ваши прежние личные значения останутся. Книги и уроки объединятся. Общие карточки и прогресс не перезаписываются.')}</p>
   {batch.summary.warnings.length>0&&<p>{t('Записей с личными отличиями: {count}',{count:batch.summary.warnings.length})}</p>}
   <button type="button" onClick={()=>void run()}>{t('Подтвердить и сохранить')}</button>
  </ModerationDialog>}
 </section>;
}
