export type Collocation={id:string;nounWordId:string;verbWordId:string;german:string;grammarNote:string|null;revision:string;
 translations:{language:string;text:string}[];selectedTranslation:{language:string;text:string|null};noun:{id:string;german:string;article:"der"|"das"|"die";grammaticalNumber:"singular"|"plural"};verb:{id:string;german:string}};
export type CollocationsPage={kind:"noun"|"verb"|"other";items:Collocation[];total:number;page:number;pageSize:number;hasNext:boolean};
export type CollocationInput={verbWordId:string;german:string;grammarNote:string|null;translations:{language:string;text:string|null}[]};
type Fetcher=(path:string,init?:RequestInit)=>Promise<Response>;
const idValid=(id:unknown):id is string=>typeof id==="string"&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/.test(id);
const failure=()=>new Error("Не удалось загрузить или сохранить сочетания");
function valid(value:unknown):value is Collocation {
 const row=value as Collocation|null;if(!row||typeof row.id!=="string"||!idValid(row.id)||!idValid(row.nounWordId)||!idValid(row.verbWordId)||row.nounWordId===row.verbWordId||typeof row.german!=="string"||!row.german.trim()||row.german.length>500||typeof row.revision!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(row.revision)||(row.grammarNote!==null&&typeof row.grammarNote!=="string"))return false;
 if(!row.noun||row.noun.id!==row.nounWordId||typeof row.noun.german!=="string"||!["der","das","die"].includes(row.noun.article)||!["singular","plural"].includes(row.noun.grammaticalNumber)||!row.verb||row.verb.id!==row.verbWordId||typeof row.verb.german!=="string")return false;
 if(!Array.isArray(row.translations)||row.translations.length>11||!row.translations.every(t=>t&&typeof t.language==="string"&&!!t.language&&typeof t.text==="string"&&!!t.text.trim())||new Set(row.translations.map(t=>t.language)).size!==row.translations.length)return false;
 return !!row.selectedTranslation&&typeof row.selectedTranslation.language==="string"&&!!row.selectedTranslation.language&&row.selectedTranslation.text===(row.translations.find(t=>t.language===row.selectedTranslation.language)?.text??null);
}
export function collocationPayload(verbWordId:string,german:string,grammarNote:string,translations:Record<string,string>):CollocationInput {
 const phrase=german.normalize("NFC").trim().replace(/\s+/gu," ");if(!idValid(verbWordId)||!phrase||phrase.length>500||/[\p{Cc}]/u.test(phrase))throw new Error("Выберите глагол и заполните немецкую фразу");
 return {verbWordId,german:phrase,grammarNote:grammarNote.normalize("NFC").trim().replace(/\s+/gu," ")||null,translations:Object.entries(translations).map(([language,text])=>({language,text:text.normalize("NFC").trim()||null}))};
}
export class CollocationsClient {
 private readonly fetcher:Fetcher;constructor(fetcher:Fetcher){this.fetcher=fetcher;}
 private path(wordId:string,id?:string){if(!idValid(wordId)||(id!==undefined&&!idValid(id)))throw failure();return `/words/${encodeURIComponent(wordId)}/collocations${id?'/'+encodeURIComponent(id):''}`;}
 private async request(path:string,init?:RequestInit):Promise<unknown>{
  const response=await this.fetcher(path,{...init,cache:"no-store"});const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(typeof data?.message==="string"?data.message:failure().message),{status:response.status});return data;
 }
 async config(signal?:AbortSignal){try{const data=await this.request('/collocations/config',{signal}) as {enabled?:boolean;version?:number};return data?.enabled===true&&data.version===1}catch(error){if((error as {status?:number}).status===404)return false;throw error}}
 async list(wordId:string,page=1,signal?:AbortSignal):Promise<CollocationsPage>{
  if(!Number.isSafeInteger(page)||page<1||page>1000000)throw failure();const data=await this.request(this.path(wordId)+`?page=${page}`,{signal}) as CollocationsPage;
  if(!data||!["noun","verb","other"].includes(data.kind)||!Number.isSafeInteger(data.total)||data.total<0||data.page!==page||data.pageSize!==20||data.hasNext!==(page*20<data.total)||!Array.isArray(data.items)||data.items.length!==Math.min(20,Math.max(0,data.total-(page-1)*20))||!data.items.every(valid)||data.items.some(row=>data.kind==="noun"?row.nounWordId!==wordId:data.kind==="verb"?row.verbWordId!==wordId:true)||new Set(data.items.map(row=>row.id)).size!==data.items.length)throw failure();return data;
 }
 async detail(wordId:string,id:string,signal?:AbortSignal):Promise<Collocation>{const data=await this.request(this.path(wordId,id),{signal});if(!valid(data)||data.id!==id||![data.nounWordId,data.verbWordId].includes(wordId))throw failure();return data;}
 async save(wordId:string,input:CollocationInput,current?:{id:string;revision:string}):Promise<Collocation>{
  const data=await this.request(this.path(wordId,current?.id),{method:current?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,...(current?{revision:current.revision}:{})})});
  if(!valid(data)||data.nounWordId!==wordId||(current&&data.id!==current.id))throw failure();return data;
 }
 async remove(wordId:string,id:string,revision:string){const data=await this.request(this.path(wordId,id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})}) as {deleted?:boolean};if(data?.deleted!==true)throw failure();}
}
