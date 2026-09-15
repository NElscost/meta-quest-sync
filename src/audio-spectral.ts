import { MarkdownRenderChild } from "obsidian";
import { mountDesktopSpectralTrail } from "./desktop-spectral-trail";

export interface AudioSpectralOptions {
  resolveSource(audio: HTMLMediaElement): string | null;
  analyzeAudio(source: string): Promise<unknown>;
}

export class AudioSpectralRenderChild extends MarkdownRenderChild {
  private observer: MutationObserver | null = null;
  private scanFrame = 0;

  constructor(container: HTMLElement, private readonly options: AudioSpectralOptions) {
    super(container);
  }

  onload(): void {
    const schedule = () => {
      if (this.scanFrame) return;
      this.scanFrame = window.requestAnimationFrame(() => {
        this.scanFrame = 0;
        this.attachPlayers();
      });
    };
    this.attachPlayers();
    this.observer = new MutationObserver(schedule);
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.scanFrame) window.cancelAnimationFrame(this.scanFrame);
    this.scanFrame = 0;
  }

  private attachPlayers(): void {
    const scope=this.containerEl.closest<HTMLElement>(".markdown-rendered, .markdown-preview-view")??this.containerEl;
    for (const audio of Array.from(scope.querySelectorAll<HTMLMediaElement>("audio,video"))) {
      if (audio.closest(".markdown-source-view")) continue;
      if (audio.dataset.metaQuestSpectralAttached === "true") continue;
      if (audio.parentElement === document.body && document.querySelector(".block-language-audio-player")) continue;
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
        for (const other of Array.from(document.querySelectorAll<HTMLMediaElement>("audio,video"))) {
          if (other !== audio && !other.paused) other.pause();
        }
        if (audio.paused) void audio.play().catch(() => undefined);
        trail = mountDesktopSpectralTrail(audio, controls, () => this.options.analyzeAudio(source), { storageKey: source });
        button.textContent = "Fechar rastro 3D";
      });
    }
    const audioPlayerBlocks=Array.from(document.querySelectorAll<HTMLElement>(".block-language-audio-player")).filter(block=>!block.closest(".markdown-source-view"));
    const detachedPlayers=Array.from(document.querySelectorAll<HTMLAudioElement>("body > audio, body audio"));
    audioPlayerBlocks.forEach((block,index)=>{if(block.dataset.metaQuestSpectralAttached==="true")return;const player=detachedPlayers[index]??detachedPlayers[0];if(!player)return;const source=this.options.resolveSource(player);if(!source)return;block.dataset.metaQuestSpectralAttached="true";player.dataset.metaQuestSpectralAttached="true";const controls=document.createElement("div"),button=document.createElement("button");controls.className="meta-quest-audio-spectral-controls";button.type="button";button.className="meta-quest-audio-spectral-button";button.textContent="Rastro 3D";controls.append(button);block.append(controls);let trail:HTMLElement|null=null;button.onclick=()=>{if(trail){trail.remove();trail=null;button.textContent="Rastro 3D";return;}for(const other of Array.from(document.querySelectorAll<HTMLMediaElement>("audio,video")))if(other!==player&&!other.paused)other.pause();if(player.paused)void player.play().catch(()=>undefined);trail=mountDesktopSpectralTrail(player,controls,()=>this.options.analyzeAudio(source),{storageKey:source});button.textContent="Fechar rastro 3D";};});
    const frames=Array.from(scope.querySelectorAll<HTMLIFrameElement>("iframe")).filter(frame=>!frame.closest(".markdown-source-view")&&/(?:releases\.obsidian\.md\/youtube|youtube\.com|youtu\.be)/iu.test(frame.src));
    const visible=frames.find(frame=>frame.getClientRects().length>0)??frames.at(-1);
    for(const frame of frames){if(frame===visible)continue;const sibling=frame.nextElementSibling;if(sibling?.classList.contains("meta-quest-audio-spectral-controls"))sibling.remove();delete frame.dataset.metaQuestSpectralAttached;}
    if(visible){const match=visible.src.match(/(?:releases\.obsidian\.md\/youtube\?v=|youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/iu),id=decodeURIComponent(match?.[1]??""),source="https://www.youtube.com/watch?v="+encodeURIComponent(id);if(id&&!(visible.dataset.metaQuestSpectralAttached==="true"&&visible.nextElementSibling?.classList.contains("meta-quest-audio-spectral-controls"))){visible.dataset.metaQuestSpectralAttached="true";const controls=document.createElement("div"),button=document.createElement("button");controls.className="meta-quest-audio-spectral-controls";button.type="button";button.className="meta-quest-audio-spectral-button";button.textContent="Rastro 3D";controls.append(button);visible.insertAdjacentElement("afterend",controls);let trail:HTMLElement|null=null,dispose:(()=>void)|null=null,analysis:Promise<unknown>|null=null;button.onclick=()=>{if(trail){trail.remove();trail=null;dispose?.();dispose=null;button.textContent="Rastro 3D";return;}const state={currentTime:0,duration:0,paused:false,ended:false,addEventListener:()=>undefined};const receive=(event:MessageEvent)=>{if(event.source!==visible.contentWindow)return;let message:any=event.data;if(typeof message==="string")try{message=JSON.parse(message);}catch{return;}const info=message?.info;if(message?.event==="infoDelivery"&&info){if(Number.isFinite(info.currentTime))state.currentTime=Number(info.currentTime);if(Number.isFinite(info.duration))state.duration=Number(info.duration);if(Number.isFinite(info.playerState)){state.paused=info.playerState!==1;state.ended=info.playerState===0;}}};window.addEventListener("message",receive);dispose=()=>window.removeEventListener("message",receive);const play=()=>{visible.contentWindow?.postMessage(JSON.stringify({event:"listening",id:"meta-quest-spectral"}),"*");visible.contentWindow?.postMessage(JSON.stringify({event:"command",func:"playVideo",args:[]}),"*");};visible.allow=[visible.allow,"autoplay"].filter(Boolean).join("; ");visible.addEventListener("load",play,{once:true});visible.src="https://www.youtube.com/embed/"+encodeURIComponent(id)+"?enablejsapi=1&autoplay=1&playsinline=1&rel=0";window.setTimeout(play,700);analysis??=this.options.analyzeAudio(source);trail=mountDesktopSpectralTrail(state as unknown as HTMLMediaElement,controls,()=>analysis!,{storageKey:source});button.textContent="Fechar rastro 3D";};}}
  }
}
