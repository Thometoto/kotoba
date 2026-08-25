from datetime import datetime, timezone

from scheduler import MemoryState, schedule_review


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def test_good_schedules_new_card_with_fsrs():
    state = schedule_review(MemoryState(), "good", NOW)
    assert (state.due_at - NOW).days == 2
    assert state.reviews == 1
    assert state.fsrs_state == 2


def test_easy_schedules_new_card_in_eight_days():
    state = schedule_review(MemoryState(), "easy", NOW)
    assert (state.due_at - NOW).days == 8


def test_again_increments_lapses_and_returns_quickly():
    state = schedule_review(MemoryState(stability=8), "again", NOW)
    assert state.lapses == 1
    assert (state.due_at - NOW).total_seconds() == 60


def test_easy_is_later_than_hard():
    previous = MemoryState(stability=5)
    assert schedule_review(previous, "easy", NOW).due_at > schedule_review(previous, "hard", NOW).due_at


def test_invalid_rating_is_rejected():
    try:
        schedule_review(MemoryState(), "invalid", NOW)
    except ValueError:
        return
    raise AssertionError("Une évaluation inconnue doit être refusée")
