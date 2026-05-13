"""
Import JSON → PostgreSQL
========================
Lit `ffme_sne.json` produit par `ffme_sne_scraper.py` et insère
les sites dans la table `sites_naturels` (idempotent : ON CONFLICT DO UPDATE).

Usage :
    pip install psycopg2-binary python-dotenv
    # Configurer .env (voir .env.example)
    python import_to_db.py [chemin/vers/ffme_sne.json]

Gère :
  - Conversions de type (int, bool, date, listes)
  - Extraction département / code_département depuis `commune`
  - PostGIS optionnel (colonne `geom` remplie si l'extension existe)
  - Filet de sécurité : champs non mappés stockés dans `champs_extras` (JSONB)
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
load_dotenv()

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "dbname":   os.getenv("DB_NAME", "escalade"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}

# Mapping : clé dans `champs` (JSON scraper) → colonne SQL
FIELD_MAPPING: dict[str, str] = {
    "commune":                          "commune",
    "acces_routier":                    "acces_routier",
    "approche":                         "approche",
    "massif":                           "massif",
    "orientation":                      "orientation",
    "cartographie":                     "cartographie",
    "interet":                          "interet",
    "presentation":                     "presentation",
    "rocher":                           "rocher",
    "type_site":                        "type_site",
    "hauteur_min_m":                    "hauteur_min_m",
    "hauteur_max_m":                    "hauteur_max_m",
    "informations_falaise":             "informations_falaise",
    "periodes_favorables":              "periodes_favorables",
    "rocher_type":                      "rocher_type",
    "reglementation_particuliere":      "reglementation_particuliere",
    "secteur_decouverte":               "secteur_decouverte",
    "nombre_voies":                     "nombre_voies",
    "cotation_min":                     "cotation_min",
    "cotation_max":                     "cotation_max",
    "derniere_mise_a_jour_de_la_fiche": "derniere_mise_a_jour",
}

INT_FIELDS = {"hauteur_min_m", "hauteur_max_m", "nombre_voies"}
BOOL_FIELDS = {"secteur_decouverte"}
DATE_FIELDS = {"derniere_mise_a_jour"}
ARRAY_FIELDS = {"periodes_favorables"}

COMMUNE_RE = re.compile(r"^(?P<ville>.+?)\s*\((?P<dep>[^()]+?)\s*-\s*(?P<code>\w+)\)\s*$")
DATE_RE = re.compile(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})")


# ─────────────────────────────────────────
# CONVERSIONS
# ─────────────────────────────────────────
def to_int(v: Any) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(str(v).strip())
    except (ValueError, TypeError):
        m = re.search(r"\d+", str(v))
        return int(m.group(0)) if m else None


def to_bool(v: Any) -> Optional[bool]:
    if v is None or v == "":
        return None
    s = str(v).strip().lower()
    if s in ("oui", "yes", "true", "1"):
        return True
    if s in ("non", "no", "false", "0"):
        return False
    return None


def to_date(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    m = DATE_RE.search(str(v))
    if not m:
        return None
    day, month, year = (int(x) for x in m.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def to_array(v: Any) -> Optional[list[str]]:
    if v is None or v == "":
        return None
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    parts = re.split(r"[,;]\s*", str(v))
    cleaned = [p.strip() for p in parts if p.strip()]
    return cleaned or None


def parse_commune(commune_raw: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Renvoie (commune_propre, departement, code_departement)."""
    if not commune_raw:
        return None, None, None
    m = COMMUNE_RE.match(commune_raw.strip())
    if not m:
        return commune_raw.strip(), None, None
    return (
        m.group("ville").strip(),
        m.group("dep").strip(),
        m.group("code").strip(),
    )


# ─────────────────────────────────────────
# CHECK POSTGIS
# ─────────────────────────────────────────
def has_postgis(cur) -> bool:
    cur.execute(
        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
    )
    return bool(cur.fetchone()[0])


