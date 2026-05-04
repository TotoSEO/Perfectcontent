from app.services.cost import estimate, domain_index_estimate


def test_estimate_blog_includes_image_and_serp():
    rng = estimate(content_type="blog", internal_linking=False)
    assert rng.low > 0 and rng.high > rng.low
    assert rng.high < 1.0


def test_internal_linking_increases_cost():
    a = estimate(content_type="blog", internal_linking=False)
    b = estimate(content_type="blog", internal_linking=True)
    assert b.high > a.high


def test_domain_index_estimate_scales():
    a = domain_index_estimate(100)
    b = domain_index_estimate(1000)
    assert b.high > a.high
