import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCSV} from '../src/csv.js';
import {parseExercises,loadExercises,TYPES} from '../src/exercise-data.js';
import {availableExercises,selectExercises,correctAnswer,validateHistory} from '../src/exercises.js';

const text=fs.readFileSync('data/exercises.csv','utf8');
const grammar=parseCSV(fs.readFileSync('data/grammar.csv','utf8'));
const bank=parseExercises(text,grammar);
const pool=availableExercises({grammar,exercises:bank});
assert.equal(new Set(bank.map(e=>e.id)).size,bank.length);
assert.ok(bank.length>0);
for(const type of Object.keys(TYPES)) {
  assert.ok(pool.some(e=>e.type===type&&e.difficulty==='base'));
  assert.ok(pool.some(e=>e.type===type&&e.difficulty==='practice'));
}
for(const e of pool) {
  assert.ok(['N5','N4'].includes(e.level));
  assert.ok(Number.isFinite(e.lesson));
  assert.ok(correctAnswer(e,e.answer));
  assert.ok(e.grammar.example_reading);
  if(e.type!=='order')for(const option of e.options)assert.ok(!correctAnswer(e,option));
}
const first=selectExercises(pool,{});
assert.equal(first.length,10);
const history=Object.fromEntries(first.map(e=>[e.id,{attempts:1,correct:1,lastCorrect:true}]));
assert.ok(selectExercises(pool,history).every(e=>!history[e.id]));
history[first[0].id]={attempts:1,correct:0,lastCorrect:false};
assert.deepEqual(selectExercises(pool,history,'mistakes').map(e=>e.id),[first[0].id]);
assert.ok(selectExercises(pool,history,'practice').every(e=>e.difficulty==='practice'));
for(const type of Object.keys(TYPES))assert.ok(selectExercises(pool,history,type).every(e=>e.type===type));
assert.deepEqual(validateHistory(history),history);
assert.deepEqual(validateHistory({future_id:{attempts:2,correct:1,lastCorrect:false}}),{future_id:{attempts:2,correct:1,lastCorrect:false}});
assert.throws(()=>validateHistory({p01:{attempts:-1,correct:0,lastCorrect:true}}));
assert.throws(()=>validateHistory(JSON.parse('{"__proto__":{"attempts":1,"correct":1,"lastCorrect":true}}')));
assert.deepEqual(parseCSV('\uFEFFid,prompt\r\nx,"A, B\nC ""D"""\r\n'),[{id:'x',prompt:'A, B\nC "D"'}]);
assert.throws(()=>parseCSV('id,text\nx,"unterminated'));
assert.throws(()=>parseCSV('id,text\nx,a,b'));
assert.throws(()=>parseCSV('id,id\nx,y'));

const rows=parseCSV(text);
const csv = records => {
  const keys=Object.keys(records[0]);
  return [keys,...records.map(r=>keys.map(k=>r[k]))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
};
const base=rows.find(r=>r.id==='p01');
for(const mutation of [{grammar_id:'unknown'},{answer:'で'},{type:'unknown'},{difficulty:'hard'},{ready:'tru'},{instruction:''},{options:'に|で'}]) {
  assert.throws(()=>parseExercises(csv([{...base,...mutation}]),grammar));
}
assert.throws(()=>parseExercises(csv([base,base]),grammar));
assert.throws(()=>parseExercises(csv([{...base,id:'constructor'}]),grammar));
assert.throws(()=>parseExercises(csv([{...base,type:'order',answer:'acbd',options:'ab|cd'}]),grammar));
assert.throws(()=>validateHistory({constructor:{attempts:1,correct:1,lastCorrect:true}}));
assert.throws(()=>parseExercises(text.replace('"grammar_id"','"source"'),grammar));
assert.deepEqual(parseExercises(csv([{...base,ready:'false',prompt:''}]),grammar),[]);
const extra={...base,id:'new_question'};
assert.equal(parseExercises(csv([base,extra]),grammar).length,2,'a new CSV row loads without a code change');
const inactive=grammar.map(g=>g.id===base.grammar_id?{...g,ready:'false'}:g);
assert.equal(availableExercises({grammar:inactive,exercises:parseExercises(csv([base]),grammar)}).length,0);
await assert.rejects(loadExercises(grammar,async()=>({ok:false,status:404})),/404/);
await assert.rejects(loadExercises(grammar,async()=>({ok:true,text:async()=>'<html>missing</html>'})),/exercises.csv/);
assert.equal((await loadExercises(grammar,async()=>({ok:true,text:async()=>text}))).length,bank.length);
console.log(`${bank.length} exercices CSV : données, références, chargement, sélection et compatibilité des historiques validés.`);
