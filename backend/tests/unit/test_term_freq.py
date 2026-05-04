from app.services.term_freq import compute_term_targets, tokenize


def test_tokenize_filters_stopwords_and_short_tokens():
    out = tokenize("Le café est très bon avec du sucre. AB cd")
    # 'café', 'sucre', 'bon' kept (after filter)
    assert "café" in out
    assert "sucre" in out
    assert "le" not in out
    assert "est" not in out
    assert "très" not in out
    assert "ab" not in out  # too short


def test_tokenize_preserves_french_accents():
    assert "éléphant" in tokenize("L'éléphant marche.")


def test_compute_targets_picks_universal_terms():
    docs = [
        "café espresso italien arabica robusta moulin",
        "café espresso machine arabica grain moulin",
        "café espresso italien grain robusta moulin barista",
        "café arabica grain robusta espresso italien moulin",
    ]
    targets = compute_term_targets(docs, top_n=10)
    terms = [t.term for t in targets]
    # Universal: café, espresso, moulin must appear
    assert "café" in terms
    assert "espresso" in terms
    assert "moulin" in terms
    # Targets should have valid min/max/target
    for t in targets:
        assert t.min <= t.target <= t.max
        assert 0 <= t.importance <= 1


def test_compute_targets_drops_low_coverage_terms():
    # 'rare' appears in only 1 of 5 docs → should be filtered
    docs = [
        "café espresso arabica",
        "café espresso arabica",
        "café espresso arabica",
        "café espresso arabica",
        "rare unique mot",
    ]
    targets = compute_term_targets(docs, top_n=20)
    terms = [t.term for t in targets]
    assert "rare" not in terms
    assert "unique" not in terms
