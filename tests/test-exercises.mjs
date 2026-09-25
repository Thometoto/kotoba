import assert from 'node:assert/strict';
import { BANK, TYPES } from '../src/exercise-bank.js';
import { selectExercises, correctAnswer, validateHistory } from '../src/exercises.js';
assert.equal(new Set(BANK.map(e=>e.id)).size,BANK.length);
for(const type of Object.keys(TYPES))assert.equal(BANK.filter(e=>e.type===type).length,4);
for(const e of BANK){
  assert.ok(e.instruction && e.explanation && e.translation);
  assert.equal(new Set(e.options).size,e.options.length);
  assert.ok(correctAnswer(e,e.answer));
  if(e.type!=='order')for(const o of e.options)assert.ok(!correctAnswer(e,o));
  else assert.deepEqual([...e.options.join('')].sort(),[...e.answer].sort());
}
const pool=BANK.map((e,i)=>({...e,lesson:i+1}));
const first=selectExercises(pool,{});assert.equal(first.length,10);
const h=Object.fromEntries(first.map(e=>[e.id,{attempts:1,correct:1,lastCorrect:true}]));
assert.ok(selectExercises(pool,h).every(e=>!h[e.id]));
h[first[0].id]={attempts:1,correct:0,lastCorrect:false};
assert.deepEqual(selectExercises(pool,h,'mistakes').map(e=>e.id),[first[0].id]);
assert.ok(selectExercises(pool,h,'order').every(e=>e.type==='order'));
assert.deepEqual(validateHistory(h),h);
assert.throws(()=>validateHistory({p01:{attempts:-1,correct:0,lastCorrect:true}}));
console.log('36 exercices, sélection, réponses et historique validés.');
