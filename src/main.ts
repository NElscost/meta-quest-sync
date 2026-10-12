import { promises as fs } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import {
  App,
  FileSystemAdapter,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type SettingDefinitionRender,
  debounce,
  requireApiVersion,
  requestUrl
} from "obsidian";
import { exportVaultGraph } from "./graph-exporter";
import { createPairingUrl } from "./pairing";
import { ActiveSession, SessionManager } from "./session-manager";
import { isPortuguese, setLanguagePreference, tr, type LanguagePreference } from "./i18n";
import { renderIucnStatus, renderSpeciesMap } from "./species-map";
import { renderIucn } from "./iucn";
import { renderFasta } from "./fasta";
import { AudioSpectralRenderChild } from "./audio-spectral";
import { setPluginApp } from "./plugin-context";
import { objectValue } from "./species-data";

interface ObsidianArSettings {
  interfaceLanguage: LanguagePreference;
  projectRoot: string;
  viewerUrl: string;
  port: number;
  tunnelMode: "quick" | "named";
  tunnelUrl: string;
  tunnelTokenFile: string;
  excludedFolders: string;
  excludedTags: string;
  autoExport: boolean;
}

const DEFAULT_SETTINGS: ObsidianArSettings = {
  interfaceLanguage: "system",
  projectRoot: "",
  viewerUrl: "https://space-ar-quest.elscost.chatgpt.site/",
  port: 8765,
  tunnelMode: "quick",
  tunnelUrl: "",
  tunnelTokenFile: ".cloudflare-tunnel-token",
  excludedFolders: "",
  excludedTags: "",
  autoExport: true
};

function listSetting(value: string): string[] {
  return value
    .split(/[\n,]/u)
    .map((item) => item.trim().replace(/^\/+|\/+$/gu, ""))
    .filter(Boolean);
}

