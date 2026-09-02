import webapp
import re
from config import SESSION_SIZES


def test_session_sizes():
    assert SESSION_SIZES == {"kanji": 20, "vocabulary": 20, "grammar": 5}


def test_home_page():
    client = webapp.app.test_client()
    response = client.get("/")
    assert response.status_code == 200
    assert "Kanji" in response.get_data(as_text=True)
    assert "Vocabulaire" in response.get_data(as_text=True)
    assert "Grammaire" in response.get_data(as_text=True)


def test_session_starts_on_a_kanji():
    client = webapp.app.test_client()
    response = client.get("/kanji", follow_redirects=True)
    assert response.status_code == 200
    assert "Que signifie ce kanji" in response.get_data(as_text=True)


def test_direction_can_be_reversed():
    client = webapp.app.test_client()
    response = client.post("/direction", follow_redirects=True)
    assert "Japonais" in response.get_data(as_text=True)
    response = client.get("/kanji", follow_redirects=True)
    assert "Quel est le kanji japonais" in response.get_data(as_text=True)


def test_fsrs_columns_are_migrated():
    with webapp.database() as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(memory_states)")}
    assert {"fsrs_card_id", "fsrs_state", "fsrs_step"} <= columns


def test_grammar_readings_do_not_contain_kanji():
    cards = webapp.load_cards("grammar")
    assert all(card["reading"] for card in cards)
    assert all(not re.search(r"[一-龯]", card["reading"]) for card in cards)
    assert all(card["example_reading"] for card in cards)
    assert all(not re.search(r"[一-龯ァ-ヶ]", card["example_reading"].split("／", 1)[0]) for card in cards)


def test_each_kanji_reading_has_an_example_word():
    for card in webapp.load_cards("kanji"):
        readings = card["readings"].split("・")
        examples = card["examples"].splitlines()
        assert len(examples) == len(readings)
        assert all(example.startswith(f"{reading}：") for reading, example in zip(readings, examples))


def test_vocabulary_prompt_includes_hiragana_reading():
    client = webapp.app.test_client()
    with client.session_transaction() as session:
        session["review_direction"] = "jp_to_fr"
    response = client.get("/vocabulary", follow_redirects=True)
    assert '<p class="readings">' in response.get_data(as_text=True)
