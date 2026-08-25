#!/usr/bin/env python3
"""Application web locale Kotoba, rendue entièrement par Flask."""

from __future__ import annotations

import csv
import hashlib
import sqlite3
import threading
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, redirect, render_template, request, session, url_for

from config import SESSION_SIZES
from scheduler import MemoryState, interval_labels, schedule_review


ROOT = Path(__file__).resolve().parent
DATABASE_PATH = ROOT / "data" / "kotoba.sqlite3"
KANJI_PATH = ROOT / "data" / "kanji.csv"
VOCABULARY_PATH = ROOT / "data" / "vocabulary.csv"
GRAMMAR_PATH = ROOT / "data" / "grammar.csv"
RATINGS = {"again", "hard", "good", "easy"}
DECKS = {
    "kanji": {"path": KANJI_PATH, "id": "character", "label": "kanji"},
    "vocabulary": {"path": VOCABULARY_PATH, "id": "id", "label": "mot"},
    "grammar": {"path": GRAMMAR_PATH, "id": "id", "label": "point de grammaire"},
}

app = Flask(__name__)
app.secret_key = "kotoba-local-session"


def load_cards(deck: str = "kanji") -> list[dict]:
    """Recharge le CSV à chaque page pour que les ajouts manuels soient immédiats."""
    with DECKS[deck]["path"].open(encoding="utf-8-sig", newline="") as stream:
        cards = list(csv.DictReader(stream))
    for card in cards:
        card["ready"] = card.get("ready", "").strip().lower() in {"true", "1", "oui", "yes"}
    return cards


def database() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(memory_states)")}
        if columns and "direction" not in columns:
            connection.execute("ALTER TABLE memory_states RENAME TO memory_states_legacy")
        connection.execute("""CREATE TABLE IF NOT EXISTS memory_states (
            kanji TEXT NOT NULL, direction TEXT NOT NULL, due_at TEXT,
            stability REAL NOT NULL DEFAULT 0,
            difficulty REAL NOT NULL DEFAULT 5, reviews INTEGER NOT NULL DEFAULT 0,
            lapses INTEGER NOT NULL DEFAULT 0, last_rating TEXT, last_reviewed_at TEXT,
            PRIMARY KEY (kanji, direction))""")
        if columns and "direction" not in columns:
            connection.execute("""INSERT INTO memory_states
                (kanji,direction,due_at,stability,difficulty,reviews,lapses,last_rating,last_reviewed_at)
                SELECT kanji,'jp_to_fr',due_at,stability,difficulty,reviews,lapses,last_rating,last_reviewed_at
                FROM memory_states_legacy""")
            connection.execute("DROP TABLE memory_states_legacy")
        state_columns = {row[1] for row in connection.execute("PRAGMA table_info(memory_states)")}
        for column, definition in (
            ("fsrs_card_id", "INTEGER"),
            ("fsrs_state", "INTEGER"),
            ("fsrs_step", "INTEGER"),
        ):
            if column not in state_columns:
                connection.execute(f"ALTER TABLE memory_states ADD COLUMN {column} {definition}")
        for row in connection.execute("SELECT kanji,direction,reviews,fsrs_card_id,fsrs_state,fsrs_step FROM memory_states"):
            migrated_state = row["fsrs_state"] or (2 if row["reviews"] else 1)
            connection.execute(
                """UPDATE memory_states SET fsrs_card_id=?, fsrs_state=?, fsrs_step=?
                   WHERE kanji=? AND direction=?""",
                (
                    row["fsrs_card_id"] or deterministic_card_id(row["kanji"], row["direction"]),
                    migrated_state,
                    row["fsrs_step"] if row["fsrs_state"] is not None else (None if row["reviews"] else 0),
                    row["kanji"], row["direction"],
                ),
            )
        connection.execute("""CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT, kanji TEXT NOT NULL,
            reviewed_at TEXT NOT NULL, rating TEXT NOT NULL,
            stability_before REAL NOT NULL, stability_after REAL NOT NULL,
            difficulty_before REAL NOT NULL, difficulty_after REAL NOT NULL,
            due_at TEXT NOT NULL)""")
        review_columns = {row[1] for row in connection.execute("PRAGMA table_info(reviews)")}
        if "direction" not in review_columns:
            connection.execute("ALTER TABLE reviews ADD COLUMN direction TEXT NOT NULL DEFAULT 'jp_to_fr'")
        review_columns = {row[1] for row in connection.execute("PRAGMA table_info(reviews)")}
        for column, definition in (
            ("fsrs_card_id", "INTEGER"),
            ("fsrs_rating", "INTEGER"),
            ("fsrs_state_after", "INTEGER"),
        ):
            if column not in review_columns:
                connection.execute(f"ALTER TABLE reviews ADD COLUMN {column} {definition}")
        rating_numbers = {"again": 1, "hard": 2, "good": 3, "easy": 4}
        for row in connection.execute("SELECT id,kanji,direction,rating,fsrs_card_id,fsrs_rating FROM reviews"):
            connection.execute(
                "UPDATE reviews SET fsrs_card_id=?,fsrs_rating=? WHERE id=?",
                (row["fsrs_card_id"] or deterministic_card_id(row["kanji"], row["direction"]),
                 row["fsrs_rating"] or rating_numbers.get(row["rating"]), row["id"]),
            )


