// DataForSEO location codes for the most common Google country targets,
// with their default UI language. Multi-lang countries list all supported
// codes; the picker defaults to the first.

export type Country = {
  code: number;
  name: string;
  flag: string;
  langs: string[];
};

export const COUNTRIES: Country[] = [
  { code: 2250, name: "France", flag: "🇫🇷", langs: ["fr"] },
  { code: 2056, name: "Belgique", flag: "🇧🇪", langs: ["fr", "nl", "de"] },
  { code: 2756, name: "Suisse", flag: "🇨🇭", langs: ["fr", "de", "it"] },
  { code: 2124, name: "Canada", flag: "🇨🇦", langs: ["fr", "en"] },
  { code: 2492, name: "Monaco", flag: "🇲🇨", langs: ["fr"] },
  { code: 2438, name: "Luxembourg", flag: "🇱🇺", langs: ["fr", "de"] },
  { code: 2840, name: "États-Unis", flag: "🇺🇸", langs: ["en"] },
  { code: 2826, name: "Royaume-Uni", flag: "🇬🇧", langs: ["en"] },
  { code: 2724, name: "Espagne", flag: "🇪🇸", langs: ["es"] },
  { code: 2276, name: "Allemagne", flag: "🇩🇪", langs: ["de"] },
  { code: 2380, name: "Italie", flag: "🇮🇹", langs: ["it"] },
  { code: 2620, name: "Portugal", flag: "🇵🇹", langs: ["pt"] },
  { code: 2528, name: "Pays-Bas", flag: "🇳🇱", langs: ["nl"] },
  { code: 2208, name: "Danemark", flag: "🇩🇰", langs: ["da"] },
  { code: 2752, name: "Suède", flag: "🇸🇪", langs: ["sv"] },
  { code: 2578, name: "Norvège", flag: "🇳🇴", langs: ["no"] },
  { code: 2246, name: "Finlande", flag: "🇫🇮", langs: ["fi"] },
  { code: 2616, name: "Pologne", flag: "🇵🇱", langs: ["pl"] },
  { code: 2036, name: "Australie", flag: "🇦🇺", langs: ["en"] },
];

export function findCountry(code: number): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export const LANG_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  da: "Dansk",
  sv: "Svenska",
  no: "Norsk",
  fi: "Suomi",
  pl: "Polski",
};
