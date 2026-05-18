// Static recommendation snippets per audit subcategory. The viewer shows the
// recommendations slide at the end of each section. The XLSX also embeds a
// concrete per-row solution via `recommendFor` in lib/audit/solutions.ts.

export type RecoGroup = {
  sub_label: string;     // "Robots.txt & sitemap" — matches the slide title
  items: string[];       // 3-5 actionable bullets
};

export const RECO_INDEXABILITY_CRAWL: RecoGroup[] = [
  {
    sub_label: "Robots.txt & sitemap",
    items: [
      "Servir un robots.txt à la racine (toujours en HTTP 200), même minimal — laisse Google découvrir le site sans deviner.",
      "Référencer le sitemap dans le robots.txt via `Sitemap: https://…` : c'est la première chose que les crawlers regardent.",
      "Vérifier qu'aucune zone stratégique (catégories, articles, pages produits) n'est bloquée par un Disallow trop large.",
      "Fournir un sitemap XML à jour (auto-régénéré), avec uniquement les URLs canoniques en 200, sans pages noindex.",
      "Surveiller les doublons dans le sitemap : chaque URL ne doit y figurer qu'une fois.",
    ],
  },
  {
    sub_label: "Profondeur des pages",
    items: [
      "Ramener les pages stratégiques à 3 clics maximum depuis la home, via le menu, des hubs catégorie ou un footer thématique.",
      "Pour les pages > profondeur 5, ajouter un lien direct depuis une page très visitée (home, catégorie pilier).",
      "Ne pas multiplier les pages de pagination profonde : utiliser load-more ou des filtres pertinents.",
      "Auditer trimestriellement la profondeur — une catégorie en croissance enterre vite ses anciennes pages.",
    ],
  },
  {
    sub_label: "Détails codes HTTP",
    items: [
      "Corriger toutes les 404 internes en priorité : soit republier la page, soit poser une 301 vers la cible la plus pertinente.",
      "Remplacer les 302 par des 301 pour les redirections définitives — la 302 ne transmet pas le PageRank correctement.",
      "Mettre à jour les liens internes pour pointer directement vers l'URL finale (éviter les chaînes de redirection).",
      "Investiguer toute 5xx persistante côté logs serveur : c'est un signal de fragilité qui freine le crawl.",
    ],
  },
  {
    sub_label: "Erreurs hreflang",
    items: [
      "Pour chaque page multilingue, déclarer une balise hreflang vers chaque version linguistique, **+ une auto-référence** vers elle-même.",
      "Ajouter une balise `x-default` pointant vers la version par défaut (généralement la page de sélection de langue ou la home).",
      "Vérifier la cohérence return-tag : si page A déclare B, alors B doit déclarer A en retour.",
      "Aucune URL référencée en hreflang ne doit renvoyer une 3xx/4xx — toutes les cibles doivent être en 200 indexables.",
    ],
  },
  {
    sub_label: "URLs sans canonical",
    items: [
      "Définir une balise canonical sur **toutes les pages indexables**, même si elle pointe sur elle-même (self-canonical).",
      "Pour les pages avec paramètres (?utm=…, filtres), pointer le canonical vers la version propre sans paramètre.",
      "Ne JAMAIS pointer plusieurs pages vers la home comme canonical — c'est un red flag majeur.",
      "Vérifier que la cible canonical est bien en 200 indexable, sinon la balise est ignorée par Google.",
    ],
  },
  {
    sub_label: "Fichier LLMS.TXT",
    items: [
      "Créer un fichier `llms.txt` à la racine du site (https://votresite.com/llms.txt) au format Markdown.",
      "Y lister les pages-clés du site (page d'accueil, pages services, articles piliers) avec une courte description par lien.",
      "Garder le fichier court (idéalement < 100 lignes) — l'objectif est d'orienter les IA, pas de tout dupliquer.",
      "Optionnel : ajouter un `llms-full.txt` plus détaillé pour les IA qui veulent plus de contexte.",
      "Mettre à jour tous les 1-2 mois en fonction des nouveautés du site.",
    ],
  },
];

