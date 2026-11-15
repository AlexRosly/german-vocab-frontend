import type { VerbForm } from "./verb-forms";
export type VerbCard = { id: string; german: string; notes?: string | null; sourceBook?: string | null;
  selectedTranslation: { language: string; text: string | null; source?: "personal" };
  publicationStatus: "PUBLISHED" | "PENDING_REVIEW" | "REJECTED"; isInDictionary: boolean; verbForms: VerbForm[] };
export type VerbQuery = { q: string; scope: "library" | "mine"; auxiliary: "" | "HABEN" | "SEIN"; page: number };
export type VerbPage = { items: VerbCard[]; total: number; page: number; pageSize: number; hasNext: boolean };
export type VerbExample = { id: string; german: string; selectedTranslation: {language:string;text:string|null} };
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
const failure = () => new Error("Не удалось загрузить справочник глаголов");
const idValid = (id: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/.test(id);
function translation(value: unknown): boolean {
  const row=value as VerbCard["selectedTranslation"]|null;
  return !!row && typeof row.language==="string" && !!row.language && (row.text===null||typeof row.text==="string") && (row.source===undefined||row.source==="personal");
}
function form(value: unknown): value is VerbForm {
  const row=value as VerbForm|null;
  return !!row && [row.praeteritum,row.participle2].every(text=>typeof text==="string"&&!!text.trim()&&text.length<=200) && ["HABEN","SEIN"].includes(row.auxiliary) && typeof row.reflexive==="boolean" && (row.usage==null||typeof row.usage==="string");
}
function card(value: unknown): value is VerbCard {
  const row=value as VerbCard|null;
  return !!row && typeof row.id==="string" && idValid(row.id) && typeof row.german==="string" && !!row.german.trim() && translation(row.selectedTranslation) &&
    typeof row.isInDictionary==="boolean" && ["PUBLISHED","PENDING_REVIEW","REJECTED"].includes(row.publicationStatus) &&
    (row.notes==null||typeof row.notes==="string") && (row.sourceBook==null||typeof row.sourceBook==="string") &&
    Array.isArray(row.verbForms) && row.verbForms.length>0 && row.verbForms.length<=4 && row.verbForms.every(form);
}
export class VerbCatalogClient {
  private readonly fetcher: Fetcher;
  constructor(fetcher: Fetcher) { this.fetcher=fetcher; }
  private async read(path: string, signal?: AbortSignal): Promise<unknown> {
    const response=await this.fetcher(path,{signal,cache:"no-store"});
    if(!response.ok) throw Object.assign(failure(),{status:response.status});
    try{return await response.json()}catch{throw failure()}
  }
  async list(query: VerbQuery, signal?: AbortSignal): Promise<VerbPage> {
    const q=query.q.normalize("NFC").trim().replace(/\s+/gu," ");
    if(q.length>100||!["library","mine"].includes(query.scope)||!["","HABEN","SEIN"].includes(query.auxiliary)||!Number.isSafeInteger(query.page)||query.page<1||query.page>1000000)throw failure();
    const params=new URLSearchParams({scope:query.scope,page:String(query.page)});if(q)params.set("q",q);if(query.auxiliary)params.set("auxiliary",query.auxiliary);
    const value=await this.read(`/verbs?${params}`,signal) as VerbPage;
    if(!value||!Number.isSafeInteger(value.total)||value.total<0||value.page!==query.page||value.pageSize!==30||value.hasNext!==(query.page*30<value.total)||
      !Array.isArray(value.items)||!value.items.every(card)||value.items.length!==Math.min(30,Math.max(0,value.total-(query.page-1)*30))||new Set(value.items.map(word=>word.id)).size!==value.items.length)throw failure();
    return value;
  }
  async detail(id: string, signal?: AbortSignal): Promise<{word:VerbCard;examples:VerbExample[]}> {
    if(!idValid(id))throw failure();
    const encoded=encodeURIComponent(id);
    const [word,examples]=await Promise.all([this.read(`/verbs/${encoded}`,signal),this.read(`/words/${encoded}/examples`,signal)]);
    if(!card(word)||word.id!==id||!Array.isArray(examples)||!examples.every(row=>row&&typeof row.id==="string"&&typeof row.german==="string"&&translation(row.selectedTranslation)))throw failure();
    return {word,examples};
  }
}
