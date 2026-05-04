from app.services.linker import LinkSuggestion, insert_links


HTML = """
<h1>Titre</h1>
<h2 id="s1">Comprendre les bases</h2>
<p>Voici un guide complet pour comprendre les bases du sujet.</p>
<p>Suite du contenu sans ancre.</p>
<h2 id="s2">Comparatif</h2>
<p>Texte du comparatif.</p>
"""


def test_insert_link_uses_anchor_in_first_paragraph():
    sugs = [
        LinkSuggestion(
            section_id="s1",
            anchor="guide complet",
            target_url="https://example.com/guide",
            target_title="Guide",
            similarity=0.9,
            paragraph_index=0,
        )
    ]
    out = insert_links(HTML, sugs)
    assert '<a href="https://example.com/guide">guide complet</a>' in out


def test_insert_link_skips_when_anchor_missing():
    sugs = [
        LinkSuggestion(
            section_id="s2",
            anchor="anchor introuvable",
            target_url="https://example.com/x",
            target_title=None,
            similarity=0.9,
            paragraph_index=0,
        )
    ]
    out = insert_links(HTML, sugs)
    assert "anchor introuvable" not in out
    assert "https://example.com/x" not in out
