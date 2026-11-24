export type LessonName={book:string;lessonNumber:number;name:string};
export type OrganizationBook={title:string;lessonNumbers:number[]};
export type WordOrganization={wordId:string;books:OrganizationBook[];tags:string[];bookRevision:string|null;tagsRevision:string|null;lessonNames:LessonName[];settingsRevision:string|null};
export type OrganizationSettings={neutralColor:string|null;revision:string|null};
type Requester=(path:string,init?:RequestInit)=>Promise<Response>;
export const normalizedTitle=(s:string)=>s.normalize("NFC").trim().replace(/\s+/gu," ");
export const organizationKey=(s:string)=>normalizedTitle(s).toLocaleLowerCase("de");
export const namedLessonKey=(n:LessonName)=>JSON.stringify([organizationKey(n.book),n.lessonNumber]);
export class OrganizationError extends Error{readonly status:number;constructor(status:number){super(status===409?"Организация словаря изменилась. Загрузите сохранённую версию.":status===404||status===503?"Организация словаря пока недоступна":"Не удалось загрузить или сохранить организацию словаря");this.status=status}}
const fail=():never=>{throw new OrganizationError(400)};
const revision=(v:unknown)=>v===null||typeof v==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
export function organizationTags(value:readonly string[]):string[]{
  if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=="string"))return fail();
  const result=value.map(normalizedTitle);if(result.some(v=>!v||[...v].length>40||/\p{Cc}/u.test(v))||new Set(result.map(organizationKey)).size!==result.length)return fail();return result;
}
export function lessonNumbers(value:string):number[]{
  const parts=value.trim()?value.trim().split(/[,;\s]+/u):[];if(parts.some(s=>!/^\d{1,5}$/.test(s)||Number(s)<1||Number(s)>10000))return fail();
  return [...new Set(parts.map(Number))].sort((a,b)=>a-b);
}
export function organizationBooks(value:readonly OrganizationBook[]):OrganizationBook[]{
  if(!Array.isArray(value)||value.length>20)return fail();
  const result=value.map((b:OrganizationBook)=>{if(!b||typeof b.title!=="string"||!Array.isArray(b.lessonNumbers)||b.lessonNumbers.length>10000||b.lessonNumbers.some(n=>!Number.isInteger(n)||n<1||n>10000)||new Set(b.lessonNumbers).size!==b.lessonNumbers.length)return fail();const title=normalizedTitle(b.title);if(!title||title==="__proto__"||[...title].length>120||/\p{Cc}/u.test(title))return fail();return{title,lessonNumbers:[...b.lessonNumbers].sort((a,b)=>a-b)}});
  if(new Set(result.map(b=>organizationKey(b.title))).size!==result.length)return fail();return result;
}
function validNames(value:unknown,empty=false):value is LessonName[]{
  return Array.isArray(value)&&value.length<=(empty?100:500)&&value.every(n=>n&&typeof n.book==="string"&&normalizedTitle(n.book)===n.book&&!!n.book&&n.book!=="__proto__"&&[...n.book].length<=120&&typeof n.name==="string"&&normalizedTitle(n.name)===n.name&&(empty||!!n.name)&&[...n.name].length<=120&&!/\p{Cc}/u.test(n.book+n.name)&&Number.isInteger(n.lessonNumber)&&n.lessonNumber>0&&n.lessonNumber<=10000)&&new Set(value.map(namedLessonKey)).size===value.length;
}
export class OrganizationClient{
  private readonly request:Requester;constructor(request:Requester){this.request=request}
  private path(wordId:string){if(!/^(?!\.{1,2}$)[A-Za-z0-9._-]{1,191}$/.test(wordId))return fail();return `/words/${wordId}/organization`}
  private async read(r:Response,wordId:string):Promise<WordOrganization>{
    if(!r.ok)throw new OrganizationError(r.status);const d=await r.json().catch(()=>null)as WordOrganization|null;
    try{if(!d||d.wordId!==wordId||JSON.stringify(organizationBooks(d.books))!==JSON.stringify(d.books)||JSON.stringify(organizationTags(d.tags))!==JSON.stringify(d.tags)||!validNames(d.lessonNames)||!revision(d.bookRevision)||!revision(d.tagsRevision)||!revision(d.settingsRevision)||(d.books.length===0)!==(d.bookRevision===null)||(d.tags.length===0)!==(d.tagsRevision===null)||(d.lessonNames.length>0&&d.settingsRevision===null))throw Error();return d}catch{throw new OrganizationError(502)}
  }
  get(wordId:string,signal?:AbortSignal){return this.request(this.path(wordId),{cache:"no-store",signal}).then(r=>this.read(r,wordId))}
  async save(wordId:string,current:WordOrganization,books:OrganizationBook[],tags:string[],updates:LessonName[],signal?:AbortSignal){
    const path=this.path(wordId),normalizedBooks=organizationBooks(books),normalizedTags=organizationTags(tags);
    if(!Array.isArray(updates))return fail();updates=updates.map(n=>({...n,book:typeof n?.book==="string"?normalizedTitle(n.book):n?.book,name:typeof n?.name==="string"?normalizedTitle(n.name):n?.name}));
    if(current.wordId!==wordId||![current.bookRevision,current.tagsRevision,current.settingsRevision].every(revision)||!validNames(updates,true)||updates.some(n=>!normalizedBooks.some(b=>organizationKey(b.title)===organizationKey(n.book)&&b.lessonNumbers.includes(n.lessonNumber))))return fail();
    const result=await this.read(await this.request(path,{method:"PUT",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({books:normalizedBooks,tags:normalizedTags,bookRevision:current.bookRevision,tagsRevision:current.tagsRevision,settingsRevision:current.settingsRevision,lessonNameUpdates:updates})}),wordId);
    if(JSON.stringify(result.books)!==JSON.stringify(normalizedBooks)||JSON.stringify(result.tags)!==JSON.stringify(normalizedTags)||updates.some(n=>{const found=result.lessonNames.find(x=>namedLessonKey(x)===namedLessonKey(n));return n.name?found?.name!==n.name:found!==undefined}))throw new OrganizationError(502);return result;
  }
  private async readSettings(r:Response):Promise<OrganizationSettings>{if(!r.ok)throw new OrganizationError(r.status);const d=await r.json().catch(()=>null);if(!d||!revision(d.revision)||(d.neutralColor!==null&&(typeof d.neutralColor!=="string"||!/^#[0-9a-f]{6}$/.test(d.neutralColor)))||(d.neutralColor!==null&&d.revision===null))throw new OrganizationError(502);return d}
  settings(signal?:AbortSignal){return this.request('/dictionary-organization/settings',{cache:"no-store",signal}).then(r=>this.readSettings(r))}
  async color(value:string|null,current:string|null,signal?:AbortSignal){if((value!==null&&!/^#[0-9a-fA-F]{6}$/.test(value))||!revision(current))return fail();const result=await this.readSettings(await this.request('/dictionary-organization/settings',{method:"PATCH",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({neutralColor:value,revision:current})}));if(result.neutralColor!==(value?.toLowerCase()??null))throw new OrganizationError(502);return result}
}
export type OrganizedWord={sourceBook?:string|null;lessonNumber?:number|null;bookSources?:readonly{sourceBook:string;lessonNumbers:readonly number[]}[];personalBooks?:readonly string[];personalBookLessons?:unknown;personalTags?:readonly string[];personalLessonNames?:readonly LessonName[]};
export function wordLessonNames(word:OrganizedWord,names:readonly LessonName[]):LessonName[]{
  const keys=new Set<string>();for(const row of [...(word.bookSources??[]),...(word.sourceBook?[{sourceBook:word.sourceBook,lessonNumbers:word.lessonNumber==null?[]:[word.lessonNumber]}]:[])])for(const n of row.lessonNumbers)keys.add(JSON.stringify([organizationKey(row.sourceBook),n]));
  for(const title of word.personalBooks??[])for(const [old,numbers]of Object.entries((word.personalBookLessons??{})as Record<string,number[]>))if(organizationKey(old)===organizationKey(title))for(const n of numbers)keys.add(JSON.stringify([organizationKey(title),n]));return names.filter(n=>keys.has(namedLessonKey(n)));
}
export function personalTagOptions(words:readonly OrganizedWord[],selected:string){const rows=new Map<string,string>();for(const word of words)for(const tag of word.personalTags??[])if(!rows.has(organizationKey(tag)))rows.set(organizationKey(tag),tag);if(selected.startsWith('tag:')&&!rows.has(selected.slice(4)))rows.set(selected.slice(4),selected.slice(4));return [...rows].map(([key,title])=>({key:'tag:'+key,title})).sort((a,b)=>a.title.localeCompare(b.title))}
export function matchesPersonalTag(word:OrganizedWord,selected:string){return !selected||selected==='none'?!selected||!(word.personalTags?.length):word.personalTags?.some(t=>'tag:'+organizationKey(t)===selected)===true}
export function lessonDisplayName(words:readonly OrganizedWord[],bookFilter:string,n:number):string|null{if(!bookFilter.startsWith('book:'))return null;for(const word of words){const found=word.personalLessonNames?.find(x=>'book:'+organizationKey(x.book)===bookFilter&&x.lessonNumber===n);if(found)return found.name}return null}
export function articleCategory(word:{article:string;grammaticalNumber:string}):string{return word.grammaticalNumber==='plural'?'plural':word.article!=='none'?word.article:word.grammaticalNumber==='singular'?'unknown':'not_applicable'}
export function matchesArticleCategory(word:{article:string;grammaticalNumber:string},filter:string){return filter==='all'||(filter==='none'?word.article==='none':articleCategory(word)===filter)}
export function neutralCardStyle(word:{article:string;grammaticalNumber:string},color:string|null|undefined):{backgroundColor?:string;borderColor?:string}{if(!color||!/^#[0-9a-fA-F]{6}$/.test(color)||word.article!=='none'||word.grammaticalNumber==='plural')return{};const rgb=[1,3,5].map(i=>Math.round(255*.92+parseInt(color.slice(i,i+2),16)*.08));return{backgroundColor:`rgb(${rgb.join(', ')})`,borderColor:color}}