export const RECO_PERFORMANCE: RecoGroup[] = [
  {
    sub_label: "Temps de chargement",
    items: [
      "TTFB cible : < 0,6 s. Au-delà, optimiser le backend (cache page, CDN edge, requêtes DB) ou le mutualisé devient un frein.",
      "Activer un cache HTTP côté CDN (Cloudflare, Fastly, Vercel Edge) pour les pages statiques — gain immédiat de plusieurs centaines de ms.",
      "Pour les pages dynamiques : précalculer / mettre en cache fragments lourds (header, listes, recommandations).",
      "Mesurer aussi en p75 et p95 — la moyenne masque les pics qui pénalisent vraiment le crawl et l'expérience.",
    ],
  },
  {
    sub_label: "Poids des pages HTML (limite 2 Mo Googlebot)",
    items: [
      "Compresser le HTML servi (gzip / brotli) — un HTML de 800 Ko peut tomber à 80-100 Ko transférés.",
      "Externaliser le CSS et JS — un bon HTML pèse < 100 Ko hors images. Au-delà, Googlebot risque la troncature à 2 Mo.",
      "Limiter les attributs `data-*`, les JSON-LD volumineux, et le contenu invisible (modales, tabs masqués) inline dans le HTML.",
      "Supprimer les commentaires HTML et les espaces inutiles (minification) — gain de 5-15% en production.",
    ],
  },
];

export const RECO_META: RecoGroup[] = [
  {
    sub_label: "Balises title & meta description",
    items: [
      "Title : 50-60 caractères, mot-clé principal en début, ton clair, unique sur le site, différent du H1.",
      "Meta description : 140-160 caractères, verdict + invitation à cliquer (le bénéfice principal de la page).",
      "Surveiller les pixels (pas juste les caractères) : Google tronque à ~561px sur title, ~985px sur meta.",
      "Aucune page indexable ne doit avoir un title vide : c'est la première chose que Google et les utilisateurs voient.",
    ],
  },
  {
    sub_label: "Titles en double",
    items: [
      "Chaque page indexable doit avoir un title unique. Deux titles identiques = signal de cannibalisation.",
      "Pour les listings paginés, ajouter `— Page 2` au title : Google traite chaque page de pagination distinctement.",
      "Pour les filtres / facettes générant des doublons, soit canonicaliser vers la version sans filtre, soit générer des titles distincts.",
    ],
  },
  {
    sub_label: "Meta descriptions en double",
    items: [
      "Réécrire chaque meta unique avec un angle distinct — même la meta n'a pas d'impact direct sur le ranking, le CTR oui.",
      "Si vraiment impossible (catalogue produits massif), accepter la duplication mais marquer les pages comme alternative via canonical.",
      "Pour gagner du temps : générer des metas dynamiques à partir du nom du produit + bénéfice principal + CTA implicite.",
    ],
  },
  {
    sub_label: "H1 en double",
    items: [
      "Un seul H1 par page, unique sur le site, différent du title (le title accroche en SERP, le H1 confirme le sujet sur la page).",
      "Si plusieurs pages partagent le même H1, soit la stratégie de pages est à revoir (cannibalisation), soit il faut différencier l'angle.",
      "Pour les pages générées (catalogue, tags), intégrer une variable distinguant chaque page (lieu, marque, catégorie).",
    ],
  },
];

export const RECO_STRUCTURE: RecoGroup[] = [
  {
    sub_label: "Structures Hn en erreur",
    items: [
      "Une page = un H1 (titre principal), des H2 pour les sections, des H3 pour les sous-sections, et ainsi de suite.",
      "Pas de H1 ou plusieurs H1 = signal de page mal structurée. Le H1 doit refléter clairement le sujet.",
      "Garder les H1 et H2 lisibles : < 70 caractères chacun, formulation parlante (pas du jargon technique).",
    ],
  },
  {
    sub_label: "Sauts de hiérarchie H2",
    items: [
      "Respecter l'ordre : H1 → H2 → H3 → H4. Ne pas passer d'un H2 directement à un H4.",
      "Les sauts de hiérarchie cassent l'accessibilité (lecteurs d'écran) et perturbent la compréhension du contenu par Google.",
      "Vérifier que les niveaux de titre sont utilisés sémantiquement, pas pour le style visuel — utiliser le CSS pour ça.",
    ],
  },
];

