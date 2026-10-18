import {createEmptyCard,Rating} from 'ts-fsrs';
import {parseCSV} from './csv.js';
import {scheduler} from './scheduler.js';
import {loadExercises} from './exercise-data.js';
import {openExercises,readHistory,validateHistory,HISTORY_KEY} from './exercises.js';
import {selectSession,ready,validateBackup} from './learning.js';
import {allStates,allReviews,getState,getSnapshot,getMeta,putMeta,saveReview,migrateProgress,importProgress} from './storage.js';
import {mountDrawing} from './drawing.js';

const DECKS={
 kanji:{file:'data/kanji.csv',id:'character',label:'kanji',title:'Kanji',glyph:'字',size:20},
 vocabulary:{file:'data/vocabulary.csv',id:'id',label:'mot',title:'Vocabulaire',glyph:'語',size:20},
 grammar:{file:'data/grammar.csv',id:'id',label:'point de grammaire',title:'Grammaire',glyph:'文',size:5},
};
const RATINGS=[[Rating.Again,'again','Oublié'],[Rating.Hard,'hard','Difficile'],[Rating.Good,'good','Correct'],[Rating.Easy,'easy','Facile']];
const app=document.querySelector('#app');const cards={};let migration;let session=null;let drawing=null;let view=0;
const esc=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function beginView(){view++;drawing?.destroy();drawing=null;return view;}
function displayError(error){const el=document.querySelector('#status');if(el){el.textContent=error.message||String(error);el.hidden=false;}else alert(error.message||String(error));}
function restoreCard(saved,now){return saved?{...saved.card,due:new Date(saved.card.due),last_review:saved.card.last_review?new Date(saved.card.last_review):undefined}:createEmptyCard(now);}
const serializeCard=card=>({...card,due:card.due.toISOString(),last_review:card.last_review?.toISOString()||null});
function interval(due,now){const seconds=Math.max(0,(due-now)/1000);return seconds<3600?`${Math.round(seconds/60)} min`:seconds<86400?`${Math.round(seconds/3600)} h`:`${Math.round(seconds/86400)} j`;}
function download(payload,name){const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}

