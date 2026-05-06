// Map a category id + an issue row → a concrete recommendation written for
// the SEO consultant's client deliverable. Used by the Excel exporter.

import type { IssueRow } from "./types";

const HTTP: Record<string, string> = {
  default: "Identifier la source de l'erreur côté serveur ou config Nginx/Apache, corriger le code de retour ou rediriger vers une URL valide.",
};

function pillarHttp(row: IssueRow): string {
  const code = Number(row.status_code || 0);
  if (code >= 500) return "Erreur serveur. Vérifier les logs applicatifs / hébergeur, corriger l'origine et purger la page de tout maillage interne tant qu'elle ne répond pas.";
  if (code === 404) return "Page introuvable. Soit la republier, soit poser une redirection 301 vers la page la plus pertinente, et retirer les liens internes pointant vers cette URL.";
  if (code === 410) return "Page volontairement supprimée. Confirmer le statut ou rediriger en 301 si une page successeur existe.";
  if (code === 403) return "Accès refusé. Vérifier les règles d'authentification / pare-feu — Googlebot doit pouvoir crawler l'URL.";
  if (code === 302) return "Remplacer la 302 (temporaire) par une 301 (permanente) pour transmettre le PageRank correctement.";
  if (code >= 300 && code < 400) return "Mettre à jour les liens internes pour pointer directement vers l'URL finale ; retirer la chaîne de redirection.";
  return HTTP.default;
}

function indexability(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  const inlinks = Number(row.inlinks || 0);
  if (reason.includes("noindex") || reason.includes("non-index")) {
    if (inlinks > 0) return "Page noindex avec liens entrants. Soit la rendre indexable (retirer la balise noindex) si elle a une valeur SEO, soit retirer les liens internes pour ne pas gaspiller de budget crawl.";
    return "Page noindex sans liens entrants. Vérifier qu'elle est bien volontairement exclue (panier, compte, filtre).";
  }
  if (reason.includes("robots") || reason.includes("bloqu")) return "Page bloquée par robots.txt. Si elle doit être indexée, autoriser le crawl ; si elle est confidentielle, ajouter aussi un noindex côté HTML.";
  if (reason.includes("canonical") || reason.includes("canonis")) return "Page canonicalisée vers une autre URL. Vérifier que la cible est bien la version maîtresse, sinon supprimer le canonical incorrect.";
  if (reason.includes("redirect") || reason.includes("redirig")) return "Page redirigée. Mettre à jour les liens internes pour pointer directement vers l'URL finale.";
  return "Vérifier la raison de non-indexation et statuer (la rendre indexable, la retirer du maillage, ou confirmer qu'elle doit rester non-indexée).";
}

function titlesIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("manquant")) return "Ajouter un title unique de 50-60 caractères, mot-clé principal en début, ton clair sans clickbait.";
  if (reason.includes("duplique") || reason.includes("dupliqu")) return "Réécrire le title pour qu'il soit unique sur le site. Chaque page mérite un angle distinct.";
  if (reason.includes("trop long")) return "Raccourcir à 50-60 caractères. Au-delà, Google tronque dans les SERP — l'info clé doit être dans les 60 premiers caractères.";
  if (reason.includes("trop court")) return "Étoffer le title à 50-60 caractères pour mieux ressortir en SERP. Ajouter le bénéfice principal ou un qualificatif différenciant.";
  return "Optimiser le title (50-60 caractères, mot-clé en début, unique).";
}

function metaIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("manquant")) return "Rédiger une meta description de 140-160 caractères qui répond presque au title et invite à cliquer (verdict + invitation).";
  if (reason.includes("duplique") || reason.includes("dupliqu")) return "Réécrire la meta pour qu'elle soit unique. Chaque page = un angle de description différent.";
  if (reason.includes("trop long")) return "Tronquer à 140-160 caractères ; Google coupe au-delà.";
  if (reason.includes("trop court")) return "Allonger jusqu'à 140-160 caractères en ajoutant le verdict et un appel à l'action implicite.";
  return "Optimiser la meta description (140-160 caractères, unique, orientée bénéfice).";
}

function h1Issue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("manquant")) return "Ajouter un H1 clair en haut de page, qui contient le mot-clé principal et reflète l'angle du title.";
  if (reason.includes("multiple")) return "Garder un seul H1 par page. Convertir les autres en H2 (ou supprimer s'ils sont décoratifs comme un logo).";
  if (reason.includes("duplique") || reason.includes("dupliqu")) return "Réécrire le H1 pour qu'il soit unique. Deux pages avec le même H1 = signal de cannibalisation.";
  return "Vérifier la structure du H1 (un seul, clair, contenant le mot-clé).";
}

