-- ─────────────────────────────────────────────────────────────
-- Base : escalade
-- Table : sites_naturels (SNE — Sites Naturels d'Escalade FFME)
-- ─────────────────────────────────────────────────────────────
--
-- Pré-requis :
--   CREATE DATABASE escalade;
--   \c escalade
--   CREATE EXTENSION IF NOT EXISTS postgis;   -- optionnel mais recommandé
--
-- Idempotent : peut être rejoué sans casse.
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS sites_naturels (
    id                          INTEGER PRIMARY KEY,
    url                         TEXT,
    nom                         TEXT,

    -- Localisation
    commune                     TEXT,
    departement                 TEXT,
    code_departement            TEXT,
    acces_routier               TEXT,
    approche                    TEXT,
    massif                      TEXT,
    orientation                 TEXT,
    cartographie                TEXT,
    interet                     TEXT,

    -- Fiche technique
    presentation                TEXT,
    rocher                      TEXT,
    type_site                   TEXT,
    hauteur_min_m               INTEGER,
    hauteur_max_m               INTEGER,
    informations_falaise        TEXT,
    periodes_favorables         TEXT[],
    rocher_type                 TEXT,
    reglementation_particuliere TEXT,
    secteur_decouverte          BOOLEAN,
    nombre_voies                INTEGER,
    cotation_min                TEXT,
    cotation_max                TEXT,
    derniere_mise_a_jour        DATE,

    -- Géolocalisation
    latitude                    DOUBLE PRECISION,
    longitude                   DOUBLE PRECISION,
    parking1_lat                DOUBLE PRECISION,
    parking1_lon                DOUBLE PRECISION,
    parking2_lat                DOUBLE PRECISION,
    parking2_lon                DOUBLE PRECISION,
    geom                        GEOMETRY(Point, 4326),

    -- Liens
    suricate_url                TEXT,
    contact_gestionnaire_url    TEXT,
    bibliographie               TEXT[],

    -- Filet de sécurité pour les champs dynamiques non mappés
    champs_extras               JSONB,

    -- Métadonnées
    scraped_at                  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_nom         ON sites_naturels (nom);
CREATE INDEX IF NOT EXISTS idx_sites_commune     ON sites_naturels (commune);
CREATE INDEX IF NOT EXISTS idx_sites_departement ON sites_naturels (departement);
CREATE INDEX IF NOT EXISTS idx_sites_massif      ON sites_naturels (massif);
CREATE INDEX IF NOT EXISTS idx_sites_cotation    ON sites_naturels (cotation_min, cotation_max);
CREATE INDEX IF NOT EXISTS idx_sites_coords      ON sites_naturels (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_sites_geom        ON sites_naturels USING GIST (geom);