async function renderHome(){
 const token=beginView();session=null;
 const [states,snapshot,ack]=await Promise.all([allStates(),getSnapshot(),getMeta('snapshot-exported')]);if(token!==view)return;
 const counts=Object.fromEntries(Object.keys(DECKS).map(deck=>[deck,selectSession(deck,cards[deck],states,Infinity).length]));
 app.innerHTML=`<section class="home"><div class="brand"><h1>Kotoba</h1><span class="badge">N5 · N4</span></div>
 ${snapshot&&!ack?.value?'<aside class="migration-notice">Ta progression avant la refonte est conservée sur cet appareil. <button id="snapshot-download">Télécharger cette sauvegarde</button></aside>':''}
 <nav class="choices">${Object.entries(DECKS).map(([key,d])=>`<button class="choice" data-deck="${key}"><span class="choice-glyph">${d.glyph}</span><strong>${d.title}</strong><small>${counts[key]} fiches à réviser</small></button>`).join('')}
 <button class="choice" id="exercises"><span class="choice-glyph">練</span><strong>Exercices</strong><small>Mettre en pratique</small></button></nav>
 <div class="home-actions"><button class="link-button" id="catalog">Catalogue</button><button class="link-button" id="backup">Sauvegarde</button></div><p id="status" role="alert" hidden></p></section>`;
 app.querySelectorAll('[data-deck]').forEach(b=>b.onclick=()=>startSession(b.dataset.deck).catch(displayError));
 app.querySelector('#catalog').onclick=()=>renderCatalog();app.querySelector('#backup').onclick=()=>renderBackup().catch(displayError);
 app.querySelector('#exercises').onclick=()=>{beginView();openExercises(app,cards,renderHome);};
 const button=app.querySelector('#snapshot-download');if(button)button.onclick=async()=>{download(snapshot,'kotoba-avant-refonte.json');await putMeta('snapshot-exported',true);renderHome();};
}
async function startSession(deck){
 const token=beginView();const [states,offset]=await Promise.all([allStates(),getMeta(`mixed-start:${deck}`)]);if(token!==view)return;
 const start=Number(offset?.value||0)%2;const queue=selectSession(deck,cards[deck],states,DECKS[deck].size,Date.now(),start);
 await putMeta(`mixed-start:${deck}`,1-start);
 if(token!==view)return;
 session={deck,queue,position:0,revealed:false,strokes:[],saving:false};await renderReview();
}
function grammarExample(card){return {jp:card.display_example||card.example.split('／')[0].trim(),reading:card.example_reading.split('／')[0].trim(),fr:card.example_fr||card.french};}
function reading(text){return `<details class="reading-toggle"><summary>Afficher la lecture</summary><p lang="ja">${esc(text)}</p></details>`;}
function grammarAnswer(card){const e=grammarExample(card);return `<section class="answer grammar-answer"><h2 lang="ja">${esc(card.display_structure||card.structure)}</h2><p>${esc(card.french)}</p><h3>Construction</h3><p class="construction">${esc(card.construction)}</p><details><summary>Comprendre les formes</summary><p>Forme dictionnaire : 食べる, 行く, 読む… (pas seulement les verbes en る).<br>Sans ます : 食べます → 食べ ; 読みます → 読み.<br>Forme neutre : sans です・ます, au temps demandé. Les modèles précisent les cas particuliers des noms et adjectifs.</p></details><h3>Exemple</h3><p class="example-jp" lang="ja">${esc(e.jp)}</p>${reading(e.reading)}<p>${esc(e.fr)}</p></section>`;}
async function renderReview(){
 const token=beginView();const active=session;if(!active)return;
 const {deck,queue,position,revealed}=active;if(position>=queue.length)return renderComplete(position);
 const entry=queue[position];const {card,direction}=entry;const now=new Date();const saved=await getState(entry.stateId);if(token!==view||session!==active)return;
 const fsrsCard=restoreCard(saved,now);const preview=scheduler.repeat(fsrsCard,now);
 const writing=direction==='writing';const jp=direction==='jp_to_fr';
 let prompt,answer='',extra='';
 if(deck==='kanji'){
  prompt=jp?card.character:card.meaning;
  if(writing){extra=`<p class="writing-clue">Lectures pour identifier le kanji : ${esc(card.readings)}</p><p>Écris de mémoire, puis compare ton dessin au modèle.</p><div class="drawing-comparison"><div><small>Ton dessin</small><canvas id="kanji-canvas" aria-label="Zone de dessin du kanji"></canvas></div>${revealed?`<div class="kanji-model"><small>Modèle</small><span lang="ja">${esc(card.character)}</span></div>`:''}</div>${revealed?'':'<div class="drawing-tools"><button id="undo-stroke">Annuler le trait</button><button id="clear-drawing">Effacer</button></div>'}`;}
  if(revealed)answer=`<section class="answer"><h2>${esc(jp?card.meaning:card.character)}</h2><p class="reading" lang="ja">${esc(card.readings)}</p><div class="example">${esc(card.examples)}</div>${writing?'<p>Compare toi-même la forme. Le dessin n’est pas noté automatiquement et n’est pas sauvegardé.</p>':''}</section>`;
 }else if(deck==='vocabulary'){
  prompt=jp?card.japanese:card.french;
  if(jp&&!revealed)extra=`<small class="prompt-reading" lang="ja">${esc(card.reading)}</small>`;
  if(revealed)answer=`<section class="answer"><h2>${esc(jp?card.french:card.japanese)}</h2><p class="reading" lang="ja">${esc(card.reading)}</p>${!jp?`<p>${esc(card.french)}</p>`:''}<p>${esc(card.category)}</p>${card.examples?`<p class="example">${esc(card.examples)}</p>`:''}</section>`;
 }else{
  const e=grammarExample(card);prompt=jp?e.jp:e.fr;
  extra=jp?`<p class="target-structure">Expression à comprendre : <span lang="ja">${esc(card.display_structure||card.structure)}</span></p>${reading(e.reading)}`:`<p>Notion travaillée : ${esc(card.french)}</p><p class="mixed-note">Formule une phrase. Plusieurs traductions peuvent être correctes ; compare ensuite avec l’exemple.</p>`;
  if(revealed)answer=grammarAnswer(card);
 }
 const mode=writing?'Français → Japonais · Écriture':jp?'Japonais → Français':'Français → Japonais';
 app.innerHTML=`<header class="topbar"><button id="home">Kotoba</button><span>${position+1} / ${queue.length}</span></header><main class="review-page" data-card-id="${esc(deck==='kanji'?card.character:card.id)}" data-direction="${direction}">
 <div class="progress"><i style="width:${Math.round(position/queue.length*100)}%"></i></div><article class="flashcard"><p class="review-mode">${mode}</p><p>${revealed?'Compare ta réponse':writing?'Dessine ce kanji':jp?'Quel est le sens en français ?':'Comment le dire en japonais ?'}</p>
 <div class="prompt ${deck==='grammar'?'grammar':writing||deck==='vocabulary'||!jp?'words':''}" ${jp?'lang="ja"':''}>${esc(prompt)}</div>${extra}${answer}
 ${revealed?'':`<button class="primary" id="reveal">${writing?'Comparer au modèle':'Afficher la réponse'}</button>`}</article>
 ${revealed?`<section class="ratings"><p>${writing?'Comment était ton écriture de mémoire ?':'Comment était ton rappel ?'}</p><div class="rating-grid">${RATINGS.map(([grade,key,label])=>`<button class="rating ${key}" data-rating="${grade}"><strong>${label}</strong><small>${interval(preview[grade].card.due,now)}</small></button>`).join('')}</div></section>`:''}<p id="status" role="alert" hidden></p></main>`;
 app.querySelector('#home').onclick=()=>renderHome().catch(displayError);
 if(writing){drawing=mountDrawing(app.querySelector('#kanji-canvas'),active.strokes,{readonly:revealed});if(!revealed){app.querySelector('#undo-stroke').onclick=()=>drawing.undo();app.querySelector('#clear-drawing').onclick=()=>drawing.clear();}}
 if(!revealed)app.querySelector('#reveal').onclick=()=>{active.revealed=true;renderReview().catch(displayError);};
 else app.querySelectorAll('[data-rating]').forEach(button=>button.onclick=()=>rateCard(Number(button.dataset.rating),fsrsCard,active,entry));
}
async function rateCard(rating,card,active,entry){
 if(active!==session||active.saving)return;active.saving=true;app.querySelectorAll('[data-rating]').forEach(b=>b.disabled=true);
 try{const now=new Date();const result=scheduler.next(card,now,rating);
  await saveReview({id:entry.stateId,card:serializeCard(result.card),updatedAt:now.toISOString()},{stateId:entry.stateId,rating,reviewedAt:now.toISOString(),due:result.card.due.toISOString()});
  if(session!==active)return;active.position++;active.revealed=false;active.strokes=[];active.saving=false;await renderReview();
 }catch(error){active.saving=false;displayError(error);app.querySelectorAll('[data-rating]').forEach(b=>b.disabled=false);}
}
function renderComplete(count){beginView();app.innerHTML=`<section class="complete"><h1>${count?'Session terminée':'Tout est à jour'}</h1><p>${count?`${count} fiches révisées.`:'Aucune fiche à réviser pour le moment.'}</p><button class="primary" id="home">Retour à l’accueil</button></section>`;app.querySelector('#home').onclick=renderHome;}

