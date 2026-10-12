import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

async function moduleFromSource(name) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url))], bundle: true, write: false, format: "esm", platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const { parseSpeciesData } = await moduleFromSource("species-data");
const context = await moduleFromSource("plugin-context");

test("API adapter safely handles absent and malformed records", () => {
  for (const value of [null, undefined, [], "invalid", 42]) {
    const data = parseSpeciesData(value);
    assert.deepEqual(data.results, []);
    assert.equal(data.geojson, null);
    assert.equal(data.count, 0);
  }
  const data = parseSpeciesData({ results: [null, { decimalLatitude: "bad", media: [{ identifier: "javascript:alert(1)" }] }] });
  assert.ok(Number.isNaN(data.results[1].decimalLatitude));
  assert.deepEqual(data.results[1].media, []);
});

test("API adapter preserves occurrence media and administrative geometry", () => {
  const polygon = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const data = parseSpeciesData({ count: 341, usageKey: 123, scientificName: "Pitangus sulphuratus", address: { state: "Espírito Santo", country_code: "br", bad: {} }, geojson: polygon,
    results: [{ decimalLatitude: -20, decimalLongitude: -40, municipality: "Vitória", media: [{ type: "Sound", identifier: "https://example.org/bird.mp3", creator: "Observer" }] }] });
  assert.equal(data.count, 341);
  assert.equal(data.usageKey, 123);
  assert.equal(data.results[0].media[0].creator, "Observer");
  assert.equal(data.results[0].municipality, "Vitória");
  assert.deepEqual(data.geojson, polygon);
  assert.equal(data.address.bad, undefined);
  assert.equal(parseSpeciesData({ geojson: { type: "Polygon", coordinates: [["invalid"]] } }).geojson, null);
});

test("preferences remain scoped to their vault and context is released", () => {
  const vault = () => { const values = new Map(); return { loadLocalStorage: key => values.get(key), saveLocalStorage: (key, value) => values.set(key, value) }; };
  const first = vault(), second = vault();
  context.setPluginApp(first);
  context.saveVaultValue("filter", { minHz: 2000 });
  context.setPluginApp(second);
  assert.equal(context.loadVaultValue("filter"), undefined);
  context.setPluginApp(first);
  assert.deepEqual(context.loadVaultValue("filter"), { minHz: 2000 });
  context.setPluginApp(null);
  assert.throws(() => context.loadVaultValue("filter"), /not loaded/);
});

test("README places the demonstration between the species syntax and region instructions", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(readme.indexOf("```species-map") < readme.indexOf("<video"));
  assert.ok(readme.indexOf("<video") < readme.indexOf("Select a map region"));
});
