"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CorrectionsClient, correctionCategories, correctionStatuses, type Correction, type CorrectionCategory, type CorrectionDetail, type CorrectionSnapshot, type CorrectionStatus } from "@/lib/corrections-client";
import { useI18n } from "./ui-language-provider";
import styles from "./corrections.module.css";
const client=new CorrectionsClient(apiFetch);
const categories={WORD:"Слово и грамматика",TRANSLATION:"Перевод",EXAMPLE:"Пример употребления",RELATION:"Связанные слова",OTHER:"Другое"};
const statuses={OPEN:"Ожидает рассмотрения",RESOLVED:"Исправлено",REJECTED:"Отклонено"};

function Dialog({title,onClose,busy,children}:{title:string;onClose:()=>void;busy:boolean;children:React.ReactNode}){
 const {t}=useI18n();const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;const element=dialog.current;element?.showModal();heading.current?.focus();return()=>{element?.close();previous?.focus();};},[]);
 return <dialog ref={dialog} className={styles.dialog} aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className={styles.header}><h2 ref={heading} tabIndex={-1}>{title}</h2><button type="button" aria-label={t("Закрыть")} disabled={busy} onClick={onClose}>{"×"}<span className={styles.srOnly}> {title}</span></button></div>{children}
 </dialog>;
}
export function ProposeCorrection({wordId,german,disabled,onBusyChange}:{wordId:string;german:string;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
 const {t,errorText}=useI18n();const [open,setOpen]=useState(false),[category,setCategory]=useState<CorrectionCategory>("WORD"),[description,setDescription]=useState(""),[suggestion,setSuggestion]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[sent,setSent]=useState(false);const saving=useRef(false);
 useEffect(()=>{if(!busy)return;onBusyChange(true);return()=>onBusyChange(false);},[busy,onBusyChange]);
 async function send(e:React.FormEvent){e.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError(null);try{await client.create(wordId,category,description,suggestion);setSent(true);}catch(failure){setError(failure);}finally{saving.current=false;setBusy(false);}}
 return <><button type="button" disabled={disabled} onClick={()=>{setOpen(true);setError(null);setSent(false);}}>{t("Предложить исправление")}</button>
  {open&&<Dialog title={t("Предложить исправление: {0}",{0:german})} busy={busy} onClose={()=>setOpen(false)}>
   {sent?<p role="status">{t("Предложение отправлено администратору. Статус — в разделе «Исправления».")}</p>:<form onSubmit={e=>void send(e)} className={styles.form}>
    <p>{t("Общая карточка не изменится автоматически. Не включайте личные данные из своих заметок.")}</p>
    <label>{t("Что нужно исправить?")}<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value as CorrectionCategory)}>{correctionCategories.map(c=><option key={c} value={c}>{t(categories[c])}</option>)}</select></label>
    <label>{t("Описание ошибки")}<textarea required minLength={10} maxLength={2000} rows={4} value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/></label>
    <label>{t("Предлагаемый вариант (необязательно)")}<textarea maxLength={2000} rows={3} value={suggestion} disabled={busy} onChange={e=>setSuggestion(e.target.value)}/></label>
    {error!==null&&<p role="alert">{errorText(error)}</p>}
    <button type="submit" disabled={busy||description.trim().length<10}>{t(busy?"Отправляем…":"Отправить предложение")}</button>
   </form>}
  </Dialog>}
 </>;
}
function SnapshotView({snapshot:s}:{snapshot:CorrectionSnapshot}){
 const {t}=useI18n();return <div className={styles.snapshot}><h4>{s.article!=="none"?s.article+" ":""}{s.german}</h4>
  <p>{s.pluralForm} {s.sourceBook} {s.level} {s.lessonNumber!==null?t("Урок")+" "+s.lessonNumber:""}</p>
  {s.notes&&<p>{s.notes}</p>}
  <h5>{t("Переводы")}</h5>{s.translation&&!s.translations.some(x=>x.language==="ru")&&<p><b>ru</b>: {s.translation}</p>}{s.translations.map(x=><p key={x.language}><b>{x.language}</b>: {x.text}</p>)}
  <h5>{t("Примеры употребления")}</h5>{s.examples.map(e=><blockquote key={e.id}><p>{e.german}</p>{e.translations.map(x=><p key={x.language}>{x.language}: {x.text}</p>)}</blockquote>)}
  <h5>{t("Связанные слова")}</h5><p>{s.relatedWords.map(w=>(w.article==="none"?"":w.article+" ")+w.german).join(", ")||t("Связанных слов пока нет.")}</p>
 </div>;
}
export function CorrectionsPanel({isAdmin,onBusyChange,onOpenCard}:{isAdmin:boolean;onBusyChange:(busy:boolean)=>void;onOpenCard:(wordId:string)=>void}){
 const {t,errorText,date}=useI18n();const [scope,setScope]=useState(isAdmin),[status,setStatus]=useState<CorrectionStatus>("OPEN"),[page,setPage]=useState(0),[version,setVersion]=useState(0),[rows,setRows]=useState<Correction[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState<unknown>(null);
 const [selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<CorrectionDetail|null>(null),[detailError,setDetailError]=useState<unknown>(null),[detailVersion,setDetailVersion]=useState(0),[comment,setComment]=useState(""),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[notice,setNotice]=useState("");const saving=useRef(false);
 useEffect(()=>{if(!busy)return;onBusyChange(true);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError(null);setRows([]);void client.list(scope,status,page,abort.signal).then(data=>{if(!abort.signal.aborted){setRows(data.items);setTotal(data.total);}}).catch(e=>{if(!abort.signal.aborted)setError(e);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[scope,status,page,version]);
 useEffect(()=>{if(!selected)return;const abort=new AbortController();setDetail(null);setDetailError(null);setBlocked(false);setComment("");void client.detail(selected,scope,abort.signal).then(data=>{if(!abort.signal.aborted)setDetail(data);}).catch(e=>{if(!abort.signal.aborted)setDetailError(e);});return()=>abort.abort();},[selected,scope,detailVersion]);
 async function decide(next:"RESOLVED"|"REJECTED"){
  if(!detail||saving.current||blocked)return;saving.current=true;setBusy(true);setDetailError(null);
  try{await client.review(detail,next,comment);setNotice("Решение по предложению сохранено.");setSelected(null);setPage(0);setVersion(v=>v+1);}
  catch(failure){setDetailError(failure);setBlocked(true);}finally{saving.current=false;setBusy(false);}
 }
 return <section className={styles.panel} aria-label={t("Исправления")}><h3>{t(scope?"Предложения пользователей":"Мои предложения")}</h3>
  <p>{t("Предложения не меняют карточки автоматически. Изменения в общую карточку вносит администратор.")}</p>
  <div className={styles.controls}>{isAdmin&&<label>{t("Показать")}<select disabled={busy} value={scope?"all":"mine"} onChange={e=>{setScope(e.target.value==="all");setPage(0);setSelected(null);}}><option value="all">{t("Все предложения")}</option><option value="mine">{t("Мои предложения")}</option></select></label>}
   <label>{t("Статус")}<select disabled={busy} value={status} onChange={e=>{setStatus(e.target.value as CorrectionStatus);setPage(0);setSelected(null);}}>{correctionStatuses.map(s=><option value={s} key={s}>{t(statuses[s])}</option>)}</select></label>
   <button type="button" disabled={busy||loading} onClick={()=>setVersion(v=>v+1)}>{t("Обновить список")}</button>
  </div>
  {notice&&<p role="status">{t(notice)}</p>}
  {loading?<p role="status">{t("Загружаем предложения…")}</p>:error!==null?<p role="alert">{errorText(error)}</p>:!rows.length?<p>{t("Предложений с этим статусом пока нет.")}</p>:<ul className={styles.list}>{rows.map(r=><li key={r.id}><button type="button" onClick={()=>{setSelected(r.id);setNotice("");}}><strong>{r.snapshot.article!=="none"?r.snapshot.article+" ":""}{r.snapshot.german}</strong><span>{t(categories[r.category])} · {date(r.createdAt)}</span><span>{r.description}</span></button></li>)}</ul>}
  <div className={styles.controls}><button type="button" disabled={loading||busy||page===0} onClick={()=>setPage(p=>p-1)}>{t("Предыдущая страница")}</button><span>{t("Страница {current} из {total}",{current:page+1,total:Math.max(1,Math.ceil(total/30))})}</span><button type="button" disabled={loading||busy||(page+1)*30>=total} onClick={()=>setPage(p=>p+1)}>{t("Следующая страница")}</button></div>
  {selected&&<Dialog title={t("Предложение исправления")} onClose={()=>setSelected(null)} busy={busy}>
   {detailError!==null&&<p role="alert">{errorText(detailError)}</p>}
   {!detail&&!detailError&&<p role="status">{t("Загружаем карточку…")}</p>}
   {detail&&<><h3>{detail.snapshot.german} · {t(statuses[detail.status])}</h3><p><b>{t(categories[detail.category])}</b></p><p className={styles.text}>{detail.description}</p>{detail.suggestion&&<><h4>{t("Предлагаемый вариант")}</h4><p className={styles.text}>{detail.suggestion}</p></>}
    {detail.cardChanged&&<p className={styles.warning}>{t("Карточка уже менялась после отправки предложения. Проверьте актуальные данные.")}</p>}
    <details><summary>{t("Карточка на момент предложения")}</summary><SnapshotView snapshot={detail.snapshot}/></details>
    {detail.current?<details><summary>{t("Текущая общая карточка")}</summary><SnapshotView snapshot={detail.current}/></details>:<p>{t("Общая карточка больше недоступна.")}</p>}
    {detail.reviewComment&&<><h4>{t("Комментарий администратора")}</h4><p className={styles.text}>{detail.reviewComment}</p></>}
    {scope&&<button type="button" disabled={busy} onClick={()=>onOpenCard(detail.wordId)}>{t("Открыть карточку в модерации")}</button>}
    {scope&&detail.status==="OPEN"&&<div className={styles.form}><p>{t("Сначала внесите нужные правки в карточку, затем отметьте результат здесь.")}</p><label>{t("Комментарий пользователю")}<textarea value={comment} minLength={3} maxLength={1000} rows={3} disabled={busy||blocked} onChange={e=>setComment(e.target.value)}/></label><div className={styles.controls}>
     <button type="button" disabled={busy||blocked||comment.trim().length<3} onClick={()=>void decide("RESOLVED")}>{t("Отметить исправленным")}</button><button type="button" disabled={busy||blocked||comment.trim().length<3} onClick={()=>void decide("REJECTED")}>{t("Отклонить предложение")}</button>
    </div></div>}
   </>}
   {(detailError!==null||detail)&&<button type="button" disabled={busy} onClick={()=>setDetailVersion(v=>v+1)}>{t("Загрузить актуальную версию")}</button>}
  </Dialog>}
 </section>;
}
