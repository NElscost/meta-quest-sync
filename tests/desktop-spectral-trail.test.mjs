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
  assert.match(trail,/mediaTime\s*-\s*windowSize/);
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
  assert.match(trail,/const buildHubs\s*=/);
  assert.match(trail,/hubPoints\s*=\s*buildHubs/);
  assert.match(trail,/members\s*>\s*1/);
  assert.match(trail,/birthProgress/);
  assert.match(trail,/popScale/);
  assert.match(trail,/Math\.min\(1,\s*Math\.max/);
  assert.match(trail,/Number\(data\.duration\)/);
});


test("spectral engine keeps static GPU buffers and temporal shader uniforms",async()=>{
  const [trail,scene,build]=await Promise.all([readFile(new URL("../src/desktop-spectral-trail.ts",import.meta.url),"utf8"),readFile(new URL("../src/spectral-scene.ts",import.meta.url),"utf8"),readFile(new URL("../esbuild.config.mjs",import.meta.url),"utf8")]);
  assert.match(trail,/spectral-engine\.cjs/);
  assert.match(trail,/getBasePath/);
  assert.doesNotMatch(trail,/join\(__dirname,"spectral-engine\.cjs"\)/);
  assert.match(trail,/scene3d\.setTime/);
  assert.match(scene,/uLifetime/);
  assert.match(scene,/ShaderMaterial/);
  assert.match(scene,/renderer\.forceContextLoss/);
  assert.match(build,/spectral-engine\.cjs/);
});


test("birth rectangle starts at 5x and settles to 1x without a fixed 42px cap",async()=>{
  const scene=await readFile(new URL("../src/spectral-scene.ts",import.meta.url),"utf8");
  assert.match(scene,/float pop=1\.0\+4\.0\*\(1\.0-settle\)/);
  assert.match(scene,/gl_PointSize=clamp\(normalSize\*pop,1\.0,uMaxPointSize\)/);
  assert.match(scene,/ALIASED_POINT_SIZE_RANGE/);
  const scale=(age)=>{const t=Math.max(0,Math.min(1,age/.55));return 1+4*(1-t*t*(3-2*t));};
  assert.equal(scale(0),5);
  assert.ok(scale(.275)>1&&scale(.275)<5);
  assert.equal(scale(.55),1);
});


test("youtube clock interpolates between player messages and keeps dense local links",async()=>{
  const [audio,trail,scene]=await Promise.all([readFile(new URL("../src/audio-spectral.ts",import.meta.url),"utf8"),readFile(new URL("../src/desktop-spectral-trail.ts",import.meta.url),"utf8"),readFile(new URL("../src/spectral-scene.ts",import.meta.url),"utf8")]);
  assert.match(audio,/reportedAt:performance\.now\(\)/);
  assert.match(audio,/Math\.min\(2,Math\.max/);
  assert.match(audio,/syncOffsetMs:120/);
  assert.match(trail,/Sincronia ms/);
  assert.match(trail,/const mediaTime\s*=\s*clockTime\(\)/);
  assert.match(scene,/SRGBColorSpace/);
  assert.match(scene,/outputColorSpace=SRGBColorSpace/);
  assert.match(trail,/scene3d\s*&&\s*emissions\s*\?\s*1/);
  assert.match(scene,/i\s*\+=\s*4/);
  assert.match(scene,/Math\.ceil\(\(i\s*-\s*start\)\s*\/\s*24\)/);
  assert.match(scene,/if\s*\(second\s*>=\s*0\)\s*link/);
});
