import webapp
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
