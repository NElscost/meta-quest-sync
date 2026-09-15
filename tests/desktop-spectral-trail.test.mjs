import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop species audio exposes an interactive persistent 3D identity trail",async()=>{
  const [trail,species,styles,general,main]=await Promise.all([
    readFile(new URL("../src/desktop-spectral-trail.ts",import.meta.url),"utf8"),
    readFile(new URL("../src/species-map.ts",import.meta.url),"utf8"),
    readFile(new URL("../styles.css",import.meta.url),"utf8"),
    readFile(new URL("../src/audio-spectral.ts",import.meta.url),"utf8"),
    readFile(new URL("../src/main.ts",import.meta.url),"utf8")
  ]);
  assert.match(species,/mountDesktopSpectralTrail/);
  assert.match(species,/Rastro 3D/);
  assert.match(trail,/audio\.ended/);
  assert.match(trail,/audio\.currentTime-windowSize/);
  assert.match(trail,/Rotação:/);
  assert.match(trail,/pointermove/);
  assert.match(trail,/function grid/);
  assert.match(styles,/meta-quest-spectral-canvas/);
  assert.match(general,/querySelectorAll<HTMLMediaElement>\("audio,video"\)/);
  assert.match(general,/youtube/);
  assert.match(trail,/spectralFrequencyRange/);
  assert.match(trail,/Salvar Hz/);
  assert.match(species,/Faixa vocal estimada/);
  assert.match(general,/AudioSpectralRenderChild/);
  assert.match(main,/registerMarkdownPostProcessor/);
  assert.match(main,/remote-audio-ticket/);
  assert.match(main,/assetPath: source/);
  assert.match(main,/\{ notePath, url: source \}/);
  assert.match(trail,/Number\(data\.duration\)/);
});
