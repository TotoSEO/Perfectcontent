"use client";

import { useEffect } from "react";
import { COUNTRIES, LANG_LABELS, findCountry } from "@/lib/countries";

export function CountryPicker({
  countryCode,
  languageCode,
  onChange,
}: {
  countryCode: number;
  languageCode: string;
  onChange: (countryCode: number, languageCode: string) => void;
}) {
  const country = findCountry(countryCode) ?? COUNTRIES[0];

  useEffect(() => {
    if (!country.langs.includes(languageCode)) {
      onChange(countryCode, country.langs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1.5 block">
        <span className="label">Pays</span>
        <select
          value={countryCode}
          onChange={(e) => {
            const code = Number(e.target.value);
            const c = findCountry(code);
            onChange(code, c?.langs[0] ?? "en");
          }}
          className="input"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1.5 block">
        <span className="label">Langue</span>
        <select
          value={languageCode}
          disabled={country.langs.length === 1}
          onChange={(e) => onChange(countryCode, e.target.value)}
          className="input disabled:opacity-60"
        >
          {country.langs.map((lng) => (
            <option key={lng} value={lng}>
              {LANG_LABELS[lng] || lng}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
