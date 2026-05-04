from app.services.parser import parse_page

HTML = """
<html><head><title>Mon titre</title></head>
<body>
<h1>Titre principal</h1>
<p>Premier paragraphe utile pour le SEO.</p>
<h2>Section A</h2>
<p>Contenu A avec beaucoup de mots qui peuplent l'article correctement.</p>
<h3>Sous-section</h3>
<ul><li>item</li><li>item</li></ul>
<table><tr><th>x</th></tr></table>
<img src="a.jpg" alt="texte alternatif">
<img src="b.jpg">
<script type="application/ld+json">
{"@type":"Article","author":{"name":"Alice"},"datePublished":"2025-01-01"}
</script>
</body></html>
"""


def test_parse_html_basic():
    p = parse_page("https://x.example", HTML, None)
    assert p.title == "Mon titre"
    assert p.h1 == "Titre principal"
    assert "Section A" in p.h2
    assert "Sous-section" in p.h3
    assert p.lists_count == 1
    assert p.tables_count == 1
    assert p.images_with_alt == 1
    assert p.images_without_alt == 1
    assert p.has_article_schema is True
    assert p.author == "Alice"
    assert p.published_at is not None


def test_parse_markdown_fallback():
    md = "# Titre\n\nIntro.\n\n## Sec\n\n- a\n- b\n"
    p = parse_page("https://y.example", None, md)
    assert p.h1 == "Titre"
    assert "Sec" in p.h2
    assert p.lists_count == 2
