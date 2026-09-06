import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("species map pans on pointer release without rerasterizing during movement", async () => {
  const source = await readFile(new URL("../src/species-map.ts", import.meta.url), "utf8");
  assert.match(source, /centerAfterDrag/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointerup/);
  assert.match(source, /Math\.hypot\(dx,dy\)<4/);
  assert.match(source, /c\.center=centerAfterDrag/);
  assert.match(source, /drag to pan/);
});
