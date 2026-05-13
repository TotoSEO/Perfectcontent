-- Requêtes de contrôle post-import

-- Nombre total de sites
SELECT COUNT(*) AS total_sites FROM sites_naturels;

-- Répartition par département (top 20)
SELECT departement, COUNT(*) AS nb
FROM sites_naturels
GROUP BY departement
ORDER BY nb DESC
LIMIT 20;

-- Sites avec coordonnées GPS
SELECT COUNT(*) AS avec_gps FROM sites_naturels WHERE latitude IS NOT NULL;

-- Sites avec cotations renseignées
SELECT COUNT(*) AS avec_cotation FROM sites_naturels WHERE cotation_min IS NOT NULL;

-- Couverture des champs clés
SELECT
    COUNT(*)                                            AS total,
    COUNT(commune)                                       AS commune,
    COUNT(massif)                                        AS massif,
    COUNT(type_site)                                     AS type_site,
    COUNT(nombre_voies)                                  AS nombre_voies,
    COUNT(cotation_min)                                  AS cotation_min,
    COUNT(latitude)                                      AS latitude,
    COUNT(derniere_mise_a_jour)                          AS maj
FROM sites_naturels;
