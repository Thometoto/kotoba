export const directionsFor = deck => deck === 'kanji' ? ['jp_to_fr','writing'] : ['jp_to_fr','fr_to_jp'];
export const cardId = (deck, card) => deck === 'kanji' ? card.character : card.id;
export const stateId = (deck, card, direction) => `${deck}:${cardId(deck,card)}:${direction}`;
export const ready = card => /^(true|1|oui|yes)$/i.test(card.ready || '');

// Keep the teaching order for new cards; due learned cards come first.
// One physical card appears only once, never immediately in the inverse direction.
export function selectSession(deck,cards,states,size,now=Date.now(),start=0) {
  const byId=new Map(states.map(s=>[s.id,s]));
  const dirs=directionsFor(deck);
  const candidates=cards.filter(ready).map((card,index)=>{
    const options=dirs.map(direction=>({direction,saved:byId.get(stateId(deck,card,direction))}))
      .filter(o=>!o.saved || Date.parse(o.saved.card.due)<=now);
    const overdue=options.filter(o=>o.saved).map(o=>Date.parse(o.saved.card.due));
    return {card,index,options,due:overdue.length?Math.min(...overdue):Infinity};
  }).filter(c=>c.options.length).sort((a,b)=>a.due-b.due||a.index-b.index);
  return candidates.slice(0,size).map((entry,i)=>{
    const desired=dirs[(start+i)%dirs.length];
    const option=entry.options.find(o=>o.direction===desired)||entry.options[0];
    return {card:entry.card,direction:option.direction,stateId:stateId(deck,entry.card,option.direction)};
  });
}

// Do not inherit recognition/oral-recall scores as handwriting mastery.
export function migrateAliases(states,aliases) {
  const result=new Map(states.map(s=>[s.id,s]));
  for(const s of states){
    const [deck,id,direction]=s.id.split(':');
    if(deck!=='vocabulary'||!Object.hasOwn(aliases,id))continue;
    const target=`vocabulary:${aliases[id]}:${direction}`;
    const current=result.get(target);
    // Conservative: retain the soonest due complete FSRS state, never average parameters.
    if(!current||Date.parse(s.card.due)<Date.parse(current.card.due))result.set(target,{...s,id:target});
  }
  return [...result.values()];
}

export function validateBackup(value) {
  if(!value || ![1,2].includes(value.version)||!Array.isArray(value.states)||!Array.isArray(value.reviews))throw Error('Sauvegarde incompatible.');
  const date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
  for(const s of value.states){
    if(!s||typeof s.id!=='string'||!s.id||!s.card||!date(s.card.due))throw Error('État de carte invalide.');
    for(const field of ['stability','difficulty','reps','lapses','state','scheduled_days','elapsed_days','learning_steps']){
      if(s.card[field]!==undefined&&(!Number.isFinite(s.card[field])||s.card[field]<0))throw Error('État FSRS invalide.');
    }
    if(s.card.last_review&&!date(s.card.last_review))throw Error('Date de révision invalide.');
  }
  if(new Set(value.states.map(s=>s.id)).size!==value.states.length)throw Error('États dupliqués dans la sauvegarde.');
  for(const r of value.reviews)if(typeof r.stateId!=='string'||!date(r.reviewedAt)||![1,2,3,4].includes(r.rating))throw Error('Historique de révision invalide.');
  return value;
}
