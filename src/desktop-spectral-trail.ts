import { tr } from "./i18n";
import type { SpectralScene } from "./spectral-scene";

type SpectralPoint = {
  timeMs: number;
  frequencyHz: number;
  amplitude: number;
  spectralFlux: number;
  tonality: number;
  flatness: number;
  spectralSpreadHz: number;
  spectralCrest: number;
  xyz: [number, number, number];
};
type SpectralAnalysis = {
  method?: string;
  duration?: number;
  durationMs?: number;
  points?: SpectralPoint[];
};
type TrailPoint = {
  time: number;
  x: number;
  y: number;
  z: number;
  hue: number;
  strength: number;
  frequencyHz: number;
  amplitude: number;
  spectralFlux: number;
  tonality: number;
  members?: number;
};
export type SpectralFrequencyRange = { minHz: number; maxHz: number };
type TrailOptions = {
  storageKey?: string;
  syncOffsetMs?: number;
  onFrequencyRange?: (range: SpectralFrequencyRange) => void;
};
let spectralEngine: {
  createSpectralScene: (
    canvas: HTMLCanvasElement,
    points: TrailPoint[],
  ) => SpectralScene;
} | null = null;
function loadSpectralEngine() {
  if (spectralEngine) return spectralEngine;
  const obsidianApp = (globalThis as any).app,
    adapter = obsidianApp?.vault?.adapter,
    base =
      typeof adapter?.getBasePath === "function"
        ? adapter.getBasePath()
        : adapter?.basePath,
    config = obsidianApp?.vault?.configDir || ".obsidian";
  if (!base)
    throw new Error(
      "Diretório do vault indisponível para localizar o motor espectral.",
    );
  const enginePath = require("path").join(
      base,
      config,
      "plugins",
      "meta-quest-sync",
      "spectral-engine.cjs",
    ),
    nodeRequire = require("module").createRequire(enginePath),
    resolved = nodeRequire.resolve(enginePath);
  delete nodeRequire.cache[resolved];
  spectralEngine = nodeRequire(resolved) as typeof spectralEngine;
  return spectralEngine!;
}
export function spectralFrequencyRange(
  value: unknown,
): SpectralFrequencyRange | null {
  const raw = (value as SpectralAnalysis)?.points;
  if (!Array.isArray(raw)) return null;
  const usable = raw
    .map((p) => ({
      hz: Number(p.frequencyHz),
      weight: Math.max(0, Number(p.amplitude) || 0),
    }))
    .filter((p) => Number.isFinite(p.hz) && p.hz >= 20 && p.weight >= 18)
    .sort((a, b) => a.hz - b.hz);
  if (!usable.length) return null;
  const total = usable.reduce((sum, p) => sum + p.weight, 0),
    percentile = (ratio: number) => {
      let sum = 0;
      for (const p of usable) {
        sum += p.weight;
        if (sum >= total * ratio) return p.hz;
      }
      return usable.at(-1)!.hz;
    };
  return {
    minHz: Math.round(percentile(0.03)),
    maxHz: Math.round(percentile(0.97)),
  };
}