def deterministic_card_id(key: str, direction: str) -> int:
    digest = hashlib.blake2b(f"{direction}:{key}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big") & ((1 << 63) - 1)


def state_from_row(row: sqlite3.Row | None, card_id: int = 0) -> MemoryState:
    if row is None:
        return MemoryState(card_id=card_id)
    fsrs_state = row["fsrs_state"] or (2 if row["reviews"] else 1)
    return MemoryState(
        card_id=row["fsrs_card_id"] or card_id,
        fsrs_state=fsrs_state,
        step=row["fsrs_step"] if fsrs_state != 2 else None,
        due_at=datetime.fromisoformat(row["due_at"]) if row["due_at"] else None,
        stability=row["stability"] if row["stability"] > 0 else None,
        difficulty=row["difficulty"] if row["reviews"] else None, reviews=row["reviews"],
        lapses=row["lapses"], last_rating=row["last_rating"],
        last_reviewed_at=datetime.fromisoformat(row["last_reviewed_at"]) if row["last_reviewed_at"] else None,
    )


def card_key(deck: str, card_id: str) -> str:
    # Les clés historiques des kanji restent inchangées pour préserver les progrès.
    return card_id if deck == "kanji" else f"{deck}:{card_id}"


def ready_cards(deck: str = "kanji") -> list[dict]:
    return [card for card in load_cards(deck) if card.get("ready")]


def due_cards(deck: str = "kanji", direction: str | None = None) -> list[dict]:
    direction = direction or session.get("review_direction", "jp_to_fr")
    now = datetime.now(timezone.utc)
    with database() as connection:
        states = {row["kanji"]: state_from_row(row) for row in connection.execute(
            "SELECT * FROM memory_states WHERE direction=?", (direction,))}
    id_field = DECKS[deck]["id"]
    return [card for card in ready_cards(deck) if not states.get(card_key(deck, card[id_field])) or not states[card_key(deck, card[id_field])].due_at or states[card_key(deck, card[id_field])].due_at <= now]


def current_card(deck: str) -> dict | None:
    queue = session.get("study_queue", [])
    position = session.get("study_position", 0)
    if position >= len(queue):
        return None
    card_id = queue[position]
    id_field = DECKS[deck]["id"]
    return next((card for card in load_cards(deck) if card[id_field] == card_id), None)


@app.get("/")
def index():
    return render_template(
        "index.html", due_counts={deck: len(due_cards(deck)) for deck in DECKS},
        direction=session.get("review_direction", "jp_to_fr"),
    )


@app.post("/direction")
def toggle_direction():
    current = session.get("review_direction", "jp_to_fr")
    session["review_direction"] = "fr_to_jp" if current == "jp_to_fr" else "jp_to_fr"
    return redirect(url_for("index"))


@app.get("/catalogue")
def catalog():
    cards = load_cards("kanji")
    return render_template("catalog.html", cards=cards, ready_count=sum(bool(card.get("ready")) for card in cards))


