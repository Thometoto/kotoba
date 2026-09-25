import { BANK, TYPES } from './exercise-bank.js';
export const HISTORY_KEY = 'kotoba-exercises-v1';
const normalize = value => value.normalize('NFKC').replace(/\s/g, '');
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readHistory() {
  try { return validateHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}')); } catch { return {}; }
}
export function validateHistory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Historique des exercices invalide');
  const result = {};
  for (const exercise of BANK) {
    const entry = value[exercise.id];
    if (entry === undefined) continue;
    if (!Number.isSafeInteger(entry?.attempts) || entry.attempts < 1 || !Number.isSafeInteger(entry.correct) || entry.correct < 0 || entry.correct > entry.attempts || typeof entry.lastCorrect !== 'boolean') throw new Error('Historique des exercices invalide');
    result[exercise.id] = {attempts: entry.attempts, correct: entry.correct, lastCorrect: entry.lastCorrect};
  }
  return result;
}
export function availableExercises(cards) {
  return BANK.flatMap(e => {
    const grammar = cards.grammar.find(g => g.id === e.grammarId && /^(true|1|oui|yes)$/i.test(g.ready));
    return grammar ? [{...e, lesson: Number(grammar.lesson), level: grammar.level, grammar}] : [];
  }).sort((a,b) => a.lesson - b.lesson || a.id.localeCompare(b.id));
}
export function selectExercises(pool, history, mode = 'mixed') {
  const filtered = pool.filter(e => mode === 'mixed' || mode === 'mistakes' && history[e.id]?.lastCorrect === false || mode === e.type);
  // Unseen questions advance through the lessons; errors then return before mastered items.
  const rank = e => !history[e.id] ? 0 : history[e.id].lastCorrect ? 2 : 1;
  return filtered.sort((a,b) => rank(a)-rank(b) || (rank(a) === 2 ? history[a.id].attempts-history[b.id].attempts : 0) || a.lesson-b.lesson || a.id.localeCompare(b.id)).slice(0,10);
}
export function correctAnswer(exercise, answer) { return normalize(answer) === normalize(exercise.answer); }
function shuffled(items) {
  const result = [...items];
  for (let i=result.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
export function openExercises(app, cards, home) {
  const pool = availableExercises(cards);
  let history = readHistory(); let run; let index; let answers; let tiles; let selected; let submitted; let storageWarning = '';
  const header = (label, back) => { app.innerHTML = `<header class="topbar"><button id="exercise-back">← ${back}</button><span>${escape(label)}</span></header>`; };
  function menu() {
    header('Entraînement', 'Accueil');
    const attempted = Object.values(history).reduce((n,h)=>n+h.attempts,0);
    const correct = Object.values(history).reduce((n,h)=>n+h.correct,0);
    app.innerHTML += `<main class="exercise-page"><h1>Exercices</h1><p>Des séances de 10 questions maximum, dans l’ordre des leçons. Choisis une réponse ou assemble la phrase.</p><p>${pool.length} exercices · ${attempted ? `${Math.round(correct/attempted*100)} % de réussite sur ${attempted} réponses` : 'À toi de commencer'}</p><div class="exercise-menu">${[['mixed','Session mixte'],['mistakes','Reprendre mes erreurs'],...Object.entries(TYPES)].map(([key,label])=>{const count=pool.filter(e=>key==='mixed'||key==='mistakes'&&history[e.id]?.lastCorrect===false||e.type===key).length; return `<button data-mode="${key}" ${count?'':'disabled'}><strong>${label}</strong><small>${count} exercices</small></button>`;}).join('')}</div></main>`;
    app.querySelector('#exercise-back').onclick=home;
    app.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{run=selectExercises(pool,history,b.dataset.mode);index=0;answers=[];begin();});
  }
  function begin() { submitted=false; selected=[]; const e=run[index]; tiles=shuffled(e.type==='order'?e.options:[e.answer,...e.options]); draw(); }
  function related(e) {
    const text=normalize(e.prompt+e.answer+e.translation);
    const words=cards.vocabulary.filter(v=>normalize(v.reading||'').length>=2 && text.includes(normalize(v.reading))).slice(0,6);
    const characters = new Set(words.flatMap(v=>[...v.japanese]));
    const kanji=cards.kanji.filter(k=>characters.has(k.character)).slice(0,8);
    return `<details><summary>Revoir la notion et les mots</summary><p>${escape(e.grammar.reading)} — ${escape(e.grammar.french)}</p>${words.map(v=>`<p>${escape(v.japanese)} (${escape(v.reading)}) — ${escape(v.french)}</p>`).join('')}${kanji.length?`<p>${kanji.map(k=>`${escape(k.character)} : ${escape(k.meaning)}`).join(' · ')}</p>`:''}</details>`;
  }
  function draw() {
    const e=run[index]; header(`${index+1} / ${run.length}`, 'Exercices');
    const answer=selected.map(i=>tiles[i]).join('');
    app.innerHTML += `<main class="exercise-page"><p class="exercise-meta">${TYPES[e.type]} · ${escape(e.level)} · Leçon ${e.lesson}</p><h1>${escape(e.instruction)}</h1><article class="exercise-question" lang="ja">${escape(e.prompt)}</article>${e.type==='order'?`<p>Touche les morceaux dans l’ordre demandé. Touche un morceau assemblé pour le retirer.</p><div class="exercise-assembled" aria-label="Phrase assemblée">${selected.map((n,i)=>`<button data-remove="${i}" ${submitted?'disabled':''}>${escape(tiles[n])}</button>`).join('') || '<span>Ta phrase apparaîtra ici.</span>'}</div>`:''}<div class="exercise-options">${tiles.map((v,i)=>`<button data-option="${i}" ${submitted||selected.includes(i)?'disabled':''} lang="ja">${escape(v)}</button>`).join('')}</div>${e.type==='order'&&!submitted?`<button class="primary" id="exercise-check" ${selected.length===tiles.length?'':'disabled'}>Vérifier</button>`:''}<section id="exercise-feedback" aria-live="polite">${submitted?`<h2>${answers[index].correct?'Bonne réponse':'À revoir'}</h2><p lang="ja">${escape(e.answer)}</p><p>${escape(e.translation)}</p><p>${escape(e.explanation)}</p>${related(e)}<p role="status">${escape(storageWarning)}</p><button class="primary" id="exercise-next">${index+1===run.length?'Voir le bilan':'Continuer'}</button>`:''}</section></main>`;
    app.querySelector('#exercise-back').onclick=()=>{if(submitted||confirm('Quitter la séance ? Les réponses déjà validées sont conservées.')) menu();};
    app.querySelectorAll('[data-option]').forEach(b=>b.onclick=()=>{if(submitted)return; const i=Number(b.dataset.option); if(e.type==='order'){selected.push(i);draw();}else submit(tiles[i]);});
    app.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{selected.splice(Number(b.dataset.remove),1);draw();});
    const check=app.querySelector('#exercise-check'); if(check)check.onclick=()=>submit(answer);
    const next=app.querySelector('#exercise-next'); if(next)next.onclick=()=>{index++;if(index===run.length)finish();else begin();};
  }
  function submit(answer) {
    if(submitted)return; submitted=true; const e=run[index]; const correct=correctAnswer(e,answer); answers.push({e,correct,answer});
    const old=history[e.id]||{attempts:0,correct:0}; history[e.id]={attempts:old.attempts+1,correct:old.correct+Number(correct),lastCorrect:correct};
    try {localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{storageWarning='Le stockage est indisponible : ce résultat reste valable pour cette séance seulement.';}
    draw(); app.querySelector('#exercise-feedback').scrollIntoView({block:'nearest'});
  }
  function finish() {
    header('Bilan','Exercices'); const errors=answers.filter(a=>!a.correct);
    app.innerHTML+=`<main class="exercise-page"><h1>${answers.length-errors.length} / ${answers.length}</h1><p>${errors.length?'Retrouve ces questions dans « Reprendre mes erreurs ».':'Toutes les réponses sont correctes.'}</p>${errors.map(a=>`<article class="exercise-question"><p>${escape(a.e.instruction)}</p><p lang="ja">${escape(a.e.prompt)}</p><p>Ta réponse : ${escape(a.answer)}</p><p>Réponse : ${escape(a.e.answer)}</p><p>${escape(a.e.explanation)}</p></article>`).join('')}<button class="primary" id="exercise-menu">Choisir une séance</button></main>`;
    app.querySelector('#exercise-back').onclick=menu;app.querySelector('#exercise-menu').onclick=menu;
  }
  menu();
}