const CATALOG_FIELDS={kanji:['character','meaning','readings','examples'],vocabulary:['japanese','reading','french','category','examples'],grammar:['structure','reading','french','construction','example','example_reading','example_fr','display_example']};
function summary(deck,c){return deck==='kanji'?{title:c.character,subtitle:c.meaning,note:c.readings}:deck==='vocabulary'?{title:c.japanese,subtitle:c.french,note:c.reading}:{title:c.display_structure||c.structure,subtitle:c.french,note:c.reading};}
function renderCatalog(selectedDeck='kanji',query=''){
 beginView();app.innerHTML=`<header class="topbar"><button id="home">← Accueil</button><span>Recherche</span></header><main class="catalog"><h1>Catalogue</h1><nav class="catalog-tabs" aria-label="Catégorie">${Object.entries(DECKS).map(([key,d])=>`<button data-catalog-deck="${key}" class="${key===selectedDeck?'active':''}">${d.title}</button>`).join('')}</nav><input class="search" id="search" type="search" value="${esc(query)}" placeholder="Rechercher dans ${DECKS[selectedDeck].title.toLowerCase()}" autocomplete="off"><p class="catalog-status" aria-live="polite"></p><section class="catalog-list"></section></main>`;
 const input=app.querySelector('#search'),list=app.querySelector('.catalog-list'),status=app.querySelector('.catalog-status');
 function draw(value){const q=value.trim().toLocaleLowerCase('fr');if(!q){list.innerHTML='';status.textContent='Saisissez un mot pour rechercher une fiche.';return;}
  const results=cards[selectedDeck].filter(c=>CATALOG_FIELDS[selectedDeck].some(f=>(c[f]||'').toLocaleLowerCase('fr').includes(q)));status.textContent=results.length?`${results.length} résultat${results.length>1?'s':''}`:'Aucun résultat';
  list.innerHTML=results.map(c=>{const s=summary(selectedDeck,c);return `<button class="catalog-row" data-card-id="${esc(c[DECKS[selectedDeck].id])}"><strong>${esc(s.title)}</strong><span>${esc(s.subtitle)}</span><small>${esc(s.note)}</small></button>`;}).join('');
  list.querySelectorAll('[data-card-id]').forEach(b=>b.onclick=()=>renderCatalogCard(selectedDeck,cards[selectedDeck].find(c=>c[DECKS[selectedDeck].id]===b.dataset.cardId),value));
 }
 draw(query);input.oninput=e=>draw(e.target.value);app.querySelectorAll('[data-catalog-deck]').forEach(b=>b.onclick=()=>renderCatalog(b.dataset.catalogDeck,input.value));app.querySelector('#home').onclick=renderHome;
}
function renderCatalogCard(deck,c,query){beginView();const s=summary(deck,c);const fields=deck==='vocabulary'?[['Japonais',c.japanese],['Lecture',c.reading],['Français',c.french],['Exemples',c.examples]]:[['Sens',c.meaning],['Lectures',c.readings],['Exemples',c.examples]];
 app.innerHTML=`<header class="topbar"><button id="back-catalog">← Résultats</button><span>${DECKS[deck].title}</span></header><main class="catalog-card">${deck==='grammar'?grammarAnswer(c):`<div class="catalog-card-glyph">${esc(s.title)}</div>${fields.filter(([,v])=>v).map(([k,v])=>`<section><small>${k}</small><p>${esc(v)}</p></section>`).join('')}`}</main>`;app.querySelector('#back-catalog').onclick=()=>renderCatalog(deck,query);
}
async function renderBackup(){
 const token=beginView();const snapshot=await getSnapshot();if(token!==view)return;
 app.innerHTML=`<header class="topbar"><button id="home">← Accueil</button><span>Local</span></header><section class="panel"><h1>Sauvegarde</h1><p>La progression reste sur cet appareil. Exporte-la pour la conserver ailleurs ou la transférer. Les dessins ne sont pas enregistrés.</p><button class="primary" id="export">Exporter la progression</button>${snapshot?'<p><button id="export-original">Exporter la sauvegarde avant refonte</button></p>':''}<p><label class="primary" for="import">Importer une sauvegarde</label><input hidden id="import" type="file" accept="application/json"></p><p id="status" role="alert" hidden></p></section>`;
 app.querySelector('#home').onclick=renderHome;
 app.querySelector('#export').onclick=async()=>{try{download({version:2,exportedAt:new Date().toISOString(),states:await allStates(),reviews:await allReviews(),exercises:readHistory(),preMigration:snapshot||null},`kotoba-${new Date().toISOString().slice(0,10)}.json`);}catch(e){displayError(e);}};
 if(snapshot)app.querySelector('#export-original').onclick=()=>download(snapshot,'kotoba-avant-refonte.json');
 app.querySelector('#import').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const payload=JSON.parse(await file.text());payload.reviews??=[];validateBackup(payload);const history=payload.exercises===undefined?null:validateHistory(payload.exercises);
   if(!confirm('Importer cette sauvegarde et la fusionner avec la progression présente ?'))return;
   await importProgress(payload,migration.aliases);
   if(history)localStorage.setItem(HISTORY_KEY,JSON.stringify({...readHistory(),...history}));
   const status=app.querySelector('#status');status.hidden=false;status.textContent='Progression importée. Les anciens identifiants ont été conservés et reliés aux fiches fusionnées.';
  }catch(error){displayError(error);}finally{e.target.value='';}
 };
}
async function fetchText(path){const r=await fetch(path);if(!r.ok)throw Error(`Chargement de ${path} impossible (${r.status}).`);return r.text();}
async function boot(){try{
 await Promise.all(Object.entries(DECKS).map(async([key,d])=>{cards[key]=parseCSV(await fetchText(d.file));}));
 migration=JSON.parse(await fetchText('data/vocabulary-migration.json'));
 for(const [old,id] of Object.entries(migration.aliases)){if(!/^v\d+$/.test(old)||!cards.vocabulary.some(v=>v.id===id))throw Error('Référence de migration invalide.');}
 await migrateProgress(migration,readHistory());
 try{cards.exercises=await loadExercises(cards.grammar);}catch(error){cards.exercises=[];cards.exerciseError=error.message;}
 if('serviceWorker' in navigator)navigator.serviceWorker.register('service-worker.js').catch(console.error);
 window.addEventListener('offline',()=>{if(document.querySelector('.offline'))return;const badge=document.createElement('span');badge.className='offline';badge.textContent='Hors connexion';document.body.append(badge);});
 window.addEventListener('online',()=>document.querySelector('.offline')?.remove());await renderHome();
 }catch(error){console.error(error);app.innerHTML=`<section class="panel"><h1>Chargement impossible</h1><p>${esc(error.message)}</p><p>Ouvre Kotoba avec Internet pour recevoir tous les fichiers de la mise à jour. N’efface pas les données du site.</p><button id="retry">Réessayer</button></section>`;app.querySelector('#retry').onclick=()=>location.reload();}}
boot();
