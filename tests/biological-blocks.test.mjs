import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("registers explicit IUCN and FASTA blocks", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  const iucn = await readFile(new URL("../src/iucn.ts", import.meta.url), "utf8");
  const fasta = await readFile(new URL("../src/fasta.ts", import.meta.url), "utf8");
  assert.match(main, /registerMarkdownCodeBlockProcessor\("iucn"/);
  assert.match(main, /registerMarkdownCodeBlockProcessor\("fasta"/);
  assert.match(iucn, /IUCN 3\.1/);
  assert.match(iucn, /CATEGORIES\.includes/);
  assert.match(fasta, /parseFasta/);
  assert.match(fasta, /inline\.unshift/);
  assert.match(fasta, /10_000/);
  assert.match(fasta, /buildUpgma/);
  assert.match(fasta, /pDistance/);
  assert.match(fasta, /UPGMA tree/);
  assert.match(fasta, /Distances/);
});
