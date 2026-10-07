import { promises as fs } from "node:fs";
import path from "node:path";
import { requestUrl } from "obsidian";
import { tr } from "./i18n";

export interface SessionSettings {
  projectRoot: string;
  port: number;
  tunnelMode: "quick" | "named";
  tunnelUrl: string;
  tunnelTokenFile: string;
}

export interface ActiveSession {
  url: string;
  localUrl: string;
  token: string;
  serverPid: number;
  tunnelPid: number;
}

interface ProcessState {
  url: string;
  port?: number;
  serverPid: number;
  tunnelPid: number;
}

function parseProcessState(contents: string): ProcessState {
  return JSON.parse(contents.replace(/^\uFEFF/u, "")) as ProcessState;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class SessionManager {
  async configure(settings: SessionSettings, vaultPath: string): Promise<void> {
    const configPath = path.join(settings.projectRoot, "note-bridge.config.json");
    const config = {
      vaultPath,
      port: settings.port,
      tunnelMode: settings.tunnelMode,
      tunnelUrl: settings.tunnelUrl.trim().replace(/\/+$/u, ""),
      tunnelTokenFile: settings.tunnelTokenFile.trim() || ".cloudflare-tunnel-token"
    };
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  async attach(settings: SessionSettings): Promise<ActiveSession | null> {
    const root = path.resolve(settings.projectRoot);
    const statePath = path.join(root, ".note-bridge-processes.json");
    const tokenPath = path.join(root, ".note-bridge-token");
    if (!(await exists(statePath)) || !(await exists(tokenPath))) return null;
    try {
      const state = parseProcessState(await fs.readFile(statePath, "utf8"));
      const token = (await fs.readFile(tokenPath, "utf8")).trim();
      const port = Number.isInteger(state.port) ? state.port as number : settings.port;
      if (port !== settings.port || token.length < 32) return null;
      const localUrl = `http://127.0.0.1:${port}`;
      const response = await requestUrl({
        url: `${localUrl}/verify`,
        headers: { Authorization: `Bearer ${token}` },
        throw: false
      });
      if (response.status < 200 || response.status >= 300) return null;
      const verification = response.json as { capabilities?: string[] };
      const capabilities = verification.capabilities ?? [];
      if (!capabilities.includes("waveform") || !capabilities.includes("mfcc-pca")) return null;
      return {
        ...state,
        url: state.url?.startsWith("https://") ? state.url : localUrl,
        localUrl,
        token
      };
    } catch {
      return null;
    }
  }

  async connect(settings: SessionSettings): Promise<ActiveSession> {
    const attached = await this.attach(settings);
    if (attached) return attached;
    throw new Error(tr(
      "A ponte não está ativa. Inicie-a pelo projeto auxiliar e tente conectar novamente.",
      "The bridge is not running. Start it from the companion project, then connect again."
    ));
  }
}
