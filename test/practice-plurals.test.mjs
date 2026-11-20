import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practicePlurals, correctPracticePlural } from '../src/lib/practice-modes.ts';
import { practiceWords } from '../src/lib/practice-modes.ts';
import { activeTrainingWords } from '../src/lib/dictionary-entry-client.ts';
import { eligibleTrainingWords } from '../src/lib/dictionary-training.ts';

const card = (id='house', pluralForm='die Häuser') => ({id,german:'Haus',article:'das',grammaticalNumber:'singular',pluralForm,selectedTranslation:{language:'uk',text:null}});

test('plural training uses only singular nouns with complete explicit forms, without requiring a translation', () => {
  const words=[card(),{...card('plural'),grammaticalNumber:'plural'}, {...card('verb'),article:'none',grammaticalNumber:'not_applicable'}, {...card('unknown'),article:'none'},card('missing',null),card('blank',' ')];
  assert.deepEqual(practiceWords(words,'plural').map(w=>w.id),['house']);
  assert.equal(words[0].selectedTranslation.text,null);
});

test('suffix shorthand, placeholders and annotated forms are excluded rather than guessed', () => {
  for (const form of ['-e','¨-er','-','—','kein Plural','keine Mehrzahl','nur Singular','Singular','ohne Plural','Plural unbekannt','n/a','keine Angabe','er','s','Häuser (selten)','Plural: Häuser','Häuser / -','Häuser /','Häuser 2','Häuser\u0000','нет','без множественного числа','немає множини','unknown','none','no plural','uncountable','unbekannt']) {
    assert.deepEqual(practicePlurals(card('n',form)),[],form);
    assert.equal(correctPracticePlural(card('n',form),'Häuser'),false,form);
  }
});

test('complete alternatives support separators and optional die, retaining words and unique order', () => {
  const word=card('w','die Wörter / Worte, die WÖRTER; Wörter oder Worte');
  assert.deepEqual(practicePlurals(word),['Wörter','Worte']);
  for (const answer of ['Wörter','die Wörter','Worte','die Worte']) assert.equal(correctPracticePlural(word,answer),true);
  assert.equal(correctPracticePlural(word,'Wörter / Worte'),false);
  assert.equal(word.pluralForm,'die Wörter / Worte, die WÖRTER; Wörter oder Worte');
});

test('NFC, whitespace and case are normalized; umlauts and sharp s remain meaningful', () => {
  const word=card();
  for (const answer of ['Häuser','häuser','  DIE  HÄUSER  ','Ha\u0308user']) assert.equal(correctPracticePlural(word,answer),true,answer);
  for (const answer of ['', ' ', 'Haus', 'Hauser', 'Haeuser', 'der Häuser', 'das Häuser', 'die die Häuser']) assert.equal(correctPracticePlural(word,answer),false,answer);
  assert.equal(correctPracticePlural(card('feet','Füße'),'Füsse'),false);
  assert.equal(correctPracticePlural(card('feet','Füße'),'FÜẞE'),true);
});

test('full multiword and hyphenated plurals are not reduced to their last word', () => {
  const word=card('multi','die roten Karten');
  assert.equal(correctPracticePlural(word,'  die roten   Karten '),true);
  assert.equal(correctPracticePlural(word,'Karten'),false);
  assert.deepEqual(practicePlurals(card('it','IT-Systeme')),['IT-Systeme']);
  assert.equal(correctPracticePlural(card('window','Fenster'),'Fenster'),true);
});

test('archive, selected filters and new/review queues intersect plural eligibility in original order', () => {
  const words=[card('b'),{...card('archived'),dictionaryEntry:{isArchived:true,isFavorite:false,revision:'r'}},card('no','-e'),card('a')];
  const filtered=practiceWords(activeTrainingWords(words),'plural');
  assert.deepEqual(filtered.map(w=>w.id),['b','a']);
  assert.deepEqual(eligibleTrainingWords(filtered,[card('a'),card('foreign')]).map(w=>w.id),['a']);
  assert.deepEqual(practiceWords([],'plural'),[]);
});
