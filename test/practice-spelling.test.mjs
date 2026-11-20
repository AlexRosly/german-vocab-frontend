import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctPracticeSpelling, practiceWords } from '../src/lib/practice-modes.ts';
import { activeTrainingWords } from '../src/lib/dictionary-entry-client.ts';
import { eligibleTrainingWords } from '../src/lib/dictionary-training.ts';

const card = (id='house',patch={}) => ({id,german:'Haus',article:'das',grammaticalNumber:'singular',selectedTranslation:{language:'en',text:'house'},...patch});

test('spelling requires only the selected nonblank translation, allowing personal translations and phrases', () => {
 const words=[card(),card('missing',{selectedTranslation:{language:'en',text:null},translation:'дом'}),card('blank',{selectedTranslation:{language:'en',text:' \n '}}),card('personal',{selectedTranslation:{language:'pl',text:'dom',source:'personal'}}),card('phrase',{german:'Guten Tag',article:'none',grammaticalNumber:'not_applicable',selectedTranslation:{language:'en',text:'good afternoon'}})];
 assert.deepEqual(practiceWords(words,'spelling').map(w=>w.id),['house','personal','phrase']);
 assert.equal(correctPracticeSpelling(words[1],'Haus'),false);
 assert.equal(correctPracticeSpelling(words[2],'Haus'),false);
 assert.equal(correctPracticeSpelling(words[3],'Haus'),true);
});

test('nouns allow the correct optional article, preserving spelling and rejecting wrong articles', () => {
 for(const answer of ['Haus','das Haus','Das Haus','DAS Haus'])assert.equal(correctPracticeSpelling(card(),answer),true,answer);
 for(const answer of ['haus','das haus','HAUS','der Haus','die Haus','ein Haus','das das Haus','houses',''])assert.equal(correctPracticeSpelling(card(),answer),false,answer);
});

test('capitalization, umlauts and sharp s matter; Unicode and whitespace differences do not', () => {
 const word=card('tree',{german:'Baum',article:'der'});
 assert.equal(correctPracticeSpelling(word,' baum '),false);
 const plural=card('trees',{german:'Bäume',article:'die',grammaticalNumber:'plural'});
 for(const answer of ['Bäume','die Ba\u0308ume',' DIE\u00a0 Bäume '])assert.equal(correctPracticeSpelling(plural,answer),true);
 for(const answer of ['Baume','Baeume','bäume'])assert.equal(correctPracticeSpelling(plural,answer),false);
 const street=card('street',{german:'Straße',article:'die'});
 assert.equal(correctPracticeSpelling(street,'Straße'),true);
 assert.equal(correctPracticeSpelling(street,'Strasse'),false);
 assert.equal(correctPracticeSpelling(street,'Straẞe'),false);
});

test('legacy noun prefixes and plural metadata do not duplicate articles or accept singular articles for plurals', () => {
 const singular=card('legacy',{german:'das Haus'});
 assert.equal(correctPracticeSpelling(singular,'Haus'),true);
 assert.equal(correctPracticeSpelling(singular,'das Haus'),true);
 assert.equal(correctPracticeSpelling(singular,'das das Haus'),false);
 const plural=card('legacy-plural',{german:'die Häuser',article:'die',grammaticalNumber:'plural'});
 assert.equal(correctPracticeSpelling(plural,'Häuser'),true);
 assert.equal(correctPracticeSpelling(plural,'Die Häuser'),true);
 assert.equal(correctPracticeSpelling(plural,'das Häuser'),false);
});

test('verbs and expressions retain their complete German text without article stripping or invented synonyms', () => {
 const expression=card('phrase',{german:'das ist gut',article:'none',grammaticalNumber:'not_applicable'});
 assert.equal(correctPracticeSpelling(expression,' das   ist gut '),true);
 assert.equal(correctPracticeSpelling(expression,'ist gut'),false);
 assert.equal(correctPracticeSpelling(expression,'Das ist gut'),false);
 const verb=card('verb',{german:'sich verabreden',article:'none',grammaticalNumber:'not_applicable'});
 assert.equal(correctPracticeSpelling(verb,'sich verabreden'),true);
 assert.equal(correctPracticeSpelling(verb,'verabreden'),false);
 assert.equal(correctPracticeSpelling(card('compound',{german:'E-Mail',article:'die'}),'E-Mail'),true);
 assert.equal(correctPracticeSpelling(card(),'Gebäude'),false);
});

test('spelling intersects archive exclusions and filtered new/review queues without losing personal content or order', () => {
 const words=[card('b'),card('archived',{dictionaryEntry:{isArchived:true,isFavorite:false,revision:'r'}}),card('empty',{selectedTranslation:{language:'en',text:null}}),card('a')];
 const before=structuredClone(words);
 const filtered=practiceWords(activeTrainingWords(words),'spelling');
 assert.deepEqual(filtered.map(w=>w.id),['b','a']);
 assert.deepEqual(eligibleTrainingWords(filtered,[card('a'),card('foreign')]).map(w=>w.id),['a']);
 assert.deepEqual(practiceWords([],'spelling'),[]);
 assert.deepEqual(words,before);
});
