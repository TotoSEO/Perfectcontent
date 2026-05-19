// Slide explanatory texts — sourced verbatim from the user's spec so the
// terminology is consistent with their other deliverables.
// Updating these texts only requires editing this file; nothing else.

export const DESC = {
  robots_sitemap: `Le robots.txt indique aux robots des moteurs de recherche quelles zones du site ils peuvent crawler. Mal configuré, il peut bloquer accidentellement des pages stratégiques. Le sitemap XML, lui, recense les URLs à indexer et leur fournit des métadonnées (date de dernière modification, priorité). Une bonne reco SEO : référencer le sitemap directement depuis le robots.txt — ça permet aux moteurs de le découvrir instantanément.`,

  depth: `La profondeur correspond au nombre de clics nécessaires pour atteindre une page depuis la page d'accueil. Plus une page est profonde, moins elle reçoit de jus SEO et moins elle sera crawlée fréquemment par Googlebot. Idéalement, les pages stratégiques doivent être accessibles en 3 clics maximum.`,

  http_codes: `Les codes HTTP indiquent l'état de chaque URL crawlée. Les redirections 301/302 diluent le jus SEO à chaque saut, les 404 créent des impasses pour les robots et les utilisateurs, les 500 signalent des erreurs serveur. Chaque code non-200 sur une page stratégique est un problème à corriger.`,

  hreflang: `Les balises hreflang indiquent à Google quelle version linguistique ou régionale d'une page servir à quel utilisateur. Une erreur hreflang peut provoquer l'affichage de la mauvaise version dans les résultats, ou une indexation incohérente entre les versions du site.`,

  canonical: `La balise canonical indique à Google quelle est la version de référence d'une page. Sans canonical, Google décide seul quelle URL indexer, ce qui peut engendrer du contenu dupliqué, une dilution du PageRank et des problèmes d'indexation sur les URLs avec paramètres.`,

  llms_txt: `Le llms.txt est un fichier Markdown placé à la racine du site, conçu pour guider les IA génératives (ChatGPT, Perplexity, Gemini, Claude) vers les pages les plus importantes d'un site. C'est l'équivalent du robots.txt, mais à destination des LLMs : contrairement au robots.txt qui régit les moteurs de recherche classiques, le llms.txt est spécifiquement pensé pour les crawlers d'intelligence artificielle. Il s'inscrit dans le GEO (Generative Engine Optimization), le référencement de demain.\n\nSa mise en place est rapide et sans risque, et positionne le site en avance sur une pratique qui devrait se standardiser : plus de 844 000 sites l'ont déjà adopté, dont Anthropic, Cloudflare, Stripe et Perplexity.`,

  llms_txt_callout: `Aucune étude n'a pour l'instant prouvé de corrélation directe entre la présence d'un llms.txt et une meilleure visibilité dans les réponses IA. C'est une recommandation exploratoire, qui peut éventuellement contribuer à gagner en visibilité auprès des moteurs IA, mais sans garantie à ce stade.`,

  response_time: `Le temps de chargement mesuré ici correspond au temps de réponse serveur (TTFB), c'est-à-dire le délai avant réception du premier octet. C'est un indicateur de la réactivité du serveur, à distinguer des Core Web Vitals qui mesurent l'expérience de chargement côté utilisateur. Un TTFB élevé pénalise le crawl et l'expérience utilisateur.`,

  html_weight: `Depuis février 2026, Google a officialisé que Googlebot ne lit que les 2 premiers Mo d'un fichier HTML pour l'indexation. Au-delà, le contenu est tronqué : liens internes, données structurées, mots-clés en bas de page peuvent être ignorés. Cette limite concerne le fichier HTML seul, pas le poids total de la page avec ses ressources.`,

  titles_meta: `La balise title est le titre de la page tel qu'il apparaît dans les résultats Google. Elle doit être unique, différente du H1, et comprise entre 52 et 65 caractères. La meta description est le résumé affiché sous le titre dans les SERPs. Elle n'est pas un facteur de ranking direct mais impacte le taux de clic. Longueur idéale : entre 130 et 155 caractères.`,

  titles_duplicate: `Deux pages avec le même title envoient des signaux contradictoires à Google sur leur thématique respective. Cela crée de la cannibalisation et rend plus difficile pour Google de déterminer quelle page positionner pour une requête donnée.`,

  meta_duplicate: `Même si la meta description n'est pas un facteur de ranking direct, des meta descriptions identiques sur plusieurs pages sont le signe d'un manque de soin éditorial et peuvent réduire le taux de clic en SERP, les résultats paraissant interchangeables pour l'utilisateur.`,

  h1_duplicate: `Le H1 est le titre principal visible de la page. Il doit être unique sur le site et différent du title. Des H1 identiques sur plusieurs pages brouillent la compréhension thématique du site par Google et peuvent engendrer de la cannibalisation.`,

  hn_structure: `La hiérarchie des balises Hn (H1, H2, H3...) structure le contenu pour les moteurs de recherche et les utilisateurs. Une page sans H1, avec plusieurs H1, ou des balises Hn absentes envoie un signal de contenu mal organisé à Google et nuit à la lisibilité du document.`,

  hn_hierarchy: `Un saut de hiérarchie se produit quand on passe d'un H1 directement à un H3 sans H2 intermédiaire, ou d'un H2 à un H4. Cela casse la logique de structure du document et peut perturber la lecture du contenu par les robots comme par les lecteurs d'écran.`,

  internal_linking: `Le maillage interne désigne l'ensemble des liens entre les pages d'un même site. Il permet de distribuer le PageRank entre les pages, de guider les robots vers les contenus importants et d'améliorer la navigation des utilisateurs. Un maillage bien construit est l'un des leviers SEO les plus puissants et les plus sous-exploités.`,

  broken_links: `Un lien rompu pointe vers une URL qui renvoie une erreur (404, 500...). Côté interne, il crée une impasse pour les robots et perd le jus SEO transmis. Côté externe, il dégrade l'expérience utilisateur et peut signaler un manque de maintenance du site à Google.`,

  orphan_pages: `Une page sans lien entrant (hors navigation) est quasiment invisible pour Google : elle reçoit peu ou pas de PageRank et sera rarement crawlée. Une page sans lien sortant n'est pas ancrée dans la structure du site. Ces pages isolées sont à relier au reste du contenu via un maillage contextuel.`,

  anchor_bars: `Deux axes visuels pour analyser le texte des ancres de vos liens internes. D'abord, un bar chart des ancres les plus fréquentes par page de destination — il permet de repérer les pages qui reçoivent toujours la même ancre exacte (sur-optimisation) ou au contraire des ancres trop génériques.`,

  anchor_table: `Le score de diversité d'ancres est le ratio entre le nombre d'ancres uniques et le nombre total de liens entrants internes par page de destination. Plus le ratio est proche de 1, plus la diversité est bonne ; proche de 0, c'est qu'une même ancre revient en boucle. Les pages avec un ratio faible ET un volume de liens entrants élevé sont les plus urgentes à corriger.`,

  images_alt: `L'attribut alt est le texte alternatif d'une image. Il permet à Google de comprendre le contenu de l'image, contribue au référencement dans Google Images, et est indispensable pour l'accessibilité (lecteurs d'écran). Une image sans attribut alt est une opportunité SEO manquée et un problème d'accessibilité.`,

  images_size_attr: `Les attributs width et height définissent les dimensions de l'image dans le code HTML. Sans eux, le navigateur ne connaît pas la taille de l'image avant de la charger, ce qui provoque des décalages visuels pendant le chargement. C'est l'une des principales causes d'un mauvais score CLS (Cumulative Layout Shift), un des Core Web Vitals mesurés par Google.`,

  images_weight: `Le poids des images est souvent la première source de lenteur d'un site. Une image trop lourde rallonge le temps de chargement, dégrade le LCP (Largest Contentful Paint) et pénalise l'expérience mobile. Les formats modernes comme WebP ou AVIF permettent de réduire le poids de 30 à 50% par rapport au JPEG ou PNG, sans perte visible de qualité.`,
} as const;

