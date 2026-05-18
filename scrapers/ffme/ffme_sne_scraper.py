"""
FFME SNE Scraper v2 — Sites Naturels d'Escalade
================================================
Scrape toutes les fiches SNE : https://www.ffme.fr/sne-fiche/{ID}/

Stratégie de parsing :
  - Approche DYNAMIQUE : tous les labels présents sont capturés,
    quelle que soit leur présence ou absence sur la fiche.
  - Champs fixes : id, url, nom, latitude, longitude, coords_parking,
    bibliographie, suricate_url, contact_gestionnaire_url.
  - Champs dynamiques : tout label/valeur trouvé → stocké dans `champs`
    (dict JSON) ET remonté à plat dans le CSV.

Validé sur :
  - ID 2315 : Petit Bargy     (tous champs, hauteurs, cotations, biblio)
  - ID 1988 : Saint-Antonin   (champs partiels, réglementation particulière)

Usage :
    pip install requests beautifulsoup4 lxml tqdm
    python ffme_sne_scraper.py

Sorties :
    ffme_sne.json  — une entrée par site, champs dynamiques dans "champs"
    ffme_sne.csv   — aplati : une colonne par label distinct rencontré
"""

import re
import json
import csv
import time
import random
import logging
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Optional

import requests
from bs4 import BeautifulSoup, NavigableString
from tqdm import tqdm

# ─────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────
BASE_URL  = "https://www.ffme.fr/sne-fiche/{id}/"
ID_START  = 1
ID_END    = 4000
DELAY_MIN = 1.2
DELAY_MAX = 2.8
TIMEOUT   = 12
MAX_EMPTY_STREAK = 80

OUTPUT_JSON = Path("ffme_sne.json")
OUTPUT_CSV  = Path("ffme_sne.csv")
LOG_FILE    = Path("ffme_sne.log")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.ffme.fr/",
}

LABELS_IGNORE = {
    "signaler un problème",
    "signaler au gestionnaire du site",
    "fiches",
    "actus",
}

