import { MarkdownRenderChild } from "obsidian";
import { mountDesktopSpectralTrail } from "./desktop-spectral-trail";

export interface AudioSpectralOptions {
  resolveSource(audio: HTMLAudioElement): string | null;
  analyzeAudio(source: string): Promise<unknown>;
}

export class AudioSpectralRenderChild extends MarkdownRenderChild {
  private observer: MutationObserver | null = null;

  constructor(container: HTMLElement, private readonly options: AudioSpectralOptions) {
    super(container);
  }

  onload(): void {
    const attach = () => this.attachPlayers();
    attach();
    this.observer = new MutationObserver(attach);
    this.observer.observe(this.containerEl, { childList: true, subtree: true });
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private attachPlayers(): void {
    for (const audio of Array.from(this.containerEl.querySelectorAll<HTMLAudioElement>("audio"))) {
      if (audio.dataset.metaQuestSpectralAttached === "true") continue;
      if (audio.closest(".meta-quest-species-sound")) continue;
      const source = this.options.resolveSource(audio);
      if (!source) continue;
      audio.dataset.metaQuestSpectralAttached = "true";
      const controls = document.createElement("div");
      controls.className = "meta-quest-audio-spectral-controls";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meta-quest-audio-spectral-button";
      button.textContent = "Rastro 3D";
      button.setAttribute("aria-label", "Abrir identidade espectral em 3D");
      controls.append(button);
      audio.insertAdjacentElement("afterend", controls);
      let trail: HTMLElement | null = null;
      button.addEventListener("click", () => {
        if (trail) {
          trail.remove();
          trail = null;
          button.textContent = "Rastro 3D";
          return;
        }
        trail = mountDesktopSpectralTrail(audio, controls, () => this.options.analyzeAudio(source));
        button.textContent = "Fechar rastro 3D";
      });
    }
  }
}
