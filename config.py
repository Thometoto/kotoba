"""Configuration produit modifiable de Kotoba."""

SESSION_SIZES = {
    "kanji": 20,
    "vocabulary": 20,
    "grammar": 5,
}

# FSRS vise une probabilité de rappel de 90 %. Les cartes nouvelles passent par
# une seule étape courte ; un rappel « Correct » ou « Facile » les fait ensuite
# entrer dans le calendrier adaptatif.
FSRS_DESIRED_RETENTION = 0.90
FSRS_MAXIMUM_INTERVAL_DAYS = 36500
