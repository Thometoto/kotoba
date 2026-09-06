import assert from "node:assert/strict";
import fs from "node:fs";
import { createEmptyCard, fsrs, Rating } from "ts-fsrs";

const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");

for (const path of [
  "index.html", "app.js", "pwa.css", "service-worker.js",
  "data/kanji.csv", "data/vocabulary.csv", "data/grammar.csv",
  "icons/icon-180.png", "icons/icon-512.png",
]) assert.ok(fs.statSync(path).size > 0, `${path} doit exister`);

const serviceWorker = fs.readFileSync("service-worker.js", "utf8");
assert.ok(serviceWorker.includes('const CACHE = "kotoba-v7"'), "le cache doit être versionné");
assert.ok(serviceWorker.indexOf("fetch(event.request)") < serviceWorker.indexOf("caches.match(event.request)"), "le réseau doit être prioritaire pour recevoir les mises à jour");
for (const path of ["data/kanji.csv", "data/vocabulary.csv", "data/grammar.csv"])
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

const scheduler = fsrs({
  request_retention: 0.9, enable_fuzz: false, enable_short_term: true,
  learning_steps: ["1m"], relearning_steps: ["10m"],
});
const now = new Date("2026-01-01T00:00:00Z");
const preview = scheduler.repeat(createEmptyCard(now), now);
assert.equal((preview[Rating.Again].card.due - now) / 60000, 1);
assert.ok(preview[Rating.Easy].card.due > preview[Rating.Good].card.due);

console.log("PWA et FSRS local validés");
