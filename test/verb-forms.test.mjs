import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyVerbForm, verbDraft, verbPayload, perfekt, pastForm } from "../src/lib/verb-forms.ts";

test("legacy servers receive no new fields and clearing a verb is explicit", () => {
  assert.deepEqual(verbPayload(false, true, [emptyVerbForm()]), {});
  assert.deepEqual(verbPayload(true, false, []), {});
  assert.deepEqual(verbPayload(true, false, [], true), { isVerb: false });
  assert.throws(() => verbPayload(true, true, [emptyVerbForm()]));
  assert.throws(() => verbPayload(true, true, []));
});
test("form payload strips server metadata, normalizes text and keeps variants paired", () => {
  const forms = [{ id: "server", position: 3, praeteritum: "  zog  um ", participle2: "umgezogen", auxiliary: "SEIN", usage: "Wohnort" },
    { praeteritum: "zog um", participle2: "umgezogen", auxiliary: "HABEN", reflexive: true, usage: "Kleidung" }];
  const payload = verbPayload(true, true, verbDraft(forms));
  assert.equal(payload.verbForms[0].praeteritum, "zog um");
  assert.equal(payload.verbForms[0].id, undefined);
  assert.equal(perfekt(payload.verbForms[0]), "ist umgezogen");
  assert.equal(perfekt(payload.verbForms[1]), "hat sich umgezogen");
  assert.equal(pastForm(payload.verbForms[1]), "zog sich um");
  assert.equal(pastForm({ ...payload.verbForms[1], praeteritum: "zog sich um" }), "zog sich um");
  assert.equal(pastForm(payload.verbForms[0]), "zog um");
  assert.equal(forms[0].praeteritum, "  zog  um ");
});
