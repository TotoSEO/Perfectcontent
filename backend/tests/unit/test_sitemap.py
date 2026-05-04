from app.services.sitemap import _parse_robots


def test_parse_robots_extracts_sitemap_directives():
    text = """
User-agent: *
Disallow: /admin

Sitemap: https://example.com/sitemap.xml
sitemap: https://example.com/sitemap-news.xml
"""
    out = _parse_robots(text)
    assert "https://example.com/sitemap.xml" in out
    assert "https://example.com/sitemap-news.xml" in out


def test_parse_robots_ignores_non_sitemap_lines():
    assert _parse_robots("User-agent: *\nDisallow: /") == []