# ─────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────
def slug(label: str) -> str:
    import unicodedata
    s = label.lower().strip().rstrip(":")
    # Translittération des accents (é→e, è→e, ç→c, etc.)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[''´`']", "_", s)
    s = re.sub(r"[\s\-/()]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def get_next_p(label_div) -> str:
    sibling = label_div.next_sibling
    while sibling:
        if isinstance(sibling, NavigableString):
            sibling = sibling.next_sibling
            continue
        if sibling.name == "p":
            return sibling.get_text(separator=" ", strip=True)
        if sibling.name == "div":
            return ""
        sibling = sibling.next_sibling
    return ""


# ─────────────────────────────────────────
# DATA MODEL
# ─────────────────────────────────────────
@dataclass
class SNE:
    id: int
    url: str
    nom: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    parking1_lat: Optional[float] = None
    parking1_lon: Optional[float] = None
    parking2_lat: Optional[float] = None
    parking2_lon: Optional[float] = None
    suricate_url: str = ""
    contact_gestionnaire_url: str = ""
    bibliographie: list = field(default_factory=list)
    champs: dict = field(default_factory=dict)


# ─────────────────────────────────────────
# PARSING
# ─────────────────────────────────────────
def parse_page(html: str, sne_id: int, url: str) -> Optional[SNE]:
    soup = BeautifulSoup(html, "lxml")

    main = soup.find("div", class_="single-content")
    if not main:
        return None

    inner = main.find("div", class_="content")
    if inner:
        inner = inner.find("div", class_="content")
    if not inner:
        return None

    h1 = inner.find("h1", class_="title")
    if not h1 or not h1.get_text(strip=True):
        return None

    sne = SNE(id=sne_id, url=url, nom=h1.get_text(strip=True))

    for label_div in inner.find_all("div", class_="label"):
        label_raw = label_div.get_text(separator=" ", strip=True)

        if any(ign in label_raw.lower() for ign in LABELS_IGNORE):
            continue

        # Type de site (valeur dans <strong> à l'intérieur du label)
        if label_raw.lower().startswith("type"):
            strong = label_div.find("strong")
            if strong:
                sne.champs["type_site"] = strong.get_text(strip=True)
            continue

        # Nombre de voies + cotations optionnelles
        if "nombre de voies" in label_raw.lower():
            m = re.search(r":\s*(\d+)", label_raw)
            sne.champs["nombre_voies"] = m.group(1) if m else "0"
            next_p = label_div.find_next_sibling("p")
            if next_p:
                cot = next_p.get_text(separator=" ", strip=True)
                m2 = re.search(r"De\s+(\S+)\s+\S+\s+(\S+)", cot)
                if m2:
                    sne.champs["cotation_min"] = m2.group(1)
                    sne.champs["cotation_max"] = m2.group(2)
            continue

        # Informations sur la falaise (multi-<p>)
        if "informations sur la falaise" in label_raw.lower():
            sibling = label_div.next_sibling
            infos = []
            while sibling:
                if isinstance(sibling, NavigableString):
                    sibling = sibling.next_sibling
                    continue
                if sibling.name == "p":
                    txt = sibling.get_text(strip=True)
                    if txt:
                        infos.append(txt)
                        m_min = re.search(r"minimale\s*:\s*(\d+)", txt, re.I)
                        m_max = re.search(r"maximale\s*:\s*(\d+)", txt, re.I)
                        if m_min:
                            sne.champs["hauteur_min_m"] = m_min.group(1)
                        if m_max:
                            sne.champs["hauteur_max_m"] = m_max.group(1)
                    sibling = sibling.next_sibling
                elif sibling.name == "div":
                    break
                else:
                    sibling = sibling.next_sibling
            if infos:
                sne.champs["informations_falaise"] = " | ".join(infos)
            continue

        # Période favorable (liste <br>)
        if "riode favorable" in label_raw.lower():
            next_p = label_div.find_next_sibling("p")
            if next_p:
                mois = [t.strip() for t in next_p.get_text(separator="\n").splitlines() if t.strip()]
                sne.champs["periodes_favorables"] = ", ".join(mois)
            continue

        # Cas général : slug du label → valeur dans <p> suivant
        key = slug(label_raw)
        if not key:
            continue
        val = get_next_p(label_div)
        if val:
            sne.champs[key] = val

    # Coordonnées GPS
    m = re.search(r'var\s+sne_localisation\s*=\s*(\{[^}]+\})', html)
    if m:
        try:
            geo = json.loads(m.group(1))
            lat = geo.get("SNE_LATITUDE", "")
            lon = geo.get("SNE_LONGITUDE", "")
            if lat and lat not in ("0", ""):
                sne.latitude = float(lat)
            if lon and lon not in ("0", ""):
                sne.longitude = float(lon)
            for attr, key in [
                ("parking1_lat", "SNE_PARKING1_LATITUDE"),
                ("parking1_lon", "SNE_PARKING1_LONGITUDE"),
                ("parking2_lat", "SNE_PARKING2_LATITUDE"),
                ("parking2_lon", "SNE_PARKING2_LONGITUDE"),
            ]:
                v = geo.get(key, "")
                if v and v not in ("0", ""):
                    try:
                        setattr(sne, attr, float(v))
                    except ValueError:
                        pass
        except (json.JSONDecodeError, ValueError):
            pass

    # Liens Suricate et gestionnaire
    suricate = inner.find("a", class_="link_alert", href=re.compile("suricate|sportsdenature", re.I))
    if suricate:
        sne.suricate_url = suricate.get("href", "")

    gestionnaire = inner.find("a", class_="link_alert", href=re.compile("montagne-escalade", re.I))
    if gestionnaire:
        sne.contact_gestionnaire_url = gestionnaire.get("href", "")

    # Bibliographie
    biblio_h2 = inner.find("h2", string=re.compile(r"bibliographie", re.I))
    if biblio_h2:
        biblio_div = biblio_h2.find_next_sibling("div")
        if biblio_div:
            sne.bibliographie = [a.get_text(strip=True) for a in biblio_div.find_all("a")]

    return sne


# ─────────────────────────────────────────
# SCRAPER
# ─────────────────────────────────────────
def scrape_all(id_start: int, id_end: int) -> list[SNE]:
    session = requests.Session()
    session.headers.update(HEADERS)
    results: list[SNE] = []
    empty_streak = 0

    for sne_id in tqdm(range(id_start, id_end + 1), desc="FFME SNE"):
        url = BASE_URL.format(id=sne_id)
        try:
            resp = session.get(url, timeout=TIMEOUT)
            if resp.status_code == 404:
                empty_streak += 1
            elif resp.status_code == 200:
                sne = parse_page(resp.text, sne_id, url)
                if sne:
                    results.append(sne)
                    empty_streak = 0
                    commune = sne.champs.get("commune", "")
                    log.debug(f"✓ {sne_id:04d} — {sne.nom} ({commune})")
                else:
                    empty_streak += 1
            else:
                log.warning(f"  {sne_id:04d} — HTTP {resp.status_code}")
                empty_streak += 1
        except requests.RequestException as e:
            log.error(f"  {sne_id:04d} — {e}")
            empty_streak += 1

        if empty_streak >= MAX_EMPTY_STREAK:
            log.info(f"→ {MAX_EMPTY_STREAK} IDs vides consécutifs, arrêt à {sne_id}.")
            break

        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

    return results


# ─────────────────────────────────────────
# EXPORTS
# ─────────────────────────────────────────
def save_json(data: list[SNE], path: Path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump([asdict(s) for s in data], f, ensure_ascii=False, indent=2)
    log.info(f"JSON → {path}  ({len(data)} sites)")


def save_csv(data: list[SNE], path: Path):
    if not data:
        return
    fixed_cols = [
        "id", "url", "nom",
        "latitude", "longitude",
        "parking1_lat", "parking1_lon",
        "parking2_lat", "parking2_lon",
        "suricate_url", "contact_gestionnaire_url",
        "bibliographie",
    ]
    dynamic_keys: list[str] = []
    seen: set[str] = set()
    for sne in data:
        for k in sne.champs.keys():
            if k not in seen:
                dynamic_keys.append(k)
                seen.add(k)

    all_cols = fixed_cols + dynamic_keys
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_cols, extrasaction="ignore")
        writer.writeheader()
        for sne in data:
            row = {
                "id":           sne.id,
                "url":          sne.url,
                "nom":          sne.nom,
                "latitude":     sne.latitude  or "",
                "longitude":    sne.longitude or "",
                "parking1_lat": sne.parking1_lat or "",
                "parking1_lon": sne.parking1_lon or "",
                "parking2_lat": sne.parking2_lat or "",
                "parking2_lon": sne.parking2_lon or "",
                "suricate_url": sne.suricate_url,
                "contact_gestionnaire_url": sne.contact_gestionnaire_url,
                "bibliographie": " | ".join(sne.bibliographie),
            }
            row.update(sne.champs)
            writer.writerow(row)
    log.info(f"CSV  → {path}  ({len(dynamic_keys)} champs dynamiques découverts)")


# ─────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────
if __name__ == "__main__":
    log.info(f"Démarrage — IDs {ID_START} → {ID_END}")
    sites = scrape_all(ID_START, ID_END)
    log.info(f"\n{'='*50}")
    log.info(f"  {len(sites)} sites naturels d'escalade récupérés")
    log.info(f"{'='*50}\n")
    save_json(sites, OUTPUT_JSON)
    save_csv(sites, OUTPUT_CSV)
    log.info("Terminé.")
