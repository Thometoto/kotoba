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
for (const path of ["data/kanji.csv", "data/vocabulary.csv", "data/grammar.csv"])
  assert.ok(serviceWorker.includes(path), `${path} doit être disponible hors connexion`);

const source = fs.readFileSync("src/pwa-app.js", "utf8");
assert.ok(!source.includes("data-level"), "le choix N5/N4 doit être absent");
assert.ok(!source.includes("kotoba-level"), "aucun niveau ne doit être mémorisé");
assert.ok(source.includes("Math.random()"), "les cartes doivent être mélangées");

const scheduler = fsrs({
  request_retention: 0.9, enable_fuzz: false, enable_short_term: true,
  learning_steps: ["1m"], relearning_steps: ["10m"],
});
const now = new Date("2026-01-01T00:00:00Z");
const preview = scheduler.repeat(createEmptyCard(now), now);
assert.equal((preview[Rating.Again].card.due - now) / 60000, 1);
assert.ok(preview[Rating.Easy].card.due > preview[Rating.Good].card.due);

console.log("PWA et FSRS local validés");
