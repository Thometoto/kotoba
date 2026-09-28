import assert from "node:assert/strict";
import fs from "node:fs";
import { createEmptyCard, Rating, State } from "ts-fsrs";
import { scheduler } from "../src/scheduler.js";

const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");

for (const path of [
  "index.html", "app.js", "pwa.css", "service-worker.js",
  "data/kanji.csv", "data/vocabulary.csv", "data/grammar.csv", "data/exercises.csv",
  "icons/icon-180.png", "icons/icon-512.png",
]) assert.ok(fs.statSync(path).size > 0, `${path} doit exister`);

const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
assert.ok(serviceWorker.includes('const CACHE = "kotoba-v12"'), "le cache doit être versionné");
assert.ok(serviceWorker.indexOf("fetch(event.request)") < serviceWorker.indexOf("caches.match(event.request)"), "le réseau doit être prioritaire pour recevoir les mises à jour");
for (const path of ["data/kanji.csv", "data/vocabulary.csv", "data/grammar.csv", "data/exercises.csv"])
  assert.ok(serviceWorker.includes(path), `${path} doit être disponible hors connexion`);

const source = fs.readFileSync("src/pwa-app.js", "utf8");
assert.ok(!source.includes("data-level"), "le choix N5/N4 doit être absent");
assert.ok(!source.includes("kotoba-level"), "aucun niveau ne doit être mémorisé");
assert.ok(!source.includes("Math.random()"), "les cartes doivent conserver l’ordre pédagogique des CSV");
assert.ok(source.includes("prompt-reading"), "la lecture du vocabulaire doit apparaître sous le mot");
assert.ok(source.includes('jp: card.reading'), "les structures grammaticales doivent utiliser leur lecture");
assert.ok(source.includes("card.example_reading"), "les cartes de grammaire doivent afficher un exemple en hiragana");
assert.ok(source.includes("CATALOG_FIELDS"), "le catalogue doit rechercher dans les trois catégories");
for (const deck of ["kanji", "vocabulary", "grammar"])
  assert.ok(source.includes(`${deck}: [`), `le catalogue doit indexer ${deck}`);
assert.ok(source.includes("renderCatalogCard"), "un résultat doit ouvrir sa fiche détaillée");
assert.ok(source.includes('querySelector("#catalog").onclick = () => renderCatalog()'), "le clic Catalogue ne doit pas transmettre son événement comme catégorie");

const now = new Date("2026-01-01T00:00:00Z");
const preview = scheduler.repeat(createEmptyCard(now), now);
assert.equal((preview[Rating.Again].card.due - now) / 60000, 60);
assert.ok(preview[Rating.Easy].card.due > preview[Rating.Good].card.due);

// Every Again, including repeated failures and previously learned cards, waits one hour.
assert.ok(source.includes("import { scheduler } from './scheduler.js'"));
const learned = scheduler.next(createEmptyCard(now), now, Rating.Easy).card;
assert.equal(learned.state, State.Review);
for (const initial of [createEmptyCard(now), learned]) {
  let card = initial;
  let reviewedAt = new Date(card.due);
  for (let i = 0; i < 5; i++) {
    const next = scheduler.next(card, reviewedAt, Rating.Again).card;
    const displayed = scheduler.repeat(card, reviewedAt)[Rating.Again].card;
    assert.equal(next.due.getTime() - reviewedAt.getTime(), 3600000);
    assert.equal(displayed.due.getTime(), next.due.getTime());
    card = next;
    reviewedAt = new Date(next.due);
  }
}
console.log("PWA et FSRS validés : Oublié attend une heure, même après plusieurs échecs.");

// Hard has a two-hour minimum for new, learning and relearning cards.
for (const initial of [createEmptyCard(now), learned, scheduler.next(learned, learned.due, Rating.Again).card]) {
  let card = initial;
  let reviewedAt = new Date(card.due);
  for (let i = 0; i < 5; i++) {
    const next = scheduler.next(card, reviewedAt, Rating.Hard).card;
    const displayed = scheduler.repeat(card, reviewedAt)[Rating.Hard].card;
    assert.ok(next.due.getTime() - reviewedAt.getTime() >= 7200000);
    assert.equal(displayed.due.getTime(), next.due.getTime());
    card = next;
    reviewedAt = new Date(next.due);
  }
}
assert.equal(preview[Rating.Hard].card.due - now, 7200000);
const { fsrs } = await import('ts-fsrs');
const original = fsrs({request_retention:0.9,maximum_interval:36500,enable_fuzz:false,enable_short_term:true,learning_steps:['1h'],relearning_steps:['1h']});
const mature = {...learned, stability:100, difficulty:5, elapsed_days:100, scheduled_days:100, reps:20};
const later = new Date(now.getTime()+100*86400000);
const raw = original.next(mature,later,Rating.Hard);
assert.ok(raw.card.due-later > 7200000);
assert.deepEqual(scheduler.next(mature,later,Rating.Hard),raw);
for(const rating of [Rating.Again,Rating.Good,Rating.Easy])assert.deepEqual(scheduler.next(mature,later,rating),original.next(mature,later,rating));
console.log('Difficile : minimum de deux heures, aperçu cohérent et intervalles FSRS plus longs préservés.');