class PairingModal extends Modal {
  constructor(
    app: App,
    private readonly pairingUrl: string,
    private readonly session: ActiveSession
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(tr("Meta Quest Sync pronto", "Meta Quest Sync ready"));
    this.contentEl.addClass("obsidian-ar-pairing");
    this.contentEl.createEl("p", {
      text: tr("Abra a câmera ou o navegador do Quest e leia o QR Code. A URL e o token ficam no fragmento e são removidos da barra após o pareamento.", "Open the Quest camera or browser and scan the QR code. The URL and token are stored in the fragment and removed from the address bar after pairing.")
    });
    const canvas = this.contentEl.createEl("canvas");
    void QRCode.toCanvas(canvas, this.pairingUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M"
    }).catch((error: unknown) => {
      console.error(tr("Meta Quest Sync não conseguiu desenhar o QR Code.", "Meta Quest Sync could not render the QR code."), error);
      canvas.replaceWith(this.contentEl.createEl("p", {
        cls: "obsidian-ar-status",
        text: tr("Não foi possível desenhar o QR Code. Use o botão Copiar link abaixo.", "The QR code could not be rendered. Use the Copy link button below.")
      }));
    });
    this.contentEl.createEl("p", {
      cls: "obsidian-ar-status",
      text: tr(`Ponte ativa em ${this.session.url}`, `Bridge active at ${this.session.url}`)
    });
    const text = this.contentEl.createEl("textarea", {
      cls: "obsidian-ar-pairing-url"
    });
    text.value = this.pairingUrl;
    text.readOnly = true;
    const actions = this.contentEl.createDiv({ cls: "obsidian-ar-actions" });
    const copy = actions.createEl("button", { text: tr("Copiar link", "Copy link") });
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.pairingUrl).then(
        () => new Notice(tr("Link de pareamento copiado.", "Pairing link copied.")),
        () => {
          text.focus();
          text.select();
          new Notice(tr("Selecione e copie o link exibido.", "Select and copy the displayed link."));
        }
      );
    });
    const open = actions.createEl("button", { text: tr("Abrir visualizador", "Open viewer") });
    open.addEventListener("click", () => window.open(this.pairingUrl, "_blank", "noopener"));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export default class ObsidianArPlugin extends Plugin {
  settings: ObsidianArSettings = DEFAULT_SETTINGS;
  private readonly sessionManager = new SessionManager();
  private activeSession: ActiveSession | null = null;
  private startPromise: Promise<boolean> | null = null;
  sessionStatus = tr("Nenhuma sessão conectada.", "No session connected.");
  private exportGraphDebounced = debounce(() => {
    if (this.settings.autoExport) void this.exportGraph(false);
  }, 1500, true);

  async onload(): Promise<void> {
    setPluginApp(this.app);
    await this.loadSettings();
    setLanguagePreference(this.settings.interfaceLanguage);
    this.sessionStatus = tr("Nenhuma sessão conectada.", "No session connected.");
    this.addRibbonIcon("glasses", tr("Conectar Meta Quest Sync", "Connect Meta Quest Sync"), () => void this.startAr());
    this.addCommand({
      id: "start-ar-session",
      name: tr("Conectar à sessão AR", "Connect to AR session"),
      callback: () => void this.startAr()
    });
    this.addCommand({
      id: "show-ar-pairing",
      name: tr("Mostrar QR Code da sessão AR", "Show AR session QR code"),
      checkCallback: (checking) => {
        if (!this.activeSession) return false;
        if (!checking) this.showPairing();
        return true;
      }
    });
    this.addCommand({
      id: "export-ar-graph",
      name: tr("Atualizar snapshot do grafo", "Refresh graph snapshot"),
      callback: () => void this.exportGraph(true)
    });
    this.addCommand({
      id: "stop-ar-session",
      name: tr("Desconectar da sessão AR", "Disconnect from AR session"),
      callback: () => void this.stopAr()
    });
    this.registerMarkdownCodeBlockProcessor("species-map", (source, element, context) => {
      void renderSpeciesMap(source, element, { analyzeAudio: (url) => this.analyzeAudio(context.sourcePath, url) });
    });
    this.registerMarkdownCodeBlockProcessor("iucn", (source, element) => renderIucn(source, element));
    this.registerMarkdownCodeBlockProcessor("fasta", (source, element) => renderFasta(source, element));
    this.registerMarkdownPostProcessor((element) => {
      renderIucnStatus(element);
    });
    const globalAudioSpectral = new AudioSpectralRenderChild(document.body, {
      resolveSource: (media) => this.resolveAudioSource(this.app.workspace.getActiveFile()?.path ?? "", media),
      analyzeAudio: (source) => this.analyzeAudio(this.app.workspace.getActiveFile()?.path ?? "", source)
    });
    globalAudioSpectral.onload();
    this.register(() => globalAudioSpectral.onunload());
    this.addSettingTab(new ObsidianArSettingTab(this.app, this));
    this.registerEvent(this.app.vault.on("create", this.exportGraphDebounced));
    this.registerEvent(this.app.vault.on("delete", this.exportGraphDebounced));
    this.registerEvent(this.app.vault.on("rename", this.exportGraphDebounced));
    this.registerEvent(this.app.vault.on("modify", this.exportGraphDebounced));
  }

  onunload(): void {
    this.exportGraphDebounced.cancel();
    setPluginApp(null);
  }

  private vaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error(tr("Meta Quest Sync requer um vault local no aplicativo desktop.", "Meta Quest Sync requires a local vault in the desktop app."));
    }
    return adapter.getBasePath();
  }

  async exportGraph(showNotice: boolean): Promise<void> {
    const root = this.settings.projectRoot.trim();
    if (!root) {
      if (showNotice) new Notice(tr("Configure a pasta do projeto Meta Quest Sync.", "Configure the Meta Quest Sync project folder."));
      return;
    }
    const graph = exportVaultGraph(
      this.app,
      listSetting(this.settings.excludedFolders),
      listSetting(this.settings.excludedTags)
    );
    await fs.writeFile(path.join(root, "graph.json"), `${JSON.stringify(graph)}\n`, "utf8");
    if (showNotice) new Notice(tr(`Grafo atualizado: ${graph.nodes.length} notas.`, `Graph updated: ${graph.nodes.length} notes.`));
  }

  private setSessionStatus(message: string, report?: (message: string) => void): void {
    this.sessionStatus = message;
    report?.(message);
  }

  async startAr(report?: (message: string) => void, showPairing = true): Promise<boolean> {
    if (this.activeSession) {
      if (showPairing) this.showPairing();
      this.setSessionStatus(showPairing ? tr("Sessão ativa. QR Code aberto novamente.", "Session active. QR code opened again.") : tr("Ponte existente reutilizada silenciosamente.", "Existing bridge reused silently."), report);
      return true;
    }
    if (this.startPromise) {
      this.setSessionStatus(tr("A sessão já está sendo iniciada…", "The session is already starting…"), report);
      return this.startPromise;
    }
    const root = this.settings.projectRoot.trim();
    if (!root) {
      new Notice(tr("Abra Configurações → Meta Quest Sync e informe a pasta do projeto.", "Open Settings → Meta Quest Sync and select the project folder."));
      this.setSessionStatus(tr("Informe a pasta do projeto antes de conectar.", "Select the project folder before connecting."), report);
      return false;
    }
    this.startPromise = (async () => {
      try {
        this.setSessionStatus(tr("Exportando o grafo do vault…", "Exporting the vault graph…"), report);
        new Notice(tr("Meta Quest Sync: preparando o grafo e procurando a ponte local…", "Meta Quest Sync: preparing the graph and looking for the local bridge…"), 8000);
        await this.exportGraph(false);
        this.setSessionStatus(tr("Salvando a configuração da ponte…", "Saving the bridge configuration…"), report);
        await this.sessionManager.configure(this.settings, this.vaultPath());
        this.activeSession = await this.sessionManager.connect(this.settings);
        if (showPairing) this.showPairing();
        this.setSessionStatus(showPairing ? tr("Sessão pronta para parear com o Quest.", "Session ready to pair with the Quest.") : tr("Ponte de análise conectada.", "Analysis bridge connected."), report);
        if (showPairing) new Notice(tr("Meta Quest Sync pronto para parear com o Quest.", "Meta Quest Sync is ready to pair with the Quest."));
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(tr("Meta Quest Sync não conectou.", "Meta Quest Sync failed to connect."), error);
        this.setSessionStatus(tr(`Falha: ${message}`, `Failure: ${message}`), report);
        new Notice(`Meta Quest Sync: ${message}`, 12000);
        return false;
      } finally {
        this.startPromise = null;
      }
    })();
    return this.startPromise;
  }

  private resolveAudioSource(notePath: string, audio: HTMLMediaElement): string | null {
    const embedded = audio.closest<HTMLElement>(".internal-embed")?.getAttribute("src")
      ?? audio.dataset.path ?? audio.getAttribute("data-path") ?? audio.getAttribute("src") ?? audio.currentSrc;
    if (!embedded) return null;
    if (/^https:\/\//iu.test(embedded)) return embedded;
    if (/^app:\/\//iu.test(embedded)) {
      try {
        const decoded = decodeURIComponent(new URL(embedded).pathname).replace(/^\/+|\\/gu, "/");
        const vault = this.vaultPath().replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
        const index = decoded.toLowerCase().indexOf(vault.toLowerCase());
        if (index >= 0) return decoded.slice(index + vault.length).replace(/^\/+/, "");
      } catch { return null; }
    }
    const clean = embedded.split(/[?#]/u, 1)[0];
    return this.app.metadataCache.getFirstLinkpathDest(clean, notePath)?.path ?? clean.replace(/^\/+/, "");
  }

  private async analyzeAudio(notePath: string, source: string): Promise<unknown> {
    if (!this.activeSession) this.activeSession = await this.sessionManager.attach(this.settings);
    if (!this.activeSession) {
      throw new Error(tr("A ponte não está ativa na porta 8765. Inicie-a pelo projeto auxiliar e tente novamente.", "The bridge is not running on port 8765. Start it from the companion project and try again."));
    }
    const session = this.activeSession;
    if (!session) throw new Error(tr("A sessão de análise não está ativa.", "The analysis session is not active."));
    const remote = /^https:\/\//iu.test(source);
    const remoteVideo=remote&&(/(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/iu.test(source)||/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/iu.test(source));
    const endpoint=remote?(remoteVideo?"remote-spectral-analysis":"remote-audio-ticket"):"spectral-analysis";
    const body = remote ? { notePath, url: source } : { notePath, assetPath: source };
    const response = await requestUrl({
      url: `${session.localUrl.replace(/\/+$/u, "")}/${endpoint}`, method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.text === "string" ? response.text.trim() : "";
      throw new Error(details || `Spectral analysis HTTP ${response.status}`);
    }
    const result = response.json as { spectral?: unknown; method?: string };
    if (remote && !remoteVideo) {
      if (!result?.spectral) throw new Error(tr("O áudio remoto não pôde ser analisado.", "The remote audio could not be analyzed."));
      return result.spectral;
    }
    return result;
  }

  async stopAr(): Promise<void> {
    this.activeSession = null;
    this.sessionStatus = tr("Sessão desconectada.", "Session disconnected.");
    new Notice(tr("Meta Quest Sync desconectado. A ponte externa continua sob controle do usuário.", "Meta Quest Sync disconnected. The external bridge remains under user control."));
  }

  private showPairing(): void {
    if (!this.activeSession) return;
    try {
      const url = createPairingUrl(
        this.settings.viewerUrl,
        this.activeSession.url,
        this.activeSession.token,
        isPortuguese() ? "pt" : "en"
      );
      const modal = new PairingModal(this.app, url, this.activeSession);
      const settings = (this.app as App & {
        setting?: { close: () => void };
      }).setting;
      settings?.close();
      window.setTimeout(() => modal.open(), 120);
    } catch (error) {
      new Notice(tr(`Pareamento inválido: ${String(error)}`, `Invalid pairing: ${String(error)}`));
    }
  }

  async loadSettings(): Promise<void> {
    const stored = objectValue(await this.loadData() as unknown);
    this.settings = { ...DEFAULT_SETTINGS };
    for (const key of ["projectRoot", "viewerUrl", "tunnelUrl", "tunnelTokenFile", "excludedFolders", "excludedTags"] as const) {
      if (typeof stored[key] === "string") this.settings[key] = stored[key];
    }
    if (stored.interfaceLanguage === "en") this.settings.interfaceLanguage = "en";
    if (stored.tunnelMode === "named") this.settings.tunnelMode = "named";
    if (typeof stored.autoExport === "boolean") this.settings.autoExport = stored.autoExport;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class ObsidianArSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ObsidianArPlugin) { super(app, plugin); }

  getSettingDefinitions(): SettingDefinitionRender[] {
    const fields: SettingDefinitionRender[] = [];
    const text = (key: "projectRoot" | "viewerUrl" | "tunnelUrl" | "tunnelTokenFile" | "excludedFolders" | "excludedTags", name: string, desc: string, multiline = false) => {
      fields.push({ name, desc, render: setting => {
        const configure = (control: import("obsidian").TextComponent | import("obsidian").TextAreaComponent) => {
          control.setValue(this.plugin.settings[key]).onChange(async value => {
            this.plugin.settings[key] = value.trim();
            await this.plugin.saveSettings();
          });
        };
        if (multiline) setting.addTextArea(configure); else setting.addText(configure);
      } });
    };
    fields.push({ name: tr("Idioma da interface", "Interface language"),
      desc: tr("Use o idioma do Obsidian ou selecione inglês.", "Use the Obsidian language or select English."),
      render: setting => { setting.addDropdown(control => control.addOption("system", tr("Idioma do sistema", "System language"))
        .addOption("en", "English").setValue(this.plugin.settings.interfaceLanguage).onChange(async value => {
          this.plugin.settings.interfaceLanguage = value === "en" ? "en" : "system";
          setLanguagePreference(this.plugin.settings.interfaceLanguage);
          await this.plugin.saveSettings(); this.refreshSettings();
        })); } });
    text("projectRoot", tr("Pasta do projeto", "Project folder"), tr("Pasta absoluta do clone Obsidian-Ar.", "Absolute path to the Obsidian-Ar clone."));
    text("viewerUrl", tr("Visualizador HTTPS", "HTTPS viewer"), tr("Site WebXR aberto pelo QR code.", "WebXR site opened by the QR code."));
    fields.push({ name: tr("Porta local", "Local port"), desc: "8765", render: setting => {
      setting.addText(control => control.setValue("8765").setDisabled(true));
    } });
    fields.push({ name: tr("Tipo de túnel", "Tunnel type"), render: setting => {
      setting.addDropdown(control => control.addOption("quick", "Cloudflare quick tunnel")
        .addOption("named", "Cloudflare named tunnel").setValue(this.plugin.settings.tunnelMode).onChange(async value => {
          this.plugin.settings.tunnelMode = value === "named" ? "named" : "quick";
          await this.plugin.saveSettings(); this.refreshSettings();
        }));
    } });
    // Keep the definitions searchable even when quick-tunnel mode is selected.
    text("tunnelUrl", tr("URL do túnel nomeado", "Named tunnel URL"), tr("Usado no modo named.", "Used in named mode."));
    text("tunnelTokenFile", tr("Arquivo do token do túnel", "Tunnel token file"), tr("Arquivo do projeto auxiliar.", "File in the companion project."));
    text("excludedFolders", tr("Pastas excluídas", "Excluded folders"), tr("Uma pasta por linha ou separada por vírgulas.", "One folder per line or separated by commas."), true);
    text("excludedTags", tr("Tags excluídas", "Excluded tags"), tr("Inclua #; separe por linhas ou vírgulas.", "Include #; separate with lines or commas."), true);
    fields.push({ name: tr("Atualizar grafo automaticamente", "Update graph automatically"), render: setting => {
      setting.addToggle(control => control.setValue(this.plugin.settings.autoExport).onChange(async value => {
        this.plugin.settings.autoExport = value; await this.plugin.saveSettings();
      }));
    } });
    fields.push({ name: tr("Sessão AR", "AR session"), desc: this.plugin.sessionStatus, render: setting => {
      setting.addButton(button => button.setCta().setButtonText(tr("Conectar", "Connect")).onClick(() => {
        button.setDisabled(true);
        void this.plugin.startAr(message => { setting.setDesc(message); }).finally(() => { button.setDisabled(false); });
      })).addButton(button => button.setButtonText(tr("Desconectar", "Disconnect")).onClick(() => {
        void this.plugin.stopAr(); setting.setDesc(this.plugin.sessionStatus);
      }));
    } });
    return fields;
  }

  private refreshSettings(): void {
    if (requireApiVersion("1.13.0")) this.update();
    else this.renderSettings();
  }

  private renderSettings(): void {
    this.containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      const setting = new Setting(this.containerEl).setName(definition.name);
      if (definition.desc) setting.setDesc(definition.desc);
      // These render callbacks only consume the Setting, including on older Obsidian.
      (definition.render as (setting: Setting) => void)(setting);
    }
  }

  // Fallback for Obsidian releases before declarative settings were introduced.
  display(): void { this.renderSettings(); }
}
