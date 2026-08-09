export type LanguagePreference = "system" | "en";

let languagePreference: LanguagePreference = "system";

function systemLanguage(): string {
  try {
    const configured = globalThis.localStorage?.getItem("language")?.trim();
    if (configured) return configured;
  } catch {}
  const documentLanguage = globalThis.document?.documentElement?.lang?.trim();
  if (documentLanguage) return documentLanguage;
  return globalThis.navigator?.languages?.[0]
    ?? globalThis.navigator?.language
    ?? "en";
}

export function setLanguagePreference(preference: LanguagePreference): void {
  languagePreference = preference;
}

export function isPortuguese(): boolean {
  return languagePreference === "system"
    && systemLanguage().toLocaleLowerCase().startsWith("pt");
}

export function tr(portuguese: string, english: string): string {
  return isPortuguese() ? portuguese : english;
}