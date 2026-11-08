// Omit standalone illustrative lines when the construction already gives a rule.
// Keep conjugation arrows, irregular forms and all grammatical alternatives.
export function compactConstruction(value='') {
 const lines=value.split('\n').map(line=>line.trim()).filter(Boolean);
 if(!lines.some(line=>line.includes('+')))return lines.join('\n');
 return lines.filter(line=>/[a-zA-ZÀ-ÿ+→]/u.test(line)||!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line)).join('\n');
}