# ─────────────────────────────────────────
# IMPORT
# ─────────────────────────────────────────
INSERT_SQL_BASE = """
INSERT INTO sites_naturels (
    id, url, nom,
    commune, departement, code_departement,
    acces_routier, approche, massif, orientation, cartographie, interet,
    presentation, rocher, type_site,
    hauteur_min_m, hauteur_max_m, informations_falaise,
    periodes_favorables, rocher_type, reglementation_particuliere,
    secteur_decouverte, nombre_voies, cotation_min, cotation_max,
    derniere_mise_a_jour,
    latitude, longitude,
    parking1_lat, parking1_lon, parking2_lat, parking2_lon,
    {geom_col}
    suricate_url, contact_gestionnaire_url, bibliographie,
    champs_extras
) VALUES (
    %(id)s, %(url)s, %(nom)s,
    %(commune)s, %(departement)s, %(code_departement)s,
    %(acces_routier)s, %(approche)s, %(massif)s, %(orientation)s, %(cartographie)s, %(interet)s,
    %(presentation)s, %(rocher)s, %(type_site)s,
    %(hauteur_min_m)s, %(hauteur_max_m)s, %(informations_falaise)s,
    %(periodes_favorables)s, %(rocher_type)s, %(reglementation_particuliere)s,
    %(secteur_decouverte)s, %(nombre_voies)s, %(cotation_min)s, %(cotation_max)s,
    %(derniere_mise_a_jour)s,
    %(latitude)s, %(longitude)s,
    %(parking1_lat)s, %(parking1_lon)s, %(parking2_lat)s, %(parking2_lon)s,
    {geom_val}
    %(suricate_url)s, %(contact_gestionnaire_url)s, %(bibliographie)s,
    %(champs_extras)s
)
ON CONFLICT (id) DO UPDATE SET
    url = EXCLUDED.url,
    nom = EXCLUDED.nom,
    commune = EXCLUDED.commune,
    departement = EXCLUDED.departement,
    code_departement = EXCLUDED.code_departement,
    acces_routier = EXCLUDED.acces_routier,
    approche = EXCLUDED.approche,
    massif = EXCLUDED.massif,
    orientation = EXCLUDED.orientation,
    cartographie = EXCLUDED.cartographie,
    interet = EXCLUDED.interet,
    presentation = EXCLUDED.presentation,
    rocher = EXCLUDED.rocher,
    type_site = EXCLUDED.type_site,
    hauteur_min_m = EXCLUDED.hauteur_min_m,
    hauteur_max_m = EXCLUDED.hauteur_max_m,
    informations_falaise = EXCLUDED.informations_falaise,
    periodes_favorables = EXCLUDED.periodes_favorables,
    rocher_type = EXCLUDED.rocher_type,
    reglementation_particuliere = EXCLUDED.reglementation_particuliere,
    secteur_decouverte = EXCLUDED.secteur_decouverte,
    nombre_voies = EXCLUDED.nombre_voies,
    cotation_min = EXCLUDED.cotation_min,
    cotation_max = EXCLUDED.cotation_max,
    derniere_mise_a_jour = EXCLUDED.derniere_mise_a_jour,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    parking1_lat = EXCLUDED.parking1_lat,
    parking1_lon = EXCLUDED.parking1_lon,
    parking2_lat = EXCLUDED.parking2_lat,
    parking2_lon = EXCLUDED.parking2_lon,
    {geom_set}
    suricate_url = EXCLUDED.suricate_url,
    contact_gestionnaire_url = EXCLUDED.contact_gestionnaire_url,
    bibliographie = EXCLUDED.bibliographie,
    champs_extras = EXCLUDED.champs_extras,
    scraped_at = NOW()
RETURNING (xmax = 0) AS inserted;
"""


