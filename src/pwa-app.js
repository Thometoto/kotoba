import { createEmptyCard, fsrs, Rating } from "ts-fsrs";

const DECKS = {
  kanji: { file: "data/kanji.csv", id: "character", label: "kanji", title: "Kanji", glyph: "字", size: 20 },
  vocabulary: { file: "data/vocabulary.csv", id: "id", label: "mot", title: "Vocabulaire", glyph: "語", size: 20 },
  grammar: { file: "data/grammar.csv", id: "id", label: "point de grammaire", title: "Grammaire", glyph: "文", size: 5 },
};
const RATINGS = [
  [Rating.Again, "again", "Oublié"], [Rating.Hard, "hard", "Difficile"],
  [Rating.Good, "good", "Correct"], [Rating.Easy, "easy", "Facile"],
];
const scheduler = fsrs({
  request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false,
  enable_short_term: true, learning_steps: ["1m"], relearning_steps: ["10m"],
});
const app = document.querySelector("#app");
const cards = {};
let direction = localStorage.getItem("kotoba-direction") || "jp_to_fr";
let session = null;

function parseCSV(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("kotoba", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("states", { keyPath: "id" });
      db.createObjectStore("reviews", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbRequest(store, mode, operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
const getState = id => dbRequest("states", "readonly", store => store.get(id));
const putState = value => dbRequest("states", "readwrite", store => store.put(value));
const addReview = value => dbRequest("reviews", "readwrite", store => store.add(value));
const allStates = () => dbRequest("states", "readonly", store => store.getAll());
const allReviews = () => dbRequest("reviews", "readonly", store => store.getAll());

function stateId(deck, card) { return `${deck}:${card[DECKS[deck].id]}:${direction}`; }
function restoreCard(saved, now = new Date()) {
  if (!saved) return createEmptyCard(now);
  return { ...saved.card, due: new Date(saved.card.due), last_review: saved.card.last_review ? new Date(saved.card.last_review) : undefined };
}
function serializeCard(card) {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review?.toISOString() || null };
}
function eligible(deck) {
  return cards[deck].filter(card => /^(true|1|oui|yes)$/i.test(card.ready || ""));
}
async function dueCards(deck) {
  const now = Date.now(); const result = [];
  for (const card of eligible(deck)) {
    const saved = await getState(stateId(deck, card));
    if (!saved || new Date(saved.card.due).getTime() <= now) result.push(card);
  }
  return result;
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}
function formatInterval(due, now) {
  const seconds = Math.max(0, (due - now) / 1000);
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} j`;
}

async function renderHome() {
  session = null;
  const counts = Object.fromEntries(await Promise.all(Object.keys(DECKS).map(async deck => [deck, (await dueCards(deck)).length])));
  app.innerHTML = `<section class="home">
    <div class="brand"><h1>Kotoba</h1><span class="badge">N5 · N4</span></div>
    <div class="direction"><span>Japonais</span><button id="direction" aria-label="Inverser le sens">${direction === "jp_to_fr" ? "→" : "←"}</button><span>Français</span></div>
    <nav class="choices">${Object.entries(DECKS).map(([key, deck]) => `<button class="choice" data-deck="${key}"><span class="choice-glyph">${deck.glyph}</span><strong>${deck.title}</strong><small>${counts[key]} à réviser</small></button>`).join("")}</nav>
    <div class="home-actions"><button class="link-button" id="catalog">Catalogue</button><button class="link-button" id="backup">Sauvegarde</button></div>
  </section>`;
  app.querySelector("#direction").onclick = () => { direction = direction === "jp_to_fr" ? "fr_to_jp" : "jp_to_fr"; localStorage.setItem("kotoba-direction", direction); renderHome(); };
  app.querySelectorAll("[data-deck]").forEach(button => button.onclick = () => startSession(button.dataset.deck));
  app.querySelector("#catalog").onclick = renderCatalog;
  app.querySelector("#backup").onclick = renderBackup;
}

async function startSession(deck) {
  const due = await dueCards(deck);
  session = { deck, queue: due.slice(0, DECKS[deck].size), position: 0, revealed: false };
  renderReview();
}
function cardSides(deck, card) {
  if (deck === "kanji") return { jp: card.character, fr: card.meaning, reading: card.readings, context: card.examples, meta: "EN CONTEXTE" };
  if (deck === "vocabulary") return { jp: card.japanese, fr: card.french, reading: card.reading, context: card.category, meta: `${card.level} · CATÉGORIE · LEÇON ${card.lesson}` };
  return { jp: card.structure, fr: card.french, reading: card.construction, context: card.example, meta: `${card.level} · EXEMPLE · LEÇON ${card.lesson}` };
}
async function renderReview() {
  const { deck, queue, position, revealed } = session;
  if (position >= queue.length) return renderComplete(position, DECKS[deck].label);
  const card = queue[position]; const sides = cardSides(deck, card); const now = new Date();
  const saved = await getState(stateId(deck, card)); const fsrsCard = restoreCard(saved, now);
  const previews = scheduler.repeat(fsrsCard, now);
  const prompt = direction === "jp_to_fr" ? sides.jp : sides.fr;
  const promptClass = deck === "grammar" ? "grammar" : (deck === "vocabulary" || direction === "fr_to_jp" ? "words" : "");
  app.innerHTML = `<header class="topbar"><button id="home">Kotoba</button><span>${position + 1} / ${queue.length}</span></header><main class="review-page">
    <div class="progress"><i style="width:${Math.round(position / queue.length * 100)}%"></i></div>
    <article class="flashcard"><p>${revealed ? "Réponse" : direction === "jp_to_fr" ? `Que signifie ce ${DECKS[deck].label} ?` : "Comment le dire en japonais ?"}</p>
      <div class="prompt ${promptClass}">${escapeHTML(revealed && direction === "fr_to_jp" ? sides.jp : prompt)}</div>
      ${revealed ? `<section class="answer"><h2>${escapeHTML(direction === "jp_to_fr" ? sides.fr : sides.jp)}</h2>${direction === "fr_to_jp" ? `<p>${escapeHTML(sides.fr)}</p>` : ""}<p class="reading">${escapeHTML(sides.reading)}</p><div class="example"><small>${escapeHTML(sides.meta)}</small>${escapeHTML(sides.context)}</div></section>` : `<button class="primary" id="reveal">Afficher la réponse</button>`}
    </article>
    ${revealed ? `<section class="ratings"><p>Comment était ton rappel ?</p><div class="rating-grid">${RATINGS.map(([grade, key, label]) => `<button class="rating ${key}" data-rating="${grade}"><strong>${label}</strong><small>${formatInterval(previews[grade].card.due, now)}</small></button>`).join("")}</div></section>` : ""}
  </main>`;
  app.querySelector("#home").onclick = renderHome;
  if (!revealed) app.querySelector("#reveal").onclick = () => { session.revealed = true; renderReview(); };
  else app.querySelectorAll("[data-rating]").forEach(button => button.onclick = () => rateCard(Number(button.dataset.rating), fsrsCard, now));
}
async function rateCard(rating, card, now) {
  const current = session.queue[session.position]; const id = stateId(session.deck, current);
  const result = scheduler.next(card, now, rating);
  await putState({ id, card: serializeCard(result.card), updatedAt: now.toISOString() });
  await addReview({ stateId: id, rating, reviewedAt: now.toISOString(), due: result.card.due.toISOString() });
  session.position++; session.revealed = false; renderReview();
}
function renderComplete(reviewed, label) {
  app.innerHTML = `<section class="complete"><span>よくできました！</span><h1>${reviewed ? "Session terminée" : "Tout est à jour"}</h1><p>${reviewed ? `${reviewed} ${escapeHTML(label)}${reviewed > 1 ? "s" : ""} révisé${reviewed > 1 ? "s" : ""}.` : `Aucun ${escapeHTML(label)} à réviser pour le moment.`}</p><button class="primary" id="home">Retour à l’accueil</button></section>`;
  app.querySelector("#home").onclick = renderHome;
}
function renderCatalog() {
  app.innerHTML = `<header class="topbar"><button id="home">← Accueil</button><span>${cards.kanji.length} kanji</span></header><main class="catalog"><h1>Catalogue</h1><input class="search" id="search" type="search" placeholder="Rechercher un kanji ou un sens"><section class="catalog-list"></section></main>`;
  const list = app.querySelector(".catalog-list");
  const draw = query => { const q = query.trim().toLowerCase(); list.innerHTML = cards.kanji.filter(c => !q || `${c.character} ${c.meaning} ${c.readings}`.toLowerCase().includes(q)).map(c => `<article class="catalog-row"><strong>${escapeHTML(c.character)}</strong><div><span>${escapeHTML(c.meaning)}</span><small>${escapeHTML(c.readings)}</small></div></article>`).join(""); };
  draw(""); app.querySelector("#search").oninput = event => draw(event.target.value); app.querySelector("#home").onclick = renderHome;
}
async function renderBackup() {
  app.innerHTML = `<header class="topbar"><button id="home">← Accueil</button><span>Local</span></header><section class="panel"><h1>Sauvegarde</h1><p>La progression reste uniquement sur cet appareil. Exporte-la régulièrement pour pouvoir la restaurer.</p><button class="primary" id="export">Exporter la progression</button><p><label class="primary" for="import">Importer une sauvegarde</label><input hidden id="import" type="file" accept="application/json"></p></section>`;
  app.querySelector("#home").onclick = renderHome;
  app.querySelector("#export").onclick = async () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), states: await allStates(), reviews: await allReviews() };
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" })); link.download = `kotoba-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  };
  app.querySelector("#import").onchange = async event => {
    const payload = JSON.parse(await event.target.files[0].text());
    if (payload.version !== 1 || !Array.isArray(payload.states)) throw new Error("Sauvegarde incompatible");
    for (const state of payload.states) await putState(state);
    for (const review of payload.reviews || []) { const copy = { ...review }; delete copy.id; await addReview(copy); }
    alert("Progression importée."); renderHome();
  };
}

async function boot() {
  try {
    await Promise.all(Object.entries(DECKS).map(async ([key, deck]) => { cards[key] = parseCSV(await (await fetch(deck.file)).text()); }));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
    window.addEventListener("offline", () => { const badge = document.createElement("span"); badge.className = "offline"; badge.textContent = "Hors connexion"; document.body.append(badge); });
    window.addEventListener("online", () => document.querySelector(".offline")?.remove());
    renderHome();
  } catch (error) {
    console.error(error); app.innerHTML = `<section class="panel"><h1>Chargement impossible</h1><p>Ouvre Kotoba une première fois avec une connexion Internet, puis ajoute-la à l’écran d’accueil.</p></section>`;
  }
}
boot();
