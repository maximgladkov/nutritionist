const ISO_ALPHA2 = /^[a-z]{2}$/;

export type CountryOption = {
  readonly code: string;
  readonly name: string;
};

export function normalizeCountryCode(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!ISO_ALPHA2.test(normalized)) {
    return null;
  }
  return normalized;
}

export function toOpenFoodFactsCountry(code: string): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) {
    return null;
  }
  return normalized === "gb" ? "uk" : normalized;
}

export function listCountries(locale = "en"): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const countries: CountryOption[] = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = names.of(code);
      if (name && name !== code) {
        countries.push({ code: code.toLowerCase(), name });
      }
    }
  }
  return countries.sort((a, b) => a.name.localeCompare(b.name, locale));
}
