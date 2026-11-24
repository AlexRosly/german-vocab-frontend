"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { OrganizationClient, OrganizationError, organizationBooks, organizationTags, lessonNumbers, normalizedTitle, organizationKey, namedLessonKey, type LessonName, type WordOrganization } from "@/lib/organization-client";
import { useI18n } from "./ui-language-provider";
import styles from "./word-organization.module.css";
const client=new OrganizationClient(apiFetch);
export function WordOrganizationPanel({wordId,userId,suggestions,disabled,onSaved}:{wordId:string;userId:string;suggestions:string[];disabled:boolean;onSaved:(value:WordOrganization)=>void}){
 const {t}=useI18n(),[open,setOpen]=useState(false);
 return <section className={styles.panel} aria-label={t("Мои книги, уроки и теги")}><button type="button" className="small-button secondary-button" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{t(open?"Скрыть организацию слова":"Мои книги, уроки и теги")}</button>{open&&<OrganizationEditor key={`${userId}-${wordId}`} wordId={wordId} suggestions={suggestions} disabled={disabled} onSaved={onSaved}/>}</section>;
}
function OrganizationEditor({wordId,suggestions,disabled,onSaved}:{wordId:string;suggestions:string[];disabled:boolean;onSaved:(value:WordOrganization)=>void}){
 const {t,errorText}=useI18n();
 const [value,setValue]=useState<WordOrganization|null>(null),[books,setBooks]=useState<{title:string;numbers:string}[]>([]),[tags,setTags]=useState('');
 const [updates,setUpdates]=useState<Record<string,LessonName>>({}),[selected,setSelected]=useState<Record<number,string>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[blocked,setBlocked]=useState(false),[saved,setSaved]=useState(false),[attempt,setAttempt]=useState(0);
 const action=useRef<AbortController|null>(null),writing=useRef(false);
 useEffect(()=>{const c=new AbortController();setValue(null);setLoading(true);setError('');void client.get(wordId,c.signal).then(v=>{if(!c.signal.aborted){setValue(v);setBooks(v.books.map(b=>({title:b.title,numbers:b.lessonNumbers.join(', ')})));setTags(v.tags.join('\n'));setUpdates({});setSelected({});setBlocked(false)}}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить или сохранить организацию словаря')}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>{c.abort();action.current?.abort()}},[wordId,attempt]);
 let valid=true;try{organizationBooks(books.map(b=>({title:b.title,lessonNumbers:lessonNumbers(b.numbers)})));organizationTags(tags.trim()?tags.split('\n').filter(x=>x.trim()):[])}catch{valid=false}
 function changed(){setSaved(false)}
 async function save(e:FormEvent){e.preventDefault();if(!value||!valid||writing.current||disabled||blocked)return;const c=new AbortController();action.current=c;writing.current=true;setBusy(true);setError('');setSaved(false);
  try{const normalized=organizationBooks(books.map(b=>({title:b.title,lessonNumbers:lessonNumbers(b.numbers)}))),names=Object.values(updates).filter(n=>normalized.some(b=>organizationKey(b.title)===organizationKey(n.book)&&b.lessonNumbers.includes(n.lessonNumber)));const result=await client.save(wordId,value,normalized,organizationTags(tags.trim()?tags.split('\n').filter(x=>x.trim()):[]),names,c.signal);if(!c.signal.aborted){setValue(result);setBooks(result.books.map(b=>({title:b.title,numbers:b.lessonNumbers.join(', ')})));setTags(result.tags.join('\n'));setUpdates({});setSaved(true);onSaved(result)}}catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'Не удалось загрузить или сохранить организацию словаря');setBlocked(e instanceof OrganizationError&&e.status===409)}}finally{writing.current=false;if(!c.signal.aborted)setBusy(false)}
 }
 return <div className={styles.editor}><p className="hint">{t("Только для вашего словаря. Общие книги, уроки и карточки не изменятся.")}</p>{loading?<p role="status">{t("Загружаем организацию слова…")}</p>:value&&<form onSubmit={e=>void save(e)}><fieldset disabled={disabled||busy||blocked}>
  {books.map((book,index)=>{let numbers:number[]=[];try{numbers=lessonNumbers(book.numbers)}catch{}const number=numbers.includes(Number(selected[index]))?Number(selected[index]):numbers[0];const target=number?{book:normalizedTitle(book.title),lessonNumber:number,name:''}:null;const name=target?(updates[namedLessonKey(target)]?.name??value.lessonNames.find(n=>namedLessonKey(n)===namedLessonKey(target))?.name??''):'';
   return <div className={styles.book} key={index}><label>{t("Книга {0}",{0:index+1})}<input list={`personal-book-options-${wordId}`} value={book.title} maxLength={120} onChange={e=>{setBooks(old=>old.map((b,i)=>i===index?{...b,title:e.target.value}:b));changed()}}/></label><label>{t("Номера уроков через запятую")}<input value={book.numbers} placeholder="1, 2, 3" onChange={e=>{setBooks(old=>old.map((b,i)=>i===index?{...b,numbers:e.target.value}:b));changed()}}/></label>
    {number!==undefined&&<div className={styles.nameRow}><label>{t("Урок для названия")}<select value={String(number)} onChange={e=>setSelected(old=>({...old,[index]:e.target.value}))}>{numbers.map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>{t("Личное название урока")}<input value={name} maxLength={120} placeholder={t("Например, Работа и профессии")} onChange={e=>{if(target)setUpdates(old=>({...old,[namedLessonKey(target)]:{...target,name:e.target.value}}));changed()}}/></label></div>}
    <button type="button" className="small-button secondary-button" onClick={()=>{setBooks(old=>old.filter((_,i)=>i!==index));changed()}}>{t("Убрать книгу {0}",{0:index+1})}</button></div>;
  })}
  <datalist id={`personal-book-options-${wordId}`}>{suggestions.map(title=><option key={title} value={title}/>)}</datalist><button type="button" className="small-button secondary-button" disabled={books.length>=20} onClick={()=>{setBooks(old=>[...old,{title:'',numbers:''}]);changed()}}>{t("Добавить книгу")}</button>
  <p className="hint">{t("До 20 книг. Название урока общее для ваших слов этой книги; пустое название оставляет только номер. Удаление привязки не удаляет слово и прогресс.")}</p>
  <label htmlFor={`personal-tags-${wordId}`}>{t("Личные теги — по одному в строке")}</label><textarea id={`personal-tags-${wordId}`} rows={3} value={tags} onChange={e=>{setTags(e.target.value);changed()}} placeholder={t("Работа\nЭкзамен")}/><p className="hint">{t("До 20 тегов по 40 символов. Теги видны только вам и доступны в фильтре словаря и тренировки.")}</p>
  </fieldset>{!valid&&<p className={styles.error}>{t("Проверьте названия, номера уроков и теги")}</p>}<button type="submit" disabled={!valid||disabled||busy||blocked}>{t(busy?"Сохраняем…":"Сохранить организацию слова")}</button></form>}
  {error&&<p role="alert" className={styles.error}>{errorText(error)}</p>}{saved&&<p role="status">{t("Книги, уроки и теги сохранены.")}</p>}{((!value&&error)||blocked)&&<button type="button" disabled={busy||disabled} onClick={()=>{setSaved(false);setAttempt(n=>n+1)}}>{t("Загрузить сохранённую версию")}</button>}
 </div>;
}
