import { parseCSV } from './csv.js';

export const TYPES = {
  particle: 'Particules', vocabulary: 'Vocabulaire en contexte', conjugation: 'Conjugaison',
  order: 'Remettre en ordre', grammar: 'Structures grammaticales', dialogue: 'Dialogues',
  reading: 'Compréhension écrite', correction: 'Corriger une erreur', transform: 'Transformer une phrase',
};
export const normalizeAnswer = value => value.normalize('NFKC').replace(/\s/g, '');
export const isReady = value => /^(true|1|oui|yes)$/i.test((value || '').trim());

export function parseExercises(text, grammar) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('exercises.csv ne contient aucun exercice.');
  const fields = ['id','type','grammar_id','difficulty','instruction','prompt','answer','options','translation','explanation','ready'];
  for (const key of fields) if (!(key in rows[0])) throw new Error(`exercises.csv : colonne manquante « ${key} ».`);
  const ids = new Set();
  const grammarIds = new Set(grammar.map(g => g.id));
  return rows.flatMap(row => {
    const id = row.id.trim();
    const fail = message => { throw new Error(`exercises.csv (${id || 'sans identifiant'}) : ${message}`); };
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) || id in Object.prototype || ids.has(id)) fail('identifiant invalide ou dupliqué.');
    ids.add(id);
    if (!/^(true|false|1|0|oui|non|yes|no)$/i.test(row.ready.trim())) fail('ready doit être true ou false.');
    if (!isReady(row.ready)) return [];
    for (const key of fields) if (!row[key].trim()) fail(`champ vide : ${key}.`);
    if (!Object.hasOwn(TYPES,row.type)) fail('type inconnu.');
    if (!['base','practice'].includes(row.difficulty)) fail('difficulty doit être base ou practice.');
    if (!grammarIds.has(row.grammar_id)) fail('grammar_id absent de grammar.csv.');
    const options = row.options.split('|').map(s => s.trim());
    if (options.length < 2 || options.some(s => !s)) fail('au moins deux options non vides sont nécessaires.');
    const answer = row.answer.trim();
    if (row.type !== 'order') {
      const all = [answer,...options].map(normalizeAnswer);
      if (new Set(all).size !== all.length) fail('réponse et choix doivent être distincts.');
    } else {
      if (options.length > 12) fail('au maximum douze morceaux sont autorisés.');
      const target = normalizeAnswer(answer);
      const tiles = options.map(normalizeAnswer);
      const visited = new Set();
      function assemble(position, mask) {
        if (mask === (1 << tiles.length) - 1) return position === target.length;
        if (visited.has(mask)) return false;
        visited.add(mask);
        return tiles.some((tile,i) => !(mask & (1 << i)) && target.startsWith(tile,position) && assemble(position+tile.length,mask | (1 << i)));
      }
      if (!assemble(0,0)) fail('les morceaux ne permettent pas de construire la réponse.');
    }
    return [{id,type:row.type,grammarId:row.grammar_id,difficulty:row.difficulty,
      instruction:row.instruction,prompt:row.prompt,answer,options,
      translation:row.translation,explanation:row.explanation}];
  });
}

export async function loadExercises(grammar, fetcher = fetch) {
  const response = await fetcher('data/exercises.csv');
  if (!response.ok) throw new Error(`exercises.csv indisponible (HTTP ${response.status}).`);
  return parseExercises(await response.text(), grammar);
}
