import esbuild from "esbuild";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const context = await esbuild.context({
  absWorkingDir: projectRoot,
  entryPoints: [path.join(projectRoot, "src", "main.ts")],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2022",
  platform: "node",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: path.join(projectRoot, "main.js"),
  logLevel: "info"
});

const engineOptions = {absWorkingDir: projectRoot, entryPoints: [path.join(projectRoot, "src", "spectral-scene.ts")], bundle: true, format: "cjs", target: "es2022", platform: "node", treeShaking: true, outfile: path.join(projectRoot, "spectral-engine.cjs"), logLevel: "info"};
if (production) {
  await context.rebuild();
  await esbuild.build(engineOptions);
  await context.dispose();
} else {
  await context.watch();
  const engineContext = await esbuild.context(engineOptions);
  await engineContext.watch();
}
