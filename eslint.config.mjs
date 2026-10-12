import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["node_modules/**", "main.js", "spectral-engine.cjs", "tests/**", "graphify-out/**", "*.mjs"] },
  ...obsidianmd.configs.recommended,
  { files: ["src/**/*.ts"], languageOptions: { parserOptions: { projectService: true } } }
]);
