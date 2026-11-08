import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barePracticeGerman, fullPracticeGerman, hasPracticeArticle, hasPracticeTranslation, correctPracticeArticle, practiceWords } from '../src/lib/practice-modes.ts';
import { eligibleTrainingWords } from '../src/lib/dictionary-training.ts';
import { activeTrainingWords } from '../src/lib/dictionary-entry-client.ts';

const noun = (id, article = 'der') => ({ id, german: 'Baum', article, grammaticalNumber: 'singular', selectedTranslation: { language: 'uk', text: 'дерево' } });

test('reverse cards require the selected translation and never use a legacy Russian fallback', () => {
  const words = [noun('a'), { ...noun('b'), selectedTranslation: { language: 'en', text: null }, translation: 'дерево' }, { ...noun('c'), selectedTranslation: { language: 'ar', text: ' شجرة ' } }, { ...noun('d'), selectedTranslation: { language: 'en', text: ' \n ' } }];
  assert.deepEqual(practiceWords(words, 'reverse').map(row => row.id), ['a', 'c']);
  assert.equal(hasPracticeTranslation(words[1]), false);
  assert.equal(hasPracticeTranslation(words[3]), false);
  assert.equal(words[2].selectedTranslation.text, ' شجرة ');
});

test('personal selected translations take part in reverse training even when the shared one is missing', () => {
  const personal = { ...noun('a'), translations: [], selectedTranslation: { language: 'pl', text: 'moja wskazówka', source: 'personal' } };
  assert.equal(practiceWords([personal], 'reverse')[0], personal);
});

test('article practice accepts only singular nouns with a known article, excluding plural die and verbs', () => {
  const words = [noun('m', 'der'), noun('f', 'die'), noun('n', 'das'), { ...noun('plural', 'die'), grammaticalNumber: 'plural' }, { ...noun('verb', 'none'), grammaticalNumber: 'not_applicable' }, { ...noun('unknown', 'none') }];
  assert.deepEqual(practiceWords(words, 'article').map(row => row.id), ['m', 'f', 'n']);
  for (const row of words.slice(3)) assert.equal(hasPracticeArticle(row), false);
});

test('all three article options are assessed against the card and invalid article cards cannot be correct', () => {
  for (const article of ['der', 'die', 'das']) {
    for (const choice of ['der', 'die', 'das']) assert.equal(correctPracticeArticle(noun('n', article), choice), article === choice);
  }
  assert.equal(correctPracticeArticle({ ...noun('plural', 'die'), grammaticalNumber: 'plural' }, 'die'), false);
});

test('mode eligibility intersects the filtered new/review queues without losing personal content or order', () => {
  const filtered = [noun('c'), { ...noun('b'), selectedTranslation: { language: 'en', text: null } }, noun('a')];
  const eligible = [noun('a'), noun('c'), noun('foreign')];
  assert.deepEqual(eligibleTrainingWords(practiceWords(filtered, 'reverse'), eligible).map(row => row.id), ['c', 'a']);
  assert.deepEqual(practiceWords([], 'article'), []);
  assert.deepEqual(practiceWords(filtered, 'forward'), filtered);
});

test('archive exclusions continue to apply in every practice mode', () => {
  const word = noun('archived');
  const words = [noun('active'), { ...word, dictionaryEntry: { isArchived: true, isFavorite: true, revision: 'r' } }];
  for (const mode of ['forward', 'reverse', 'article']) assert.deepEqual(practiceWords(activeTrainingWords(words), mode).map(row => row.id), ['active']);
});

test('legacy article prefixes do not reveal the article in the question or produce a duplicate in the answer', () => {
  assert.equal(barePracticeGerman({ ...noun('n'), german: ' der Baum ' }), 'Baum');
  assert.equal(fullPracticeGerman({ ...noun('n'), german: 'der Baum' }), 'der Baum');
  assert.equal(fullPracticeGerman({ ...noun('n', 'die'), german: 'die Bäume', grammaticalNumber: 'plural' }), 'die Bäume');
  assert.equal(fullPracticeGerman({ ...noun('n', 'das'), german: 'Haus' }), 'das Haus');
  assert.equal(fullPracticeGerman({ ...noun('n', 'none'), german: 'das ist gut', grammaticalNumber: 'not_applicable' }), 'das ist gut');
});
