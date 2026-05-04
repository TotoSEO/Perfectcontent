from datetime import datetime, timezone, timedelta

from app.services.parser import ParsedPage
from app.services.quality import score_competitor


def test_long_recent_page_with_schema_scores_high():
    p = ParsedPage(
        url="x",
        title="t",
        h1="t",
        h2=["a", "b", "c", "d", "e", "f"],
        word_count=2200,
        tables_count=1,
        has_article_schema=True,
        author="someone",
        published_at=datetime.now(timezone.utc) - timedelta(days=30),
    )
    assert score_competitor(p) > 0.8


def test_short_old_anonymous_page_scores_low():
    p = ParsedPage(
        url="x",
        title="t",
        h1="t",
        word_count=200,
    )
    assert score_competitor(p) < 0.3
