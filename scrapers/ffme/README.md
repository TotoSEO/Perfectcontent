# FFME SNE — Pipeline de scraping

Pipeline pour constituer une base PostgreSQL des **Sites Naturels d'Escalade** recensés par la FFME (`https://www.ffme.fr/sne-fiche/{ID}/`).

## Contenu

| Fichier                  | Rôle                                                            |
|--------------------------|-----------------------------------------------------------------|
| `ffme_sne_scraper.py`    | Scraper (déjà validé). Produit `ffme_sne.json` et `ffme_sne.csv`. |
| `schema.sql`             | Schéma PostgreSQL (avec PostGIS optionnel).                     |
| `import_to_db.py`        | Lecture du JSON → upsert dans `sites_naturels` (idempotent).    |
| `verify.sql`             | Requêtes de contrôle post-import.                               |
| `requirements.txt`       | Dépendances Python.                                             |
| `.env.example`           | Variables d'environnement pour la connexion DB.                 |

## Installation

```bash
cd scrapers/ffme
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # éditer avec tes credentials Postgres
```

## Étape 1 — Scraping

```bash
python ffme_sne_scraper.py
```

- Plage par défaut : IDs `1` à `4000`.
- Stop automatique après **80 IDs vides consécutifs**.
- Délais aléatoires `1.2s` → `2.8s` entre requêtes. **Ne pas les réduire.**
- Durée estimée : ~2h pour ~3500 IDs.
- En cas d'interruption : relancer. L'import en aval est idempotent.

Pour un test sur échantillon (IDs 1 → 500), modifier `ID_END = 500` en tête du script.

## Étape 2 — Base PostgreSQL

```bash
createdb escalade
psql -d escalade -f schema.sql
```

PostGIS est optionnel. S'il est dispo, la colonne `geom` (`GEOMETRY(Point, 4326)`) est peuplée automatiquement à l'import.

## Étape 3 — Import

```bash
python import_to_db.py             # lit ./ffme_sne.json par défaut
# ou
python import_to_db.py /chemin/vers/ffme_sne.json
```

Sortie : `Insérés / Mis à jour / Erreurs`.

## Étape 4 — Vérification

```bash
psql -d escalade -f verify.sql
```

## Schéma — points-clés

- **`commune`** est nettoyée (sans la parenthèse) ; `departement` (`"Haute-Savoie"`) et `code_departement` (`"74"`) sont extraits via regex.
- **`periodes_favorables`** est un `TEXT[]` (`{Juin,Juillet,Août}`).
- **`bibliographie`** est un `TEXT[]`.
- **`derniere_mise_a_jour`** est un `DATE` (parsé depuis `"Le 11/03/2010"`).
- **`secteur_decouverte`** est un `BOOLEAN` (`Oui` → `true`).
- **`champs_extras`** (JSONB) est le filet de sécurité : tout label dynamique non mappé y atterrit, donc rien n'est perdu si la FFME ajoute un champ.
- **`ON CONFLICT (id) DO UPDATE`** : on peut rejouer l'import à volonté.

## Notes

- Le scraper est **réutilisable** : on pourra adapter le même pattern pour scraper d'autres sources (annuaire de salles indoor, etc.) en gardant la même séparation `scraper → JSON → import_to_db`.
- Pour exposer la base via API (FastAPI, Next.js API routes, …), brancher directement sur la table `sites_naturels` — indexée sur `commune`, `departement`, `massif`, `cotation_min/max`, `latitude/longitude` (et `geom` GIST si PostGIS).