// Section cover summaries — what the next section is about (3 short bullets).
export const SECTION_COVER: Record<string, { title: string; bullets: string[]; icon: string }> = {
  indexability_crawl: {
    title: "Indexabilité & crawl",
    icon: "compass",
    bullets: [
      "Comment Google découvre et indexe les pages du site",
      "Sitemap, robots.txt, profondeur, codes HTTP",
      "Hreflang, canonicals, llms.txt",
    ],
  },
  performance: {
    title: "Performance",
    icon: "speed",
    bullets: [
      "Réactivité du serveur (TTFB)",
      "Poids des fichiers HTML et limite Googlebot",
    ],
  },
  meta: {
    title: "Balises & métadonnées",
    icon: "tag",
    bullets: [
      "Title et meta description : longueur, unicité, pixels",
      "H1 unique et différencié",
      "Doublons à éliminer pour éviter la cannibalisation",
    ],
  },
  structure: {
    title: "Structure de contenu",
    icon: "outline",
    bullets: [
      "Hiérarchie des titres Hn",
      "Sauts de niveaux et erreurs structurelles",
    ],
  },
  linking: {
    title: "Maillage interne",
    icon: "graph",
    bullets: [
      "Distribution du PageRank interne",
      "Liens rompus, pages orphelines, ancres",
      "Score de diversité des ancres",
    ],
  },
  images: {
    title: "Images",
    icon: "image",
    bullets: [
      "Attribut alt et accessibilité",
      "Dimensions HTML (CLS)",
      "Poids et formats modernes",
    ],
  },
};
