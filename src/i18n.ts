import { getLanguage } from "obsidian";
export type LanguagePreference = "system" | "en";

let languagePreference: LanguagePreference = "system";

function systemLanguage(): string {
  return getLanguage();
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