@app.get("/<deck>")
def start_session(deck: str):
    if deck not in DECKS:
        return redirect(url_for("index"))
    cards = due_cards(deck)
    id_field = DECKS[deck]["id"]
    session["study_deck"] = deck
    session["study_queue"] = [card[id_field] for card in cards[:SESSION_SIZES[deck]]]
    session["study_position"] = 0
    session["study_revealed"] = False
    return redirect(url_for("review_card", deck=deck))


@app.get("/<deck>/revision")
def review_card(deck: str):
    if deck not in DECKS or session.get("study_deck") != deck:
        return redirect(url_for("start_session", deck=deck))
    card = current_card(deck)
    queue = session.get("study_queue", [])
    position = session.get("study_position", 0)
    if card is None:
        return render_template("complete.html", reviewed=position, deck_label=DECKS[deck]["label"])
    key = card_key(deck, card[DECKS[deck]["id"]])
    with database() as connection:
        direction = session.get("review_direction", "jp_to_fr")
        row = connection.execute("SELECT * FROM memory_states WHERE kanji=? AND direction=?", (key, direction)).fetchone()
    state = state_from_row(row, deterministic_card_id(key, direction))
    return render_template(
        "review.html", card=card, deck=deck, deck_label=DECKS[deck]["label"], revealed=session.get("study_revealed", False),
        intervals=interval_labels(state), position=position + 1,
        total=len(queue), progress_percent=round(position / len(queue) * 100) if queue else 100,
        direction=direction,
    )


@app.post("/<deck>/reveler")
def reveal_card(deck: str):
    if deck in DECKS and current_card(deck) is not None:
        session["study_revealed"] = True
    return redirect(url_for("review_card", deck=deck))


@app.post("/<deck>/evaluer")
def rate_card(deck: str):
    rating = request.form.get("rating")
    card = current_card(deck) if deck in DECKS else None
    if card is None or rating not in RATINGS or not session.get("study_revealed"):
        return redirect(url_for("review_card", deck=deck))
    key = card_key(deck, card[DECKS[deck]["id"]])
    with database() as connection:
        direction = session.get("review_direction", "jp_to_fr")
        row = connection.execute("SELECT * FROM memory_states WHERE kanji=? AND direction=?", (key, direction)).fetchone()
        before = state_from_row(row, deterministic_card_id(key, direction))
        after = schedule_review(before, rating)
        record = after.to_record()
        connection.execute("""INSERT INTO memory_states
            (kanji,direction,due_at,stability,difficulty,reviews,lapses,last_rating,last_reviewed_at,
             fsrs_card_id,fsrs_state,fsrs_step)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kanji,direction) DO UPDATE SET
            due_at=excluded.due_at,stability=excluded.stability,difficulty=excluded.difficulty,
            reviews=excluded.reviews,lapses=excluded.lapses,last_rating=excluded.last_rating,
            last_reviewed_at=excluded.last_reviewed_at,fsrs_card_id=excluded.fsrs_card_id,
            fsrs_state=excluded.fsrs_state,fsrs_step=excluded.fsrs_step""",
            (key, direction, record["due_at"], after.stability, after.difficulty,
             after.reviews, after.lapses, rating, record["last_reviewed_at"], after.card_id,
             after.fsrs_state, after.step))
        connection.execute("""INSERT INTO reviews
            (kanji,direction,reviewed_at,rating,stability_before,stability_after,difficulty_before,
             difficulty_after,due_at,fsrs_card_id,fsrs_rating,fsrs_state_after)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (key, direction, record["last_reviewed_at"], rating, before.stability or 0,
             after.stability, before.difficulty or 0, after.difficulty, record["due_at"], after.card_id,
             {"again": 1, "hard": 2, "good": 3, "easy": 4}[rating], after.fsrs_state))
    session["study_position"] = session.get("study_position", 0) + 1
    session["study_revealed"] = False
    return redirect(url_for("review_card", deck=deck))


def main() -> None:
    initialize_database()
    threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:8000")).start()
    app.run(host="127.0.0.1", port=8000, debug=False)


initialize_database()

if __name__ == "__main__":
    main()
