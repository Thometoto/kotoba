"""Adaptateur Python entre Kotoba et le planificateur officiel FSRS."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fsrs import Card, Rating, Scheduler, State

from config import FSRS_DESIRED_RETENTION, FSRS_MAXIMUM_INTERVAL_DAYS


RATING_MAP = {
    "again": Rating.Again,
    "hard": Rating.Hard,
    "good": Rating.Good,
    "easy": Rating.Easy,
}

# Une seule étape courte conserve « Oublié » à 1 minute. Correct et Facile
# entrent immédiatement dans le calendrier adaptatif.
FSRS = Scheduler(
    desired_retention=FSRS_DESIRED_RETENTION,
    learning_steps=(timedelta(minutes=1),),
    relearning_steps=(timedelta(minutes=10),),
    maximum_interval=FSRS_MAXIMUM_INTERVAL_DAYS,
    enable_fuzzing=False,
)


@dataclass(frozen=True)
class MemoryState:
    card_id: int = 0
    fsrs_state: int = State.Learning.value
    step: int | None = 0
    due_at: datetime | None = None
    stability: float | None = None
    difficulty: float | None = None
    reviews: int = 0
    lapses: int = 0
    last_rating: str | None = None
    last_reviewed_at: datetime | None = None

    def to_card(self, now: datetime | None = None) -> Card:
        now = now or datetime.now(timezone.utc)
        return Card(
            card_id=self.card_id,
            state=State(self.fsrs_state),
            step=self.step,
            stability=self.stability,
            difficulty=self.difficulty,
            due=self.due_at or now,
            last_review=self.last_reviewed_at,
        )

    @classmethod
    def from_card(
        cls, card: Card, previous: "MemoryState", rating: str
    ) -> "MemoryState":
        return cls(
            card_id=card.card_id,
            fsrs_state=card.state.value,
            step=card.step,
            due_at=card.due,
            stability=card.stability,
            difficulty=card.difficulty,
            reviews=previous.reviews + 1,
            lapses=previous.lapses + (rating == "again"),
            last_rating=rating,
            last_reviewed_at=card.last_review,
        )

    def to_record(self) -> dict:
        return {
            "due_at": self.due_at.isoformat() if self.due_at else None,
            "last_reviewed_at": (
                self.last_reviewed_at.isoformat() if self.last_reviewed_at else None
            ),
        }


def schedule_review(
    state: MemoryState, rating: str, now: datetime | None = None
) -> MemoryState:
    if rating not in RATING_MAP:
        raise ValueError("Évaluation inconnue")
    now = now or datetime.now(timezone.utc)
    card, _ = FSRS.review_card(state.to_card(now), RATING_MAP[rating], now)
    return MemoryState.from_card(card, state, rating)


def interval_labels(state: MemoryState, now: datetime | None = None) -> dict[str, str]:
    now = now or datetime.now(timezone.utc)
    labels: dict[str, str] = {}
    for rating in RATING_MAP:
        due = schedule_review(state, rating, now).due_at
        seconds = max(0, (due - now).total_seconds())
        if seconds < 3600:
            labels[rating] = f"{round(seconds / 60)} min"
        elif seconds < 86400:
            labels[rating] = f"{round(seconds / 3600)} h"
        else:
            labels[rating] = f"{round(seconds / 86400)} j"
    return labels