function depthIssue(row: IssueRow): string {
  const depth = Number(row.depth || 0);
  if (depth >= 7) return `Page à profondeur ${depth} : la rapprocher d'au moins 3 niveaux via des liens depuis la home, une catégorie pilier ou un menu transversal. Au-delà de la profondeur 4, Google a du mal à crawler et le PageRank transmis chute fortement.`;
  return `Page à profondeur ${depth} : ajouter des liens depuis des pages plus accessibles (idéalement la home, ou un hub de catégorie) pour la ramener à 3-4 clics maximum.`;
}

function linkingIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("orphelin")) return "Page orpheline (0 lien entrant). Ajouter des liens depuis des pages pertinentes du site (catégorie, articles voisins, footer thématique). Sans liens internes, Google ne la voit pas.";
  if (reason.includes("0 outlinks") || reason.includes("cul-de-sac")) return "Page cul-de-sac (aucun lien sortant). Ajouter 2-4 liens contextuels vers des pages liées du site pour aider la circulation du PageRank et l'utilisateur.";
  return "Améliorer le maillage interne (équilibrer inlinks et outlinks, contextuels).";
}

function canonicalIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("home")) return "Canonical pointant vers la home : red flag majeur, Google ignore complètement la page. Pointer vers la page elle-même (self-canonical) ou retirer la balise.";
  if (reason.includes("different")) return "Canonical différent de l'URL de la page. Vérifier que la cible est bien la version maîtresse ; si la page DOIT être indexée, mettre un self-canonical à la place.";
  return "Auditer la balise canonical : self-canonical par défaut, croisée seulement vers la version maîtresse explicite.";
}

function imageIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("cass")) return "Image cassée. Republier le fichier ou retirer la référence du HTML. Casse l'expérience utilisateur ET le score Core Web Vitals.";
  if (reason.includes("très lourde") || reason.includes("tres lourde")) return "Image > 1 Mo : ralentit fortement le LCP. Compresser (WebP / AVIF), redimensionner à la taille réelle d'affichage, et activer le lazy-loading.";
  if (reason.includes("lourde")) return "Image > 500 Ko : compresser au format WebP (ou AVIF si stack moderne), redimensionner à la taille d'affichage réelle. Cible : < 200 Ko par visuel.";
  return "Optimiser le poids de l'image (compression + format moderne).";
}

function urlIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  if (reason.includes("http") && !reason.includes("https")) return "URL en HTTP. Forcer HTTPS via redirection 301 + HSTS. Google déclasse les pages non-HTTPS et les navigateurs alertent.";
  if (reason.includes("trop longue")) return "URL > 100 caractères. Pour les nouvelles pages, viser des slugs courts, sans stop-words. Sur les URLs existantes : ne PAS modifier (ça créerait des 404), garder en mémoire pour la prochaine refonte.";
  if (reason.includes("query")) return "URL avec query string. Si possible, réécrire en URL propre (rewrite côté serveur). Sinon ajouter un canonical vers la version sans paramètres.";
  return "Optimiser la structure de l'URL (HTTPS, courte, sans query string).";
}

function contentIssue(row: IssueRow): string {
  const reason = String(row.reason || "").toLowerCase();
  const wc = Number(row.word_count || 0);
  if (reason.includes("léger") || reason.includes("leger")) {
    return `Contenu trop léger (${wc} mots). Enrichir la page : étoffer les sections existantes, ajouter une FAQ, intégrer un comparatif ou un cas concret. Cible 800-1500 mots minimum selon le type de page.`;
  }
  if (reason.includes("très long") || reason.includes("tres long")) {
    return `Contenu très long (${wc} mots). OK si le sujet le justifie ; sinon découper en plusieurs pages thématiques avec un pillar + clusters maillés.`;
  }
  return "Auditer le volume de contenu par rapport aux concurrents en SERP.";
}

const RESOLVERS: Record<string, (row: IssueRow) => string> = {
  http: pillarHttp,
  indexability,
  titles: titlesIssue,
  meta: metaIssue,
  h1: h1Issue,
  depth: depthIssue,
  linking: linkingIssue,
  canonicals: canonicalIssue,
  images: imageIssue,
  urls: urlIssue,
  content: contentIssue,
};

export function recommendFor(categoryId: string, row: IssueRow): string {
  const r = RESOLVERS[categoryId];
  if (!r) return "Investiguer le problème et appliquer le correctif standard SEO associé.";
  return r(row);
}
