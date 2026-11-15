export type VerbForm = {
  praeteritum: string;
  participle2: string;
  auxiliary: "HABEN" | "SEIN";
  reflexive?: boolean;
  usage?: string | null;
};

export const emptyVerbForm = (): VerbForm => ({ praeteritum: "", participle2: "", auxiliary: "HABEN", reflexive: false, usage: "" });
export function verbDraft(forms?: VerbForm[]): VerbForm[] {
  return forms?.length ? forms.map(({ praeteritum, participle2, auxiliary, reflexive, usage }) => ({ praeteritum, participle2, auxiliary, reflexive: reflexive ?? false, usage: usage ?? "" })) : [emptyVerbForm()];
}
export function verbPayload(enabled: boolean, isVerb: boolean, forms: VerbForm[], wasVerb = false) {
  if (!enabled) return {};
  if (!isVerb) return wasVerb ? { isVerb: false } : {};
  const clean = forms.map(form => ({ praeteritum: form.praeteritum.normalize("NFC").trim().replace(/\s+/gu, " "),
    participle2: form.participle2.normalize("NFC").trim().replace(/\s+/gu, " "), auxiliary: form.auxiliary,
    reflexive: form.reflexive ?? false, usage: form.usage?.normalize("NFC").trim().replace(/\s+/gu, " ") || null }));
  if (clean.length < 1 || clean.length > 4 || clean.some(form => !form.praeteritum || !form.participle2 || !["HABEN", "SEIN"].includes(form.auxiliary))) {
    throw new Error("Заполните Präteritum, Partizip II и haben/sein");
  }
  return { isVerb: true, verbForms: clean };
}
export function perfekt(form: VerbForm) {
  return `${form.auxiliary === "SEIN" ? "ist" : "hat"}${form.reflexive ? " sich" : ""} ${form.participle2}`;
}
export function pastForm(form: VerbForm) {
  if (!form.reflexive || /(?:^|\s)sich(?:\s|$)/u.test(form.praeteritum)) return form.praeteritum;
  const [verb, ...rest] = form.praeteritum.split(" ");
  return [verb, "sich", ...rest].join(" ");
}
