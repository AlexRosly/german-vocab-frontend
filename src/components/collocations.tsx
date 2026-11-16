"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from "react";
import {apiFetch} from "@/lib/api";
import {CollocationsClient,collocationPayload,type Collocation,type CollocationsPage} from "@/lib/collocations-client";
import {VerbCatalogClient,type VerbCard} from "@/lib/verb-catalog-client";
import {translationDraft} from "@/lib/card-draft";
import {TranslationDraftFields} from "./translation-draft-fields";
import {RelatedWordDialog} from "./related-words";
import {useI18n} from "./ui-language-provider";
import styles from "./collocations.module.css";
const client=new CollocationsClient(apiFetch),verbs=new VerbCatalogClient(apiFetch);

function Modal({title,locked,onClose,children}:{title:string;locked:boolean;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{const element=dialog.current,trigger=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';element?.showModal();heading.current?.focus();return()=>{element?.close();document.body.style.overflow=overflow;if(trigger?.isConnected&&trigger!==document.body)trigger.focus()}},[]);
 const {t}=useI18n();
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="collocation-dialog-heading" onCancel={event=>{event.preventDefault();if(!locked)onClose()}}><header className={styles.header}><h3 id="collocation-dialog-heading" ref={heading} tabIndex={-1}>{title}</h3><button type="button" disabled={locked} onClick={onClose}>{t("Закрыть")}</button></header><div className={styles.body}>{children}</div></dialog>;
}
function Editor({nounId,language,initial,onClose,onSaved,onBusy}:{nounId:string;language:string;initial:Collocation|null;onClose:()=>void;onSaved:()=>void;onBusy:(busy:boolean)=>void}){
 const {t,errorText}=useI18n();
 const [draft,setDraft]=useState(initial),[verb,setVerb]=useState<{id:string;german:string}|null>(initial?.verb??null),[german,setGerman]=useState(initial?.german??''),[grammar,setGrammar]=useState(initial?.grammarNote??''),[translations,setTranslations]=useState<Record<string,string>>(translationDraft(initial?.translations??[])),[formLanguage,setFormLanguage]=useState(language);
 const [query,setQuery]=useState(''),[candidates,setCandidates]=useState<VerbCard[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState<unknown>(null),[searchAttempt,setSearchAttempt]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),writing=useRef(false);
 useEffect(()=>{const controller=new AbortController();setCandidates([]);setSearchError(null);setSearching(Boolean(query.trim()));if(!query.trim()||verb)return()=>controller.abort();const timer=window.setTimeout(()=>{void verbs.list({q:query,scope:'library',auxiliary:'',page:1},controller.signal).then(page=>{if(!controller.signal.aborted)setCandidates(page.items.slice(0,10))}).catch(failure=>{if(!controller.signal.aborted)setSearchError(failure)}).finally(()=>{if(!controller.signal.aborted)setSearching(false)})},250);return()=>{window.clearTimeout(timer);controller.abort()}},[query,verb,language,searchAttempt]);
 async function submit(event:FormEvent){event.preventDefault();if(writing.current)return;writing.current=true;setBusy(true);onBusy(true);setError(null);try{const input=collocationPayload(verb?.id??'',german,grammar,translations);await client.save(nounId,input,draft??undefined);onSaved()}catch(failure){setError(failure)}finally{writing.current=false;setBusy(false);onBusy(false)}}
 async function reload(){if(!draft||writing.current)return;writing.current=true;setBusy(true);onBusy(true);try{const saved=await client.detail(nounId,draft.id);setDraft(saved);setVerb(saved.verb);setGerman(saved.german);setGrammar(saved.grammarNote??'');setTranslations(translationDraft(saved.translations));setError(null)}catch(failure){setError(failure)}finally{writing.current=false;setBusy(false);onBusy(false)}}
 return <Modal title={t(draft?"Изменить сочетание":"Добавить сочетание")} locked={busy} onClose={onClose}>
  <p className={styles.hint}>{t("Запишите готовую фразу с нужным артиклем, предлогом и падежом. Переводы необязательны.")}</p>
  <form className={styles.editor} onSubmit={submit}>
   {verb?<div className={styles.selected}><strong>{t("Глагол")}: {verb.german}</strong><button type="button" disabled={busy} onClick={()=>{setVerb(null);setQuery('')}}>{t("Выбрать другой глагол")}</button></div>:<fieldset disabled={busy}><legend>{t("Выберите глагол из справочника")}</legend><label>{t("Поиск глагола по слову или форме")}<input type="search" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)} placeholder="suchen" /></label>
    {searching?<p role="status">{t("Загружаем глаголы…")}</p>:searchError?<p role="alert">{errorText(searchError)} <button type="button" onClick={()=>setSearchAttempt(value=>value+1)}>{t("Повторить")}</button></p>:<ul className={styles.candidates}>{candidates.map(word=><li key={word.id}><button type="button" onClick={()=>{setVerb({id:word.id,german:word.german});setQuery('')}}>{word.german} — {word.selectedTranslation.text??t("Перевод отсутствует")}</button></li>)}</ul>}
    <p className={styles.hint}>{t("Показаны первые 10 совпадений. При необходимости уточните поиск.")}</p></fieldset>}
   <label>{t("Немецкая фраза")}<textarea required rows={2} maxLength={500} value={german} disabled={busy} onChange={event=>setGerman(event.target.value)} placeholder="einen Arbeitgeber suchen" /></label>
   <label>{t("Подсказка по управлению (необязательно)")}<input maxLength={300} value={grammar} disabled={busy} onChange={event=>setGrammar(event.target.value)} placeholder="mit + Dativ" /></label>
   <TranslationDraftFields language={formLanguage} values={translations} disabled={busy} onLanguage={setFormLanguage} onText={(language,text)=>setTranslations(previous=>({...previous,[language]:text}))} />
   {error!==null&&<p role="alert">{errorText(error)}</p>}
   {draft&&(error as {status?:number}|null)?.status===409&&<><p>{t("Загрузка сохранённой версии заменит черновик сочетания.")}</p><button type="button" disabled={busy} onClick={()=>void reload()}>{t("Загрузить сохранённую версию")}</button></>}
   <div className={styles.actions}><button type="submit" disabled={busy||!verb}>{busy?t("Сохраняем…"):t("Сохранить сочетание")}</button><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("Отмена")}</button></div>
  </form>
 </Modal>;
}
function DeleteDialog({row,onClose,onDeleted,onBusy}:{row:Collocation;onClose:()=>void;onDeleted:()=>void;onBusy:(busy:boolean)=>void}){
 const {t,errorText}=useI18n(),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),writing=useRef(false);
 async function remove(){if(writing.current)return;writing.current=true;setBusy(true);onBusy(true);try{await client.remove(row.nounWordId,row.id,row.revision);onDeleted()}catch(failure){setError(failure)}finally{writing.current=false;setBusy(false);onBusy(false)}}
 return <Modal title={t("Удалить сочетание?")} locked={busy} onClose={onClose}><p><strong>{row.german}</strong></p><p>{t("Сочетание исчезнет у всех пользователей. Карточки слов и учебный прогресс сохранятся.")}</p>{error!==null&&<p role="alert">{errorText(error)}</p>}<div className={styles.actions}><button type="button" disabled={busy} onClick={()=>void remove()}>{t("Удалить сочетание")}</button><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("Отмена")}</button></div></Modal>;
}
export function CollocationsPanel({wordId,kind,language,isAdmin=false,disabled=false,onOpenVerb,onChanged,onBusyChange,onEditorChange}:{wordId:string;kind:"noun"|"verb";language:string;isAdmin?:boolean;disabled?:boolean;onOpenVerb?:(id:string)=>void;onChanged?:()=>void;onBusyChange?:(busy:boolean)=>void;onEditorChange?:(open:boolean)=>void}){
 const {t,errorText}=useI18n(),[open,setOpen]=useState(false),[page,setPage]=useState(1),[attempt,setAttempt]=useState(0),[data,setData]=useState<CollocationsPage|null>(null),[error,setError]=useState<unknown>(null),[editor,setEditor]=useState<Collocation|null|undefined>(undefined),[deleting,setDeleting]=useState<Collocation|null>(null),[nounTarget,setNounTarget]=useState<string|null>(null),[notice,setNotice]=useState('');
 const busyCallback=useRef(onBusyChange),editorCallback=useRef(onEditorChange);useEffect(()=>{busyCallback.current=onBusyChange;editorCallback.current=onEditorChange},[onBusyChange,onEditorChange]);
 useEffect(()=>{editorCallback.current?.(editor!==undefined||deleting!==null);return()=>editorCallback.current?.(false)},[editor,deleting]);
 useEffect(()=>()=>busyCallback.current?.(false),[]);
 const reportBusy=useCallback((busy:boolean)=>busyCallback.current?.(busy),[]);
 useEffect(()=>{if(!open)return;const controller=new AbortController();setData(null);setError(null);void client.list(wordId,page,controller.signal).then(value=>{if(controller.signal.aborted)return;const last=Math.max(1,Math.ceil(value.total/value.pageSize));if(page>last)setPage(last);else setData(value)}).catch(failure=>{if(!controller.signal.aborted)setError(failure)});return()=>controller.abort()},[wordId,open,page,attempt,language]);
 function saved(){setEditor(undefined);setDeleting(null);setPage(1);setAttempt(value=>value+1);setNotice('Сочетания обновлены.');onChanged?.()}
 return <section className={styles.panel} aria-label={t(kind==='noun'?"Сочетания с глаголами":"Сочетания с существительными")}>
  <button type="button" disabled={disabled} className="small-button secondary-button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t(open?"Скрыть сочетания":kind==='noun'?"Сочетания с глаголами":"Сочетания с существительными")}</button>
  {open&&<div className={styles.content}>{notice&&<p role="status">{t(notice)}</p>}{error?<p role="alert">{errorText(error)} <button type="button" onClick={()=>setAttempt(value=>value+1)}>{t("Повторить")}</button></p>:!data?<p role="status">{t("Загружаем сочетания…")}</p>:<>
   {!data.items.length?<p className={styles.hint}>{t("Сочетаний пока нет.")}</p>:<ul className={styles.list}>{data.items.map(row=><li key={row.id}><strong>{row.german}</strong><p>{row.selectedTranslation.text??t("Перевод отсутствует")}</p>{row.grammarNote&&<p className={styles.hint}>{row.grammarNote}</p>}<div className={styles.actions}>
    {kind==='noun'&&onOpenVerb?<button type="button" disabled={disabled} className="small-button secondary-button" onClick={()=>onOpenVerb(row.verbWordId)}>{t("Формы глагола {0}",{0:row.verb.german})}</button>:kind==='verb'?<button type="button" disabled={disabled} className="small-button secondary-button" onClick={()=>setNounTarget(row.nounWordId)}>{row.noun.article} {row.noun.german}</button>:<span>{row.verb.german}</span>}
    {isAdmin&&kind==='noun'&&<><button type="button" disabled={disabled} className="small-button" onClick={()=>setEditor(row)}>{t("Изменить сочетание")}</button><button type="button" disabled={disabled} className="small-button secondary-button" onClick={()=>setDeleting(row)}>{t("Удалить сочетание")}</button></>}
   </div></li>)}</ul>}
   {data.total>20&&<nav className={styles.actions} aria-label={t("Страницы сочетаний")}><button type="button" disabled={page===1} onClick={()=>setPage(value=>value-1)}>{t("Предыдущая страница")}</button><span>{t("Страница {0} из {1}",{0:page,1:Math.max(1,Math.ceil(data.total/20))})}</span><button type="button" disabled={!data.hasNext} onClick={()=>setPage(value=>value+1)}>{t("Следующая страница")}</button></nav>}
   {isAdmin&&data.kind==='noun'&&<button type="button" disabled={disabled} className="small-button" onClick={()=>setEditor(null)}>{t("Добавить сочетание")}</button>}
   {isAdmin&&kind==='verb'&&<p className={styles.hint}>{t("Сочетания редактируются в карточке существительного.")}</p>}
  </>}</div>}
  {editor!==undefined&&<Editor key={editor?.id??'new'} nounId={wordId} language={language} initial={editor} onClose={()=>setEditor(undefined)} onSaved={saved} onBusy={reportBusy} />}
  {deleting&&<DeleteDialog row={deleting} onClose={()=>setDeleting(null)} onDeleted={saved} onBusy={reportBusy} />}
  {nounTarget&&<RelatedWordDialog initialId={nounTarget} language={language} onClose={()=>setNounTarget(null)} />}
 </section>;
}
