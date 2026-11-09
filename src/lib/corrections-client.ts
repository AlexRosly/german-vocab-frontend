export const correctionCategories = ["WORD", "TRANSLATION", "EXAMPLE", "RELATION", "OTHER"] as const;
export const correctionStatuses = ["OPEN", "RESOLVED", "REJECTED"] as const;
export type CorrectionCategory = typeof correctionCategories[number];
export type CorrectionStatus = typeof correctionStatuses[number];
type Translation = { language: string; text: string };
export type CorrectionSnapshot = { id: string; german: string; translation: string; article: string; grammaticalNumber: string; pluralForm: string | null; notes: string | null;
 sourceBook: string | null; level: string | null; lessonNumber: number | null; publicationStatus: string;
 translations: Translation[]; examples: {id:string;german:string;translations:Translation[]}[]; relatedWords:{id:string;german:string;article:string}[] };
export type Correction = { id:string; wordId:string; category:CorrectionCategory; description:string; suggestion:string|null; snapshot:CorrectionSnapshot;
 status:CorrectionStatus; revision:string; reviewComment:string|null; reviewedAt:string|null; createdAt:string; updatedAt:string };
export type CorrectionDetail = Correction & {current:CorrectionSnapshot|null;cardChanged:boolean};
type Requester=(path:string,init?:RequestInit)=>Promise<Response>;
const validId=(id:unknown):id is string=>typeof id==="string"&&/^[A-Za-z0-9._-]{1,191}$/.test(id);
const date=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
const translations=(v:unknown):v is Translation[]=>Array.isArray(v)&&v.every(t=>t&&typeof t.language==="string"&&typeof t.text==="string");
function snapshot(v:unknown):v is CorrectionSnapshot {
 if(!v||typeof v!=="object")return false;const s=v as CorrectionSnapshot;
 return validId(s.id)&&typeof s.german==="string"&&typeof s.translation==="string"&&["der","die","das","none"].includes(s.article)&&translations(s.translations)&&
  Array.isArray(s.examples)&&s.examples.every(e=>validId(e.id)&&typeof e.german==="string"&&translations(e.translations))&&
  Array.isArray(s.relatedWords)&&s.relatedWords.every(w=>validId(w.id)&&typeof w.german==="string"&&typeof w.article==="string");
}
function correction(v:unknown):v is Correction {
 if(!v||typeof v!=="object")return false;const c=v as Correction;
 return validId(c.id)&&validId(c.wordId)&&correctionCategories.includes(c.category)&&correctionStatuses.includes(c.status)&&typeof c.description==="string"&&
  (c.suggestion===null||typeof c.suggestion==="string")&&snapshot(c.snapshot)&&c.snapshot.id===c.wordId&&
  typeof c.revision==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(c.revision)&&date(c.createdAt)&&date(c.updatedAt)&&
  (c.status==="OPEN"?c.reviewComment===null&&c.reviewedAt===null:typeof c.reviewComment==="string"&&date(c.reviewedAt));
}
export class CorrectionsError extends Error { readonly status:number; constructor(status:number,message="Не удалось выполнить действие с предложением"){super(message);this.status=status;} }
async function read(response:Response):Promise<unknown>{const data=await response.json().catch(()=>null);if(!response.ok)throw new CorrectionsError(response.status,typeof data?.message==="string"?data.message:undefined);return data;}
export class CorrectionsClient {
 private readonly request:Requester;
 constructor(request:Requester){this.request=request;}
 private path(id:string){if(!validId(id))throw new CorrectionsError(400);return encodeURIComponent(id);}
 async enabled(signal?:AbortSignal){const response=await this.request("/corrections/config",{signal});if(response.status===404||response.status===503)return false;const data=await read(response);return !!data&&typeof data==="object"&&"enabled" in data&&data.enabled===true;}
 async create(wordId:string,category:CorrectionCategory,description:string,suggestion:string){
  const id=this.path(wordId),text=description.normalize("NFC").trim(),replacement=suggestion.normalize("NFC").trim();
  if(!correctionCategories.includes(category)||[...text].length<10||[...text].length>2000||[...replacement].length>2000)throw new CorrectionsError(400,"Опишите ошибку: от 10 до 2000 символов");
  const data=await read(await this.request(`/words/${id}/corrections`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category,description:text,...(replacement?{suggestion:replacement}:{})})}));
  if(!correction(data)||data.wordId!==wordId||data.status!=="OPEN")throw new CorrectionsError(502);return data;
 }
 async list(admin:boolean,status:CorrectionStatus,page:number,signal?:AbortSignal){
  if(!correctionStatuses.includes(status)||!Number.isSafeInteger(page)||page<0||page>1000000)throw new CorrectionsError(400);
  const data=await read(await this.request(`${admin?"/moderation/corrections":"/corrections/mine"}?status=${status}&page=${page}`,{signal})) as {items:Correction[];total:number;page:number;pageSize:number};
  if(!data||!Array.isArray(data.items)||!data.items.every(correction)||data.items.some(c=>c.status!==status)||new Set(data.items.map(c=>c.id)).size!==data.items.length||!Number.isSafeInteger(data.total)||data.total<data.items.length||data.page!==page||data.pageSize!==30)throw new CorrectionsError(502);return data;
 }
 async detail(id:string,admin:boolean,signal?:AbortSignal){
  const data=await read(await this.request(`${admin?"/moderation/corrections":"/corrections/mine"}/${this.path(id)}`,{signal})) as CorrectionDetail;
  if(!correction(data)||data.id!==id||typeof data.cardChanged!=="boolean"||(data.current!==null&&(!snapshot(data.current)||data.current.id!==data.wordId)))throw new CorrectionsError(502);return data;
 }
 async review(report:Correction,status:"RESOLVED"|"REJECTED",comment:string){
  const text=comment.normalize("NFC").trim();if(!correction(report)||report.status!=="OPEN"||!["RESOLVED","REJECTED"].includes(status)||[...text].length<3||[...text].length>1000)throw new CorrectionsError(400,"Напишите комментарий: от 3 до 1000 символов");
  const data=await read(await this.request(`/moderation/corrections/${this.path(report.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,expectedRevision:report.revision,comment:text})}));
  if(!correction(data)||data.id!==report.id||data.status!==status)throw new CorrectionsError(502);return data;
 }
}