def build_row(entry: dict, mapped_cols: set[str]) -> dict:
    champs: dict = entry.get("champs") or {}

    commune_raw = champs.get("commune")
    commune_clean, dep, code_dep = parse_commune(commune_raw)

    row: dict[str, Any] = {
        "id":  entry["id"],
        "url": entry.get("url"),
        "nom": entry.get("nom"),
        "commune":          commune_clean,
        "departement":      dep,
        "code_departement": code_dep,
        "latitude":     entry.get("latitude"),
        "longitude":    entry.get("longitude"),
        "parking1_lat": entry.get("parking1_lat"),
        "parking1_lon": entry.get("parking1_lon"),
        "parking2_lat": entry.get("parking2_lat"),
        "parking2_lon": entry.get("parking2_lon"),
        "suricate_url":             entry.get("suricate_url") or None,
        "contact_gestionnaire_url": entry.get("contact_gestionnaire_url") or None,
        "bibliographie":            entry.get("bibliographie") or None,
    }

    for champs_key, sql_col in FIELD_MAPPING.items():
        if sql_col == "commune":
            continue  # déjà traité
        raw = champs.get(champs_key)
        if sql_col in INT_FIELDS:
            row[sql_col] = to_int(raw)
        elif sql_col in BOOL_FIELDS:
            row[sql_col] = to_bool(raw)
        elif sql_col in DATE_FIELDS:
            row[sql_col] = to_date(raw)
        elif sql_col in ARRAY_FIELDS:
            row[sql_col] = to_array(raw)
        else:
            row[sql_col] = raw if raw not in ("", None) else None

    # Champs non mappés → JSONB
    extras = {k: v for k, v in champs.items() if k not in FIELD_MAPPING}
    row["champs_extras"] = json.dumps(extras, ensure_ascii=False) if extras else None

    # Compléter les clés manquantes (sécurité)
    for col in mapped_cols:
        row.setdefault(col, None)

    return row


def import_json(json_path: Path) -> None:
    if not json_path.exists():
        print(f"[ERREUR] Fichier introuvable : {json_path}", file=sys.stderr)
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        entries = json.load(f)

    print(f"→ {len(entries)} entrées chargées depuis {json_path}")

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False
    cur = conn.cursor()

    postgis = has_postgis(cur)
    print(f"→ PostGIS : {'activé' if postgis else 'non disponible (geom ignoré)'}")

    if postgis:
        sql = INSERT_SQL_BASE.format(
            geom_col="geom,",
            geom_val=(
                "CASE WHEN %(latitude)s IS NOT NULL AND %(longitude)s IS NOT NULL "
                "THEN ST_SetSRID(ST_MakePoint(%(longitude)s, %(latitude)s), 4326) "
                "ELSE NULL END,"
            ),
            geom_set=(
                "geom = CASE WHEN EXCLUDED.latitude IS NOT NULL AND EXCLUDED.longitude IS NOT NULL "
                "THEN ST_SetSRID(ST_MakePoint(EXCLUDED.longitude, EXCLUDED.latitude), 4326) "
                "ELSE NULL END,"
            ),
        )
    else:
        sql = INSERT_SQL_BASE.format(geom_col="", geom_val="", geom_set="")

    mapped_cols = set(FIELD_MAPPING.values())

    n_inserted = 0
    n_updated = 0
    n_errors = 0

    for entry in entries:
        try:
            row = build_row(entry, mapped_cols)
            cur.execute(sql, row)
            res = cur.fetchone()
            if res and res[0]:
                n_inserted += 1
            else:
                n_updated += 1
        except Exception as e:  # noqa: BLE001
            n_errors += 1
            conn.rollback()
            print(f"[ERREUR] id={entry.get('id')} : {e}", file=sys.stderr)
            continue
        else:
            conn.commit()

    cur.close()
    conn.close()

    print()
    print("─" * 50)
    print(f"  Insérés : {n_inserted}")
    print(f"  Mis à jour : {n_updated}")
    print(f"  Erreurs : {n_errors}")
    print("─" * 50)


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("ffme_sne.json")
    import_json(path)
