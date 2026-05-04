"""Unit tests for the section splice helpers in regenerate.py.

These don't hit the LLM or DB — they exercise the pure HTML manipulation that's
the most fragile part of the regeneration flow.
"""
from app.services.regenerate import (
    _extract_section_html,
    _list_other_sections,
    _splice_section,
    _strip_code_fences,
)


HTML = """
<h1>Article</h1>
<p>Intro générale.</p>
<h2 id="bases">Comprendre les bases</h2>
<p>Premier paragraphe sur les bases.</p>
<p>Deuxième paragraphe.</p>
<h2 id="comparatif">Comparatif</h2>
<p>Tableau comparatif des solutions.</p>
<h2 id="faq">FAQ</h2>
<h3>Question 1</h3>
<p>Réponse 1.</p>
"""


def test_extract_section_returns_only_targeted_section():
    block = _extract_section_html(HTML, "comparatif")
    assert block is not None
    assert "Comparatif" in block
    assert "Tableau comparatif" in block
    assert "FAQ" not in block
    assert "Question 1" not in block
    assert "Comprendre les bases" not in block


def test_extract_section_unknown_returns_none():
    assert _extract_section_html(HTML, "missing-id") is None


def test_list_other_sections_excludes_self():
    others = _list_other_sections(HTML, "comparatif")
    assert "Comprendre les bases" in others
    assert "FAQ" in others
    assert "Comparatif" not in others


def test_splice_replaces_section_in_place():
    new_section = (
        '<h2 id="comparatif">Nouveau comparatif</h2>'
        "<p>Nouveau paragraphe rédigé.</p>"
        "<ul><li>point 1</li></ul>"
    )
    out = _splice_section(HTML, "comparatif", new_section)

    assert "Nouveau comparatif" in out
    assert "Nouveau paragraphe rédigé" in out
    assert "Tableau comparatif" not in out
    # Other sections still present
    assert "Comprendre les bases" in out
    assert "FAQ" in out
    assert "Question 1" in out
    # Order preserved (bases comes before comparatif comes before faq)
    assert out.index("Comprendre les bases") < out.index("Nouveau comparatif")
    assert out.index("Nouveau comparatif") < out.index("FAQ")


def test_splice_with_invalid_replacement_keeps_original():
    out = _splice_section(HTML, "comparatif", "<p>just a paragraph, no h2</p>")
    assert out == HTML or "Tableau comparatif" in out  # untouched


def test_strip_code_fences():
    assert _strip_code_fences("```html\n<h2>X</h2>\n```") == "<h2>X</h2>"
    assert _strip_code_fences("<h2>X</h2>") == "<h2>X</h2>"
