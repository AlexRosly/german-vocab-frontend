"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { VerbCatalogClient, type VerbCard, type VerbPage, type VerbQuery, type VerbExample } from "@/lib/verb-catalog-client";
import { pastForm, perfekt } from "@/lib/verb-forms";
import { publicationLabel } from "@/lib/word-view";
import { VerbForms } from "./verb-forms";
import { useI18n } from "./ui-language-provider";
import styles from "./verb-catalog.module.css";
const client=new VerbCatalogClient(apiFetch);

function VerbDialog({ id, language, onClose, restoreFocus }: {id:string;language:string;onClose:()=>void;restoreFocus:()=>void}) {
  const {t,errorText}=useI18n();
  const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const restore=useRef(restoreFocus);useEffect(()=>{restore.current=restoreFocus},[restoreFocus]);
  const [data,setData]=useState<{word:VerbCard;examples:VerbExample[]}|null>(null),[error,setError]=useState<unknown>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const el=dialog.current,trigger=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";el?.showModal();heading.current?.focus();return()=>{el?.close();document.body.style.overflow=overflow;if(trigger?.isConnected && trigger!==document.body && trigger!==document.documentElement)trigger.focus();else restore.current();}},[]);
  useEffect(()=>{const controller=new AbortController();setData(null);setError(null);void client.detail(id,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(failure=>{if(!controller.signal.aborted)setError(failure)});return()=>controller.abort()},[id,language,attempt]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="verb-card-title" onCancel={event=>{event.preventDefault();onClose()}}>
    <header className={styles.dialogHeader}><h2 ref={heading} tabIndex={-1} id="verb-card-title">{data?.word.german??t("Карточка глагола")}</h2><button type="button" onClick={onClose}>{t("Закрыть")}</button></header>
    <div className={styles.dialogBody}>{error?<p role="alert">{errorText(error)} <button type="button" onClick={()=>setAttempt(value=>value+1)}>{t("Повторить")}</button></p>:!data?<p role="status">{t("Загружаем карточку…")}</p>:<>
      <p>{data.word.selectedTranslation.text??t("Перевод отсутствует")}</p>
      {data.word.selectedTranslation.source==="personal"&&<p className={styles.hint}>{t("Мой перевод")}</p>}
      <p className={styles.hint}>{t(publicationLabel(data.word.publicationStatus))}</p>
      <VerbForms forms={data.word.verbForms} initiallyOpen />
      {data.word.notes&&<p>{data.word.notes}</p>}
      {data.word.sourceBook&&<p>{t("Книга-источник")}: {data.word.sourceBook}</p>}
      <h3>{t("Примеры употребления")}</h3>
      {!data.examples.length?<p>{t("Примеров пока нет.")}</p>:data.examples.map(example=><blockquote key={example.id}><p>{example.german}</p><p className={styles.hint}>{example.selectedTranslation.text??t("Перевод отсутствует")}</p></blockquote>)}
    </>}</div>
  </dialog>;
}

export function VerbCatalog({language,initialWordId}:{language:string;initialWordId:string|null}) {
  const {t,errorText}=useI18n();
  const [input,setInput]=useState(""),[query,setQuery]=useState<VerbQuery>({q:"",scope:"library",auxiliary:"",page:1});
  const [data,setData]=useState<VerbPage|null>(null),[error,setError]=useState<unknown>(null),[attempt,setAttempt]=useState(0);
  const [target,setTarget]=useState<string|null>(initialWordId),heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>setTarget(initialWordId),[initialWordId]);
  useEffect(()=>{const controller=new AbortController();setData(null);setError(null);void client.list(query,controller.signal).then(value=>{if(!controller.signal.aborted){ const last=Math.max(1,Math.ceil(value.total/value.pageSize)); if(query.page>last)setQuery(previous=>previous===query?{...previous,page:last}:previous); else setData(value); }}).catch(failure=>{if(!controller.signal.aborted)setError(failure)});return()=>controller.abort()},[query,language,attempt]);
  function search(event:FormEvent){event.preventDefault();setQuery(value=>({...value,q:input,page:1}))}
  return <section className={styles.panel} aria-labelledby="verb-catalog-heading">
    <h3 id="verb-catalog-heading" tabIndex={-1} ref={heading}>{t("Справочник глаголов")}</h3>
    <p className={styles.hint}>{t("Инфинитив, формы прошедшего времени и вспомогательный глагол. Нажмите на глагол, чтобы открыть карточку с примерами.")}</p>
    <form className={styles.filters} onSubmit={search}>
      <label className={styles.search}>{t("Поиск по глаголу или форме")}<input type="search" maxLength={100} value={input} onChange={event=>setInput(event.target.value)} placeholder={t("Например: gehen, ging, gegangen")} /></label>
      <label>{t("Раздел справочника")}<select value={query.scope} onChange={event=>setQuery(value=>({...value,q:input,scope:event.target.value as VerbQuery["scope"],page:1}))}><option value="library">{t("Все опубликованные глаголы")}</option><option value="mine">{t("Глаголы из моего словаря")}</option></select></label>
      <label>{t("Вспомогательный глагол")}<select value={query.auxiliary} onChange={event=>setQuery(value=>({...value,q:input,auxiliary:event.target.value as VerbQuery["auxiliary"],page:1}))}><option value="">{t("Любой")}</option><option value="HABEN">haben</option><option value="SEIN">sein</option></select></label>
      <button type="submit">{t("Найти")}</button>
      <button type="button" className="secondary" onClick={()=>{setInput("");setQuery({q:"",scope:"library",auxiliary:"",page:1})}}>{t("Сбросить фильтры")}</button>
    </form>
    {error?<p role="alert">{errorText(error)} <button type="button" onClick={()=>setAttempt(value=>value+1)}>{t("Повторить")}</button></p>:!data?<p role="status">{t("Загружаем глаголы…")}</p>:<>
      <p role="status">{t("Глаголов: {0}",{0:data.total})}</p>
      {!data.items.length?<p>{t("Глаголы не найдены. Измените поиск или фильтры.")}</p>:<table className={styles.table}>
        <caption>{t("Формы для er/sie/es. Для найденных глаголов показаны все варианты значений.")}</caption>
        <thead><tr><th scope="col">Infinitiv</th><th scope="col">Präteritum</th><th scope="col">Partizip II</th><th scope="col">Perfekt</th></tr></thead>
        <tbody>{data.items.flatMap(word=>word.verbForms.map((form,index)=><tr key={word.id+":"+index}>
          <th scope="row"><button type="button" className={styles.word} aria-haspopup="dialog" onClick={()=>setTarget(word.id)}>{word.german}</button><p>{word.selectedTranslation.text??t("Перевод отсутствует")}</p>{word.isInDictionary&&<span className={styles.hint}>{t("В моём словаре")}</span>}{word.publicationStatus!=="PUBLISHED"&&<p className={styles.hint}>{t(publicationLabel(word.publicationStatus))}</p>}{form.usage&&<p className={styles.hint}>{form.usage}</p>}</th>
          <td data-label="Präteritum">{pastForm(form)}</td><td data-label="Partizip II">{form.participle2}</td><td data-label="Perfekt">{perfekt(form)}</td>
        </tr>))}</tbody>
      </table>}
      <nav className={styles.pagination} aria-label={t("Страницы справочника")}><button type="button" disabled={query.page===1} onClick={()=>{setQuery(value=>({...value,page:value.page-1}));heading.current?.focus()}}>{t("Предыдущая страница")}</button><span>{t("Страница {0} из {1}",{0:query.page,1:Math.max(1,Math.ceil(data.total/data.pageSize))})}</span><button type="button" disabled={!data.hasNext} onClick={()=>{setQuery(value=>({...value,page:value.page+1}));heading.current?.focus()}}>{t("Следующая страница")}</button></nav>
    </>}
    {target&&<VerbDialog key={target} id={target} language={language} onClose={()=>setTarget(null)} restoreFocus={()=>heading.current?.focus()} />}
  </section>;
}