function hsl(h: number, s: number, l: number, a: number) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}
function frequencyHue(hz: number) {
  const ratio = Math.max(0, Math.min(1, (hz - 2000) / 8000));
  return (240 + ratio * 300) % 360;
}
const frequencyStopsHz = [
  20, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 18000,
];
const frequencyPalette = [
  [7, 20, 111],
  [7, 20, 111],
  [22, 76, 255],
  [157, 40, 232],
  [255, 41, 168],
  [255, 51, 24],
  [255, 230, 0],
  [37, 237, 0],
  [0, 239, 200],
  [245, 255, 232],
  [255, 255, 255],
];
function frequencyRgb(hz: number) {
  let index = 1;
  while (index < frequencyStopsHz.length && hz > frequencyStopsHz[index])
    index++;
  const high = Math.min(frequencyStopsHz.length - 1, index),
    low = Math.max(0, high - 1),
    span = Math.max(1, frequencyStopsHz[high] - frequencyStopsHz[low]),
    mix = Math.max(0, Math.min(1, (hz - frequencyStopsHz[low]) / span));
  return frequencyPalette[low].map((value, channel) =>
    Math.round(value + (frequencyPalette[high][channel] - value) * mix),
  );
}
function frequencyCss(hz: number, alpha = 1, whiteMix = 0) {
  const rgb = frequencyRgb(hz).map((value) =>
    Math.round(value + (255 - value) * Math.max(0, Math.min(1, whiteMix))),
  );
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, alpha))})`;
}
function prepare(value: unknown): { points: TrailPoint[]; duration: number } {
  const data = value as SpectralAnalysis;
  if (
    !String(data?.method || "").match(/^(hybrid64-robust-pca3|mfcc40-pca3)/u) ||
    !Array.isArray(data.points)
  )
    throw new Error("A ponte não retornou uma análise PCA compatível.");
  let smooth = [0, 0, 0];
  let points = data.points.slice(0, 32768).map((point, index) => {
    const xyz = point.xyz || [0, 0, 0],
      amp = Math.min(1, Math.max(0, Number(point.amplitude) || 0) / 255),
      flux = Math.max(0, Number(point.spectralFlux) || 0) / 255,
      tonality = Math.max(0, Number(point.tonality) || 0) / 255,
      response = 0.16 + flux * 0.25 + (1 - tonality) * 0.12,
      target = [
        (Number(xyz[0]) || 0) / 32767,
        (Number(xyz[1]) || 0) / 32767,
        (Number(xyz[2]) || 0) / 32767,
      ];
    smooth = index
      ? smooth.map((n, axis) => n + (target[axis] - n) * response)
      : target;
    const hz = Math.max(20, Number(point.frequencyHz) || 20);
    return {
      time: (Number(point.timeMs) || 0) / 1000,
      x: smooth[0],
      y: smooth[1],
      z: smooth[2],
      hue: frequencyHue(hz),
      strength: 0.16 + tonality * 0.58 + amp * 0.26,
      frequencyHz: hz,
      amplitude: amp,
      spectralFlux: flux,
      tonality,
    };
  });
  if (points.length > 8) {
    for (const axis of ["x", "y", "z"] as const) {
      const values = points.map((point) => point[axis]).sort((a, b) => a - b),
        low = values[Math.floor(values.length * 0.03)],
        high =
          values[Math.min(values.length - 1, Math.floor(values.length * 0.97))],
        center = (low + high) / 2,
        span = Math.max(0.0001, (high - low) / 2);
      for (const point of points)
        point[axis] = Math.max(
          -1.35,
          Math.min(1.35, (point[axis] - center) / span),
        );
    }
  }
  const sourceDuration = Math.max(
    Number(data.duration) || 0,
    (Number(data.durationMs) || 0) / 1000,
    points.at(-1)?.time || 0,
  );
  if (points.length > 1 && sourceDuration * 60 <= 60000) {
    const sampled: TrailPoint[] = [],
      step = 1 / 60;
    let cursor = 0;
    for (let time = 0; time <= sourceDuration; time += step) {
      while (cursor + 1 < points.length && points[cursor + 1].time < time)
        cursor++;
      const a = points[cursor],
        b = points[Math.min(points.length - 1, cursor + 1)],
        mix = Math.max(
          0,
          Math.min(1, (time - a.time) / Math.max(0.0001, b.time - a.time)),
        ),
        lerp = (x: number, y: number) => x + (y - x) * mix;
      sampled.push({
        time,
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        z: lerp(a.z, b.z),
        hue: frequencyHue(lerp(a.frequencyHz, b.frequencyHz)),
        strength: lerp(a.strength, b.strength),
        frequencyHz: lerp(a.frequencyHz, b.frequencyHz),
        amplitude: lerp(a.amplitude, b.amplitude),
        spectralFlux: lerp(a.spectralFlux, b.spectralFlux),
        tonality: lerp(a.tonality, b.tonality),
      });
    }
    points = sampled;
  }
  return {
    points,
    duration: Math.max(
      Number(data.duration) || 0,
      (Number(data.durationMs) || 0) / 1000,
      points.at(-1)?.time || 0,
    ),
  };
}

export function mountDesktopSpectralTrail(
  audio: HTMLMediaElement,
  host: HTMLElement,
  loadAnalysis: () => Promise<unknown>,
  options: TrailOptions = {},
) {
  const shell = host.createDiv({ cls: "meta-quest-spectral-desktop" }),
    toolbar = shell.createDiv({ cls: "meta-quest-spectral-toolbar" }),
    title = toolbar.createSpan({
      text: tr(
        "Emissões oscilatórias · 60 FPS",
        "Oscillatory emissions · 60 FPS",
      ),
    });
  const mode = toolbar.createEl("button", {
      text: tr("Modo: emissões", "Mode: emissions"),
    }),
    rotate = toolbar.createEl("button", {
      text: tr("Rotação: desligada", "Rotation: off"),
    }),
    shape = toolbar.createEl("button", {
      text: tr("Forma: retângulos + labels", "Shape: rectangles + labels"),
    }),
    zoomOut = toolbar.createEl("button", {
      text: "Zoom −",
      attr: { "aria-label": "Reduzir zoom" },
    }),
    zoomIn = toolbar.createEl("button", {
      text: "Zoom +",
      attr: { "aria-label": "Aumentar zoom" },
    }),
    reset = toolbar.createEl("button", {
      text: tr("Redefinir câmera", "Reset camera"),
    }),
    status = toolbar.createSpan({
      text: tr("Analisando áudio…", "Analyzing audio…"),
    });
  const savedKey = options.storageKey
    ? `meta-quest-spectral-frequency:${options.storageKey}`
    : "meta-quest-spectral-frequency:default";
  let saved: { minHz?: number; maxHz?: number; syncMs?: number } = {};
  try {
    saved = JSON.parse(localStorage.getItem(savedKey) || "{}");
  } catch {}
  const filters = shell.createDiv({ cls: "meta-quest-spectral-filters" });
  const numeric = (
    label: string,
    value: string,
    min: string,
    max: string,
    step: string,
  ) => {
    const wrap = filters.createEl("label");
    wrap.createSpan({ text: label });
    return wrap.createEl("input", {
      type: "number",
      value,
      attr: { min, max, step },
    });
  };
  const minHz = numeric(
      tr("Hz mín.", "Min Hz"),
      String(saved.minHz ?? 0),
      "0",
      "24000",
      "100",
    ),
    maxHz = numeric(
      tr("Hz máx.", "Max Hz"),
      String(saved.maxHz ?? 18000),
      "100",
      "48000",
      "100",
    ),
    minIntensity = numeric(
      tr("Intensidade mín. %", "Min intensity %"),
      "0",
      "0",
      "100",
      "1",
    ),
    windowSeconds = numeric(
      tr("Janela (s)", "Window (s)"),
      "3.25",
      "0.25",
      "30",
      "0.25",
    ),
    labelDensity = numeric(tr("Labels %", "Labels %"), "18", "1", "100", "1"),
    syncOffset = numeric(
      tr("Sincronia ms", "Sync ms"),
      String(saved.syncMs ?? options.syncOffsetMs ?? 0),
      "-1000",
      "1000",
      "10",
    ),
    saveHz = filters.createEl("button", { text: tr("Salvar Hz", "Save Hz") });
  saveHz.onclick = () => {
    localStorage.setItem(
      savedKey,
      JSON.stringify({
        minHz: Number(minHz.value) || 0,
        maxHz: Number(maxHz.value) || 18000,
        syncMs: Number(syncOffset.value) || 0,
      }),
    );
    saveHz.setText(tr("Hz salvos ✓", "Hz saved ✓"));
    window.setTimeout(() => saveHz.setText(tr("Salvar Hz", "Save Hz")), 1400);
  };
  shell.createDiv({
    cls: "meta-quest-spectral-explanation",
    text: "Eixos PCA: combinações dos 40 coeficientes MFCC. Eles descrevem forma, contraste e textura do timbre; não representam uma frequência isolada.",
  });
  const canvas = shell.createEl("canvas", {
      cls: "meta-quest-spectral-canvas",
      attr: {
        width: "960",
        height: "480",
        "aria-label":
          "Identidade espectral tridimensional híbrida; use a roda do mouse para zoom",
      },
    }),
    ctx = canvas.getContext("2d");
  const dashboard = shell.createDiv({ cls: "meta-quest-spectral-dashboard" });
  const panelTitles = [
    tr("Descritores Hz", "Hz descriptors"),
    tr("Dinâmica dB", "dB dynamics"),
    tr("Mapa tonal", "Tone map"),
    tr("Janela temporal", "Time window"),
    tr("Projeção cepstral", "Cepstral projection"),
    tr("Perfil cromático derivado", "Derived chroma profile"),
  ];
  const glCanvas = document.createElement("canvas");
  glCanvas.className = canvas.className;
  glCanvas.width = 960;
  glCanvas.height = 480;
  glCanvas.style.display = "none";
  const glViewport = document.createElement("div");
  glViewport.style.position = "relative";
  glViewport.style.width = "100%";
  canvas.insertAdjacentElement("beforebegin", glViewport);
  glViewport.append(glCanvas, canvas);
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 960;
  labelCanvas.height = 480;
  labelCanvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  glViewport.append(labelCanvas);
  const panelCanvases = panelTitles.map((title) => {
    const panel = dashboard.createDiv({ cls: "meta-quest-spectral-panel" });
    panel.createDiv({ cls: "meta-quest-spectral-panel-title", text: title });
    return panel.createEl("canvas", { attr: { width: "420", height: "150" } });
  });
  let points: TrailPoint[] = [],
    filteredPoints: TrailPoint[] = [],
    hubPoints: TrailPoint[] = [],
    filterSignature = "",
    duration = 0,
    yaw = -0.55,
    pitch = 0.28,
    zoom = 1,
    auto = false,
    rectangles = true,
    emissions = true,
    drag: null | { x: number; y: number; yaw: number; pitch: number } = null,
    frame = 0,
    panelFrame = 0,
    rafTick = 0,
    renderEvery = 1,
    disposed = false,
    scene3d: SpectralScene | null = null,
    glVisible = true;
  const visibility = new IntersectionObserver((entries) => {
    glVisible = entries.some((entry) => entry.isIntersecting);
  });
  visibility.observe(glCanvas);
  const resize = new ResizeObserver(() => {
    if (scene3d)
      scene3d.resize(glCanvas.clientWidth || 960, glCanvas.clientHeight || 480);
  });
  resize.observe(glCanvas);
  const release3d = () => {
    visibility.disconnect();
    resize.disconnect();
    scene3d?.dispose();
    scene3d = null;
  };
  const project = (p: { x: number; y: number; z: number }) => {
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch),
      x = p.x * cy - p.z * sy,
      z = p.x * sy + p.z * cy,
      y = p.y * cp - z * sp,
      depth = p.y * sp + z * cp + 3.2,
      scale = (310 * zoom) / depth;
    return {
      x: canvas.width / 2 + x * scale,
      y: canvas.height * 0.55 - y * scale,
      visible: depth > 0.2,
    };
  };
  const line = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    color = "rgba(112,151,190,.09)",
  ) => {
    if (!ctx) return;
    const pa = project(a),
      pb = project(b);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  };
  function label(text: string, p: { x: number; y: number; z: number }) {
    if (!ctx) return;
    const q = project(p);
    ctx.fillStyle = "rgba(220,237,252,.78)";
    ctx.font = "15px system-ui";
    ctx.fillText(text, q.x + 5, q.y - 4);
  }
  function grid() {
    for (let i = -5; i <= 5; i++) {
      line({ x: i / 5, y: -1, z: -1 }, { x: i / 5, y: -1, z: 1 });
      line({ x: -1, y: -1, z: i / 5 }, { x: 1, y: -1, z: i / 5 });
      line({ x: -1, y: i / 5, z: -1 }, { x: 1, y: i / 5, z: -1 });
    }
    label("PC1 · forma do espectro (MFCC)", { x: 0.34, y: -1, z: 1 });
    label("PC2 · contraste tímbrico (MFCC)", { x: -1, y: 0.72, z: -1 });
    label("PC3 · textura espectral (MFCC)", { x: 1, y: -1, z: 0.16 });
  }
  function renderPanels(selected: TrailPoint[]) {
    panelCanvases.forEach((c, index) => {
      const x = c.getContext("2d");
      if (!x) return;
      x.fillStyle = "#030810";
      x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = "rgba(110,145,180,.18)";
      for (let g = 1; g < 5; g++) {
        x.beginPath();
        x.moveTo(0, (g * c.height) / 5);
        x.lineTo(c.width, (g * c.height) / 5);
        x.stroke();
      }
      if (!selected.length) return;
      for (let i = 0; i < selected.length; i++) {
        const p = selected[i],
          px = (i / Math.max(1, selected.length - 1)) * c.width,
          fy = 1 - Math.min(1, p.frequencyHz / 18000),
          ay = 1 - p.amplitude;
        x.strokeStyle = frequencyCss(p.frequencyHz, 0.52);
        x.fillStyle = frequencyCss(p.frequencyHz, 0.62);
        if (index === 0 || index === 3) {
          if (i) {
            const q = selected[i - 1];
            x.beginPath();
            x.moveTo(
              ((i - 1) / Math.max(1, selected.length - 1)) * c.width,
              (1 - Math.min(1, q.frequencyHz / 18000)) * c.height,
            );
            x.lineTo(px, fy * c.height);
            x.stroke();
          }
          if (index === 3) {
            const newest = i === selected.length - 1,
              size = 3 + p.amplitude * 7;
            x.save();
            x.strokeStyle = newest
              ? "rgba(255,255,255,.94)"
              : frequencyCss(p.frequencyHz, 0.78);
            x.shadowColor = newest
              ? "rgba(255,255,255,.28)"
              : frequencyCss(p.frequencyHz, 0.3);
            x.shadowBlur = 3;
            x.strokeRect(px - size / 2, fy * c.height - size / 2, size, size);
            x.restore();
          }
        } else if (index === 1) {
          x.fillRect(px, ay * c.height, 2, c.height - ay * c.height);
        } else if (index === 2) {
          x.fillRect(
            Math.min(1, p.frequencyHz / 18000) * c.width,
            ay * c.height,
            2,
            2,
          );
        } else if (index === 4) {
          x.fillRect(
            (p.x + 1) * 0.5 * c.width,
            (1 - (p.y + 1) * 0.5) * c.height,
            2.5,
            2.5,
          );
        } else {
          x.fillRect(
            (((((Math.round(12 * Math.log2(Math.max(20, p.frequencyHz) / 440)) +
              69) %
              12) +
              12) %
              12) /
              12) *
              c.width,
            ay * c.height,
            3,
            c.height - ay * c.height,
          );
        }
      }
    });
  }
  const buildHubs = (list: TrailPoint[]) => {
    if (list.length < 2) return list;
    const span = Math.max(
        0.12,
        Math.min(0.42, (list.at(-1)!.time - list[0].time) / 2400),
      ),
      result: TrailPoint[] = [];
    let bucket = -1,
      group: TrailPoint[] = [];
    const flush = () => {
      if (!group.length) return;
      let weight = 0,
        x = 0,
        y = 0,
        z = 0,
        hx = 0,
        hy = 0,
        strength = 0,
        hz = 0,
        amplitude = 0,
        flux = 0,
        tonality = 0;
      for (const point of group) {
        const w = 0.12 + point.amplitude;
        weight += w;
        x += point.x * w;
        y += point.y * w;
        z += point.z * w;
        hx += Math.cos((point.hue * Math.PI) / 180) * w;
        hy += Math.sin((point.hue * Math.PI) / 180) * w;
        strength += point.strength * w;
        hz += point.frequencyHz * w;
        amplitude = Math.max(amplitude, point.amplitude);
        flux += point.spectralFlux * w;
        tonality += point.tonality * w;
      }
      const last = group.at(-1)!;
      result.push({
        time: last.time,
        x: x / weight,
        y: y / weight,
        z: z / weight,
        hue: ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360,
        strength: strength / weight,
        frequencyHz: hz / weight,
        amplitude,
        spectralFlux: flux / weight,
        tonality: tonality / weight,
        members: group.reduce((sum, p) => sum + (p.members || 1), 0),
      });
      group = [];
    };
    for (const point of list) {
      const next = Math.floor(point.time / span);
      if (bucket >= 0 && next !== bucket) flush();
      bucket = next;
      group.push(point);
    }
    flush();
    return result;
  };
  const lowerTime = (list: TrailPoint[], time: number) => {
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const upperTime = (list: TrailPoint[], time: number) => {
    let lo = 0,
      hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].time <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const eligiblePoints = (low: number, high: number, threshold: number) => {
    const signature = low + ":" + high + ":" + threshold;
    if (signature !== filterSignature) {
      filterSignature = signature;
      filteredPoints = points.filter(
        (point) =>
          point.frequencyHz >= low &&
          point.frequencyHz <= high &&
          point.amplitude >= threshold,
      );
      hubPoints = buildHubs(filteredPoints);
      renderEvery =
        filteredPoints.length > 30000
          ? 3
          : filteredPoints.length > 12000
            ? 2
            : 1;
    }
    return filteredPoints;
  };
  function emissionPosition(p: TrailPoint, _age: number) {
    const phase = p.time * 2.399963 + p.spectralFlux * 1.7,
      radius = 0.035 + p.amplitude * 0.16 + p.spectralFlux * 0.08;
    return {
      x: p.x * 1.12 + Math.cos(phase) * radius,
      y:
        p.y * 1.12 + Math.sin(phase * 0.73) * radius * (0.7 + p.tonality * 0.5),
      z: p.z * 1.12 + Math.sin(phase * 1.17) * radius,
    };
  }
  function renderEmissions(
    source: TrailPoint[],
    end: number,
    identity: boolean,
    labelEvery: number,
    lifetime: number,
  ) {
    if (!ctx || !source.length) return;
    const sourceStart = identity
        ? 0
        : lowerTime(source, Math.max(0, end - lifetime)),
      sourceEnd = upperTime(source, end),
      available = Math.max(0, sourceEnd - sourceStart),
      max = identity ? 2400 : 900,
      stride = Math.max(1, Math.ceil(available / max)),
      view: TrailPoint[] = [];
    for (let i = sourceStart; i < sourceEnd; i += stride) view.push(source[i]);
    if (sourceEnd > 0 && view.at(-1) !== source[sourceEnd - 1])
      view.push(source[sourceEnd - 1]);
    const projected = view.map((p) => ({
        p,
        q: project(emissionPosition(p, Math.max(0, end - p.time))),
      })),
      effectiveLabelEvery = Math.max(
        labelEvery,
        Math.ceil(projected.length / 90),
      );
    for (let i = 1; i < projected.length; i++) {
      const a = projected[i - 1],
        b = projected[i];
      if (!a.q.visible || !b.q.visible) continue;
      ctx.strokeStyle = frequencyCss(
        b.p.frequencyHz,
        identity ? 0.2 : 0.11 + b.p.strength * 0.22,
      );
      ctx.lineWidth = identity ? 0.65 : 0.8;
      ctx.beginPath();
      ctx.moveTo(a.q.x, a.q.y);
      ctx.lineTo(b.q.x, b.q.y);
      ctx.stroke();
      if (i > 10 && i % 7 === 0) {
        let best = -1,
          score = 0.42;
        const nearStart = Math.max(0, i - 220),
          nearStep = Math.max(1, Math.ceil((i - nearStart) / 18));
        for (let j = nearStart; j < i - 8; j += nearStep) {
          const candidate = projected[j],
            frequency = Math.abs(
              Math.log2(b.p.frequencyHz / candidate.p.frequencyHz),
            ),
            distance = Math.hypot(
              b.p.x - candidate.p.x,
              b.p.y - candidate.p.y,
              b.p.z - candidate.p.z,
            ),
            value = frequency * 0.65 + distance * 0.13;
          if (value < score) {
            score = value;
            best = j;
          }
        }
        if (best >= 0) {
          const c = projected[best];
          ctx.strokeStyle = frequencyCss(
            b.p.frequencyHz,
            0.07 + b.p.amplitude * 0.1,
          );
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(c.q.x, c.q.y);
          ctx.lineTo(b.q.x, b.q.y);
          ctx.stroke();
        }
      }
    }
    if (identity) return;
    for (let i = 0; i < projected.length; i++) {
      const { p, q } = projected[i],
        age = Math.max(0, end - p.time);
      if (!q.visible) continue;
      const birthProgress = Math.min(1, age / 0.55),
        birth = 1 - birthProgress,
        life = Math.max(0, Math.min(1, 1 - age / Math.max(0.1, lifetime))),
        members = p.members || 1,
        hubScale = 1 + Math.min(1.8, Math.log2(members) * 0.22),
        popScale =
          birthProgress < 0.18
            ? 1
            : 1 + Math.sin(((birthProgress - 0.18) / 0.82) * Math.PI) * 0.82,
        size = (3.5 + p.amplitude * 8) * hubScale * popScale,
        glow = birth > 0.02 || projected.length < 520 || members >= 4;
      ctx.globalAlpha = life;
      ctx.strokeStyle = frequencyCss(p.frequencyHz, 0.86, birth);
      ctx.shadowColor = glow
        ? frequencyCss(p.frequencyHz, birth > 0.02 ? 0.3 : 0.2, birth)
        : "transparent";
      ctx.shadowBlur = glow ? 3 : 0;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(q.x - size / 2, q.y - size / 2, size, size);
      ctx.fillStyle = frequencyCss(
        p.frequencyHz,
        0.18 + p.amplitude * 0.28,
        birth,
      );
      ctx.fillRect(q.x - 1.4, q.y - 1.4, 2.8, 2.8);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (
        Math.round(p.time * 60) % effectiveLabelEvery === 0 &&
        p.amplitude > 0.2 &&
        life > 0.02
      ) {
        ctx.globalAlpha = life;
        ctx.fillStyle = "rgba(244,247,255,.82)";
        ctx.font = "8px system-ui";
        ctx.fillText(p.amplitude.toFixed(4), q.x + 7, q.y - 8);
        ctx.fillText(
          (p.frequencyHz / 1000).toFixed(1) + "kHz",
          q.x - 22,
          q.y + 2,
        );
        ctx.fillText(
          p.time.toFixed(2) + (members > 1 ? " · ×" + members : ""),
          q.x + 7,
          q.y + 9,
        );
        ctx.globalAlpha = 1;
      }
    }
  }
  const clockTime = () =>
    Math.max(
      0,
      (Number(audio.currentTime) || 0) + (Number(syncOffset.value) || 0) / 1000,
    );
  function render() {
    if (disposed || !ctx) return;
    const cadence =
      scene3d && emissions
        ? 1
        : Math.max(renderEvery, audio.paused && !auto ? 4 : 1);
    if (++rafTick % cadence !== 0) {
      frame = requestAnimationFrame(render);
      return;
    }
    const mediaTime = clockTime();
    if (scene3d && emissions) {
      const complete =
          audio.ended ||
          (duration > 0 && mediaTime >= duration - 0.08 && audio.paused),
        size = Math.max(0.25, Number(windowSeconds.value) || 3.25),
        low = Math.max(0, Number(minHz.value) || 0),
        high = Math.max(low, Number(maxHz.value) || 18000),
        threshold = Math.max(0, Number(minIntensity.value) || 0) / 100,
        end = complete ? duration : mediaTime;
      scene3d.setTime(end, complete);
      scene3d.setFilters(low, high, threshold, size);
      if (glVisible) {
        scene3d.render();
        const labels = scene3d.labels(
            rectangles
              ? Math.max(4, Math.round(Number(labelDensity.value) || 18))
              : 0,
          ),
          lx = labelCanvas.getContext("2d");
        if (lx) {
          const w = glCanvas.clientWidth || 960,
            h = glCanvas.clientHeight || 480;
          if (labelCanvas.width !== w || labelCanvas.height !== h) {
            labelCanvas.width = w;
            labelCanvas.height = h;
          }
          lx.clearRect(0, 0, w, h);
          lx.font = "8px system-ui";
          lx.textBaseline = "middle";
          for (const item of labels) {
            const born = item.age < 0.55;
            lx.globalAlpha = Math.max(0, 1 - item.age / size);
            lx.fillStyle = born
              ? "rgba(255,255,255,.94)"
              : "rgba(238,245,255,.84)";
            lx.shadowColor = born ? "rgba(255,255,255,.28)" : item.color;
            lx.shadowBlur = born ? 4 : 2;
            lx.fillText(item.amplitude.toFixed(4), item.x + 7, item.y - 8);
            lx.fillText(
              (item.frequencyHz / 1000).toFixed(1) + "kHz",
              item.x - 22,
              item.y + 1,
            );
            lx.fillText(item.time.toFixed(2), item.x + 7, item.y + 9);
            lx.globalAlpha = 1;
          }
          lx.shadowBlur = 0;
        }
      }
      if ((panelFrame++ & 3) === 0) {
        const eligible = eligiblePoints(low, high, threshold);
        renderPanels(
          eligible.slice(
            lowerTime(eligible, complete ? 0 : Math.max(0, end - size)),
            upperTime(eligible, end),
          ),
        );
      }
      frame = requestAnimationFrame(render);
      return;
    }
    ctx.fillStyle = "#050b13";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    grid();
    if (auto) yaw += 0.0025;
    const identity =
        audio.ended ||
        (duration > 0 && mediaTime >= duration - 0.08 && audio.paused),
      windowSize = Math.max(0.25, Number(windowSeconds.value) || 3.25),
      low = Math.max(0, Number(minHz.value) || 0),
      high = Math.max(low, Number(maxHz.value) || 18000),
      threshold = Math.max(0, Number(minIntensity.value) || 0) / 100,
      labelEvery = Math.max(
        1,
        Math.round(100 / Math.max(1, Number(labelDensity.value) || 18)),
      ),
      start = identity ? 0 : Math.max(0, mediaTime - windowSize),
      end = identity ? duration : mediaTime;
    let previous: ReturnType<typeof project> | null = null;
    const eligible = eligiblePoints(low, high, threshold),
      selected = eligible.slice(
        lowerTime(eligible, start),
        upperTime(eligible, end),
      );
    if (emissions) {
      renderEmissions(hubPoints, end, identity, labelEvery, windowSize);
      if ((panelFrame++ & 3) === 0) renderPanels(selected);
      ctx.fillStyle = "rgba(224,238,252,.72)";
      ctx.font = "20px system-ui";
      ctx.fillText(
        identity
          ? tr(
              "assinatura completa · linhas persistentes",
              "complete signature · persistent lines",
            )
          : tr(
              "emissões · amplitude · vida · tempo",
              "emissions · amplitude · lifetime · time",
            ),
        22,
        32,
      );
      frame = requestAnimationFrame(render);
      return;
    }
    for (const point of selected) {
      const current = project(point);
      if (previous && current.visible) {
        const alpha = identity
          ? Math.max(0.18, point.strength * 0.72)
          : point.strength * Math.max(0.12, 1 - (end - point.time) / 3.25);
        ctx.strokeStyle = hsl(point.hue, 88, 62, alpha);
        ctx.lineWidth = identity ? 1.5 : 2.2;
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(current.x, current.y);
        ctx.stroke();
        if (rectangles) {
          const size = 4 + point.strength * 7;
          ctx.fillStyle = hsl(point.hue, 82, 58, Math.max(0.22, alpha * 0.72));
          ctx.fillRect(current.x - size / 2, current.y - size / 2, size, size);
          // Anchor labels to the immutable sample timestamp. Selecting them by
          // their position inside the sliding window makes every label jump
          // whenever the oldest sample expires.
          if (Math.round(point.time * 60) % labelEvery === 0) {
            ctx.fillStyle = "rgba(244,247,255,.9)";
            ctx.font = "9px system-ui";
            const hz =
              point.frequencyHz >= 1000
                ? `${(point.frequencyHz / 1000).toFixed(2)}kHz`
                : `${Math.round(point.frequencyHz)}Hz`;
            ctx.fillText(
              `${point.time.toFixed(2)}s`,
              current.x + 8,
              current.y - 7,
            );
            ctx.fillText(
              `${hz} · ${point.amplitude.toFixed(3)}`,
              current.x + 8,
              current.y + 5,
            );
            const age = Math.max(0, end - point.time),
              birth = Math.max(0, Math.min(1, 1 - age / 0.22));
            ctx.save();
            ctx.strokeStyle =
              birth > 0
                ? `rgba(255,255,255,${(0.72 + birth * 0.25).toFixed(3)})`
                : hsl(point.hue, 90, 64, 0.86);
            ctx.shadowColor =
              birth > 0 ? "rgba(255,255,255,.3)" : hsl(point.hue, 90, 60, 0.28);
            ctx.shadowBlur = 3;
            ctx.strokeRect(
              current.x - size / 2 - 2,
              current.y - size / 2 - 2,
              size + 4,
              size + 4,
            );
            ctx.restore();
          }
        }
      }
      previous = current;
    }
    if ((panelFrame++ & 3) === 0) renderPanels(selected);
    if (identity) {
      const gradient = ctx.createLinearGradient(24, 0, canvas.width - 24, 0);
      for (let i = 0; i <= 12; i++)
        gradient.addColorStop(i / 12, hsl(250 - (i / 12) * 235, 90, 56, 1));
      ctx.fillStyle = gradient;
      ctx.fillRect(24, canvas.height - 22, canvas.width - 48, 8);
      ctx.fillStyle = "rgba(225,239,255,.78)";
      ctx.font = "11px system-ui";
      ctx.fillText(
        tr("ESPECTRO 20 Hz → 18 kHz", "SPECTRUM 20 Hz → 18 kHz"),
        24,
        canvas.height - 28,
      );
    }
    ctx.fillStyle = "rgba(224,238,252,.72)";
    ctx.font = "20px system-ui";
    ctx.fillText(
      identity
        ? "assinatura completa · somente linhas"
        : `janela temporal atual · ${windowSize.toFixed(2)} s`,
      22,
      32,
    );
    frame = requestAnimationFrame(render);
  }
  const setZoom = (value: number) => {
    const previous = zoom;
    zoom = Math.max(0.45, Math.min(3.5, value));
    scene3d?.zoomBy(previous / zoom);
  };
  mode.onclick = () => {
    emissions = !emissions;
    if (scene3d) {
      glCanvas.style.display = emissions ? "" : "none";
      canvas.style.display = emissions ? "none" : "";
    }
    mode.setText(
      emissions
        ? tr("Modo: emissões", "Mode: emissions")
        : tr("Modo: PCA", "Mode: PCA"),
    );
    title.setText(
      emissions
        ? tr("Emissões oscilatórias · 60 FPS", "Oscillatory emissions · 60 FPS")
        : tr(
            "Identidade espectral 3D · PCA híbrida",
            "3D spectral identity · hybrid PCA",
          ),
    );
  };
  rotate.onclick = () => {
    auto = !auto;
    scene3d?.setOrbit(auto);
    rotate.setText(
      auto
        ? tr("Rotação: ligada", "Rotation: on")
        : tr("Rotação: desligada", "Rotation: off"),
    );
  };
  shape.onclick = () => {
    rectangles = !rectangles;
    shape.setText(
      rectangles
        ? tr("Forma: retângulos + labels", "Shape: rectangles + labels")
        : tr("Forma: linhas", "Shape: lines"),
    );
  };
  zoomOut.onclick = () => setZoom(zoom / 1.2);
  zoomIn.onclick = () => setZoom(zoom * 1.2);
  reset.onclick = () => {
    yaw = -0.55;
    pitch = 0.28;
    zoom = 1;
    scene3d?.resetCamera();
  };
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0012));
    },
    { passive: false },
  );
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    pitch = Math.max(
      -1.2,
      Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.008),
    );
  });
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("pointercancel", () => (drag = null));
  let glDrag: null | { x: number; y: number } = null;
  glCanvas.addEventListener("pointerdown", (e) => {
    glDrag = { x: e.clientX, y: e.clientY };
    glCanvas.setPointerCapture(e.pointerId);
  });
  glCanvas.addEventListener("pointermove", (e) => {
    if (!glDrag) return;
    scene3d?.orbitBy(
      (e.clientX - glDrag.x) * 0.008,
      (e.clientY - glDrag.y) * 0.008,
    );
    glDrag = { x: e.clientX, y: e.clientY };
  });
  glCanvas.addEventListener("pointerup", () => (glDrag = null));
  glCanvas.addEventListener("pointercancel", () => (glDrag = null));
  glCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      scene3d?.zoomBy(Math.exp(e.deltaY * 0.0012));
    },
    { passive: false },
  );
  const restart = () => {};
  audio.addEventListener("seeked", restart);
  audio.addEventListener("play", restart);
  const observer = new MutationObserver(() => {
    if (document.contains(shell)) return;
    disposed = true;
    cancelAnimationFrame(frame);
    release3d();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  void Promise.resolve()
    .then(loadAnalysis)
    .then((value) => {
      ({ points, duration } = prepare(value));
      filterSignature = "";
      void Promise.resolve()
        .then(() => {
          const engine = loadSpectralEngine();
          if (disposed) return;
          const result = engine.createSpectralScene(glCanvas, points);
          if (disposed) {
            result.dispose();
            return;
          }
          scene3d = result;
          scene3d.resize(
            glCanvas.clientWidth || 960,
            glCanvas.clientHeight || 480,
          );
          scene3d.setOrbit(auto);
          canvas.style.display = "none";
          glCanvas.style.display = "";
        })
        .catch((error) => {
          console.error(
            "[meta-quest-sync] Three.js spectral engine failed",
            error,
          );
          status.setText(
            `WebGL indisponível · fallback 2D: ${error instanceof Error ? error.message : String(error)}`,
          );
          glCanvas.style.display = "none";
          labelCanvas.style.display = "none";
          canvas.style.display = "";
        });
      filteredPoints = [];
      hubPoints = [];
      const range = spectralFrequencyRange(value);
      if (range) {
        options.onFrequencyRange?.(range);
        status.setText(
          `${points.length.toLocaleString()} pontos · ${duration.toFixed(1)} s · ${range.minHz.toLocaleString()}–${range.maxHz.toLocaleString()} Hz`,
        );
      } else
        status.setText(
          `${points.length.toLocaleString()} pontos · ${duration.toFixed(1)} s`,
        );
    })
    .catch((error) =>
      status.setText(
        `Análise indisponível: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  render();
  return shell;
}