export const RECO_LINKING: RecoGroup[] = [
  {
    sub_label: "Maillage interne global",
    items: [
      "Chaque page importante doit recevoir au moins 3-5 liens internes contextuels (hors menu/footer) pour signaler son importance.",
      "Privilégier le maillage contextuel (dans le contenu rédactionnel) : un lien dans un paragraphe transmet plus de signal qu'un lien dans le footer.",
      "Construire des silos thématiques : chaque article d'un cluster doit lier la page pilier et 2-3 articles voisins du même thème.",
    ],
  },
  {
    sub_label: "Liens internes / externes rompus",
    items: [
      "Pour chaque lien interne 404 : remplacer par l'URL la plus pertinente, ou retirer le lien si la cible n'a pas de successeur logique.",
      "Pour les liens externes cassés : retirer (si l'info était secondaire) ou remplacer par une source équivalente vivante.",
      "Mettre en place un check automatisé mensuel (Screaming Frog ou crawl programmé) pour détecter les nouvelles ruptures.",
    ],
  },
  {
    sub_label: "Pages sans / avec peu de liens entrants (hors navigation)",
    items: [
      "Identifier les pages orphelines de valeur : leur ajouter 2-3 liens contextuels depuis des pages thématiquement proches.",
      "Si une page n'a aucun lien sortant, ajouter 2-4 liens contextuels vers des pages utiles pour le lecteur.",
      "Auditer le footer / méga-menu : trop de liens dilue le signal — viser des hubs thématiques plutôt qu'un footer exhaustif.",
    ],
  },
  {
    sub_label: "Texte des ancres",
    items: [
      "Diversifier les ancres pour chaque page de destination : éviter de toujours lier la même page avec la même ancre exacte (sur-optimisation).",
      "Bannir les ancres génériques type \"cliquez ici\", \"en savoir plus\", \"lire la suite\" : préférer une formulation descriptive du contenu cible.",
      "Pour les pages très linkées avec une ancre exacte > 70%, varier en mixant marque + sujet + variantes sémantiques.",
      "Aucune ancre ne doit être vide : si on lie une image, renseigner son `alt` ; si on lie un texte, donner une formulation parlante.",
    ],
  },
];

export const RECO_IMAGES: RecoGroup[] = [
  {
    sub_label: "Images sans alt text",
    items: [
      "Ajouter un attribut `alt` descriptif à chaque image porteuse de sens : c'est obligatoire pour l'accessibilité et utile au SEO image.",
      "Pour les images purement décoratives (icônes UI), utiliser `alt=\"\"` (vide explicite) — c'est sémantiquement correct.",
      "L'alt doit décrire ce que voit l'utilisateur, pas \"image de…\". Exemple : `alt=\"Camion de déménagement vide intérieur cuisine\"` plutôt que `alt=\"camion\"`.",
    ],
  },
  {
    sub_label: "Images sans attributs width/height (impact CLS)",
    items: [
      "Toujours déclarer `width` et `height` sur chaque `<img>` pour réserver l'espace au navigateur avant le chargement.",
      "Sans ces attributs, le contenu de la page saute au moment où l'image charge → CLS dégradé (Core Web Vitals).",
      "Si la taille varie selon l'écran, utiliser CSS `aspect-ratio` ou `srcset` + `sizes` — Google gère parfaitement le responsive sur images.",
    ],
  },
  {
    sub_label: "Poids des images",
    items: [
      "Compresser et convertir au format WebP ou AVIF — gain typique de 30-50% par rapport à JPEG/PNG, sans perte visible.",
      "Redimensionner à la taille d'affichage réelle : une image de 4000×3000 affichée à 600×400 est un gaspillage de bande passante.",
      "Activer le lazy-loading (`loading=\"lazy\"`) sur toutes les images hors écran initial — gain immédiat sur LCP.",
      "Cible : aucune image > 200 Ko en production. Images héros : tolérance jusqu'à 300 Ko si non compressibles.",
    ],
  },
];

export function recosForSection(sectionId: string): RecoGroup[] {
  switch (sectionId) {
    case "indexability_crawl": return RECO_INDEXABILITY_CRAWL;
    case "performance":        return RECO_PERFORMANCE;
    case "meta":               return RECO_META;
    case "structure":          return RECO_STRUCTURE;
    case "linking":            return RECO_LINKING;
    case "images":             return RECO_IMAGES;
    default:                   return [];
  }
}
