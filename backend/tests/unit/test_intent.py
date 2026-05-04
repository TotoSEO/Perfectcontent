from app.services.intent import classify_intent


def test_shopping_feature_means_commercial_or_transactional():
    assert classify_intent(["shopping"], ["meilleur tel"]) == "commercial"
    assert classify_intent(["shopping"], ["acheter tel pas cher"]) == "transactional"


def test_paa_signals_informational():
    assert classify_intent(["people_also_ask"], ["définition X"]) == "informational"


def test_comparatif_implies_commercial():
    assert classify_intent([], ["comparatif des meilleurs aspirateurs"]) == "commercial"


def test_default_informational():
    assert classify_intent([], ["définition de l'inflation"]) == "informational"
