import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainUrl = new URL("../src/main.ts", import.meta.url);
const pairingUrl = new URL("../src/pairing.ts", import.meta.url);
const graphUrl = new URL("../src/graph-exporter.ts", import.meta.url);
const sessionUrl = new URL("../src/session-manager.ts", import.meta.url);
const i18nUrl = new URL("../src/i18n.ts", import.meta.url);

test("oferece comandos, ribbon e pareamento sem persistir o token", async () => {
  const [main, pairing] = await Promise.all([
    readFile(mainUrl, "utf8"),
    readFile(pairingUrl, "utf8")
  ]);
  assert.match(main, /addRibbonIcon\("glasses"/);
  assert.match(main, /id: "start-ar-session"/);
  assert.match(main, /id: "stop-ar-session"/);
  assert.match(main, /QRCode\.toCanvas/);
  assert.doesNotMatch(main, /setName\("Meta Quest Sync"\)\s*\.setHeading\(\)/);
  assert.doesNotMatch(main, /createEl\("h[1-6]"/);
  assert.match(pairing, /viewer\.hash = `obsidian-ar=/);
  assert.doesNotMatch(main, /settings\.token/);
});

test("conecta somente a uma ponte externa já ativa", async () => {
  const session = await readFile(sessionUrl, "utf8");
  assert.match(session, /async connect\(settings: SessionSettings\)/);
  assert.match(session, /http:\/\/127\.0\.0\.1:\$\{port\}/);
  assert.match(session, /\/verify/);
  assert.doesNotMatch(session, /child_process|spawn\(|exec\(|note-bridge\.mjs|nodeExecutable/);
});

test("gera o grafo pela API do Obsidian e respeita exclusões", async () => {
  const graph = await readFile(graphUrl, "utf8");
  assert.match(graph, /app\.vault\s*\.getMarkdownFiles\(\)/);
  assert.match(graph, /app\.metadataCache\.resolvedLinks/);
  assert.match(graph, /excludedFolders/);
  assert.match(graph, /excludedTags/);
  assert.match(graph, /generatedAt: new Date\(\)\.toISOString\(\)/);
});

test("usa português do sistema e inglês como fallback", async () => {
  const [main, session, pairing, i18n] = await Promise.all([
    readFile(mainUrl, "utf8"),
    readFile(sessionUrl, "utf8"),
    readFile(pairingUrl, "utf8"),
    readFile(i18nUrl, "utf8")
  ]);
  assert.match(i18n, /localStorage\?\.getItem\("language"\)/);
  assert.match(i18n, /documentElement\?\.lang/);
  assert.match(i18n, /navigator\?\.languages\?\.\[0\]/);
  assert.match(i18n, /startsWith\("pt"\)/);
  assert.match(main, /interfaceLanguage: LanguagePreference/);
  assert.match(main, /tr\("Idioma da interface", "Interface language"\)/);
  assert.match(main, /\.addOption\("system", tr\("Idioma do sistema", "System language"\)\)/);
  assert.match(main, /\.addOption\("en", "English"\)/);
  assert.match(main, /tr\("Pasta do projeto", "Project folder"\)/);
  assert.match(session, /"The bridge is not running\. Start it from the companion project/);
  assert.match(pairing, /"The viewer must use HTTPS\."/);
});
