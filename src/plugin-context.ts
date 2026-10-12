import type { App } from "obsidian";

let pluginApp: App | null = null;
export function setPluginApp(app: App | null): void { pluginApp = app; }
export function getPluginApp(): App {
  if (!pluginApp) throw new Error("Meta Quest Sync is not loaded.");
  return pluginApp;
}
export function loadVaultValue(key: string): unknown {
  return getPluginApp().loadLocalStorage(key) as unknown;
}
export function saveVaultValue(key: string, value: unknown): void {
  getPluginApp().saveLocalStorage(key, value);
}
