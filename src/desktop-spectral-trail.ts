import { requestUrl } from "obsidian";

type TrailPoint={time:number;x:number;y:number;z:number;hue:number;strength:number};

async function analyze(url:string):Promise<{points:TrailPoint[];duration:number}>{
  const response=await requestUrl({url});
  if(response.status<200||response.status>=300)throw new Error(`Audio HTTP ${response.status}`);
  const context=new AudioContext();
  try{
    const buffer=await context.decodeAudioData(response.arrayBuffer.slice(0));
    const channel=buffer.getChannelData(0),size=512,hop=Math.max(256,Math.ceil(Math.max(1,channel.length-size)/720)),bins=Math.min(128,size/2),previous=new Float32Array(bins),points:TrailPoint[]=[];
    for(let offset=0;offset+size<=channel.length;offset+=hop){
      let rms=0;const re=new Float32Array(bins),im=new Float32Array(bins);
      for(let n=0;n<size;n++){const sample=channel[offset+n]*(.5-.5*Math.cos(2*Math.PI*n/(size-1)));rms+=sample*sample;for(let k=0;k<bins;k++){const angle=2*Math.PI*k*n/size;re[k]+=sample*Math.cos(angle);im[k]-=sample*Math.sin(angle);}}
      let total=0,weighted=0,spread=0,flux=0;const magnitude=new Float32Array(bins);
      for(let k=1;k<bins;k++){const value=Math.hypot(re[k],im[k]);magnitude[k]=value;total+=value;weighted+=value*k;flux+=Math.max(0,value-previous[k]);}
      const centroid=total?weighted/total:0;for(let k=1;k<bins;k++)spread+=magnitude[k]*(k-centroid)**2;
      const hz=centroid*buffer.sampleRate/size,spreadHz=Math.sqrt(spread/Math.max(total,1))*buffer.sampleRate/size,energy=Math.min(1,Math.sqrt(rms/size)*5),normalizedFlux=Math.min(1,flux/Math.max(total,1));
      points.push({time:offset/buffer.sampleRate,x:offset/channel.length*2-1,y:Math.min(1,hz/10000)*1.5-.7,z:(Math.min(1,spreadHz/6000)-.5)*.9+normalizedFlux*.35,hue:220+Math.min(1,hz/10000)*140,strength:.18+energy*.55+normalizedFlux*.27});
      previous.set(magnitude);
    }
    return{points,duration:buffer.duration};
  }finally{void context.close();}
}

export function mountDesktopSpectralTrail(audio:HTMLAudioElement,host:HTMLElement,url:string){
  const shell=host.createDiv({cls:"meta-quest-spectral-desktop"}),toolbar=shell.createDiv({cls:"meta-quest-spectral-toolbar"});
  toolbar.createSpan({text:"Identidade espectral 3D"});
  const rotateButton=toolbar.createEl("button",{text:"Rotação: desligada"}),resetButton=toolbar.createEl("button",{text:"Redefinir câmera"});
  const canvas=shell.createEl("canvas",{cls:"meta-quest-spectral-canvas",attr:{width:"960",height:"480","aria-label":"Trilha espectral tridimensional"}}),ctx=canvas.getContext("2d");
  let points:TrailPoint[]=[],duration=0,yaw=-.55,pitch=.28,autoRotate=false,drag:null|{x:number;y:number;yaw:number;pitch:number}=null,frame=0,disposed=false;
  const project=(p:{x:number;y:number;z:number})=>{const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),x=p.x*cy-p.z*sy,z=p.x*sy+p.z*cy,y=p.y*cp-z*sp,depth=p.y*sp+z*cp+3.2,scale=310/depth;return{x:canvas.width/2+x*scale,y:canvas.height*.56-y*scale,visible:depth>.2};};
  function grid(){if(!ctx)return;ctx.strokeStyle="rgba(112,151,190,.2)";ctx.lineWidth=1;for(let i=-5;i<=5;i++){for(const [a,b] of [[{x:i/5,y:-.72,z:-1},{x:i/5,y:-.72,z:1}],[{x:-1,y:-.72,z:i/5},{x:1,y:-.72,z:i/5}]]){const pa=project(a),pb=project(b);ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();}}}
  function render(){if(disposed||!ctx)return;ctx.fillStyle="#050b13";ctx.fillRect(0,0,canvas.width,canvas.height);grid();if(autoRotate)yaw+=.0025;const identity=audio.ended||(duration>0&&audio.currentTime>=duration-.08&&audio.paused),start=identity?0:Math.max(0,audio.currentTime-3.25),end=identity?duration:audio.currentTime;ctx.lineWidth=identity?1.65:2.2;let previous:ReturnType<typeof project>|null=null;for(const point of points){if(point.time<start||point.time>end){previous=null;continue;}const current=project(point);if(previous&&current.visible){const alpha=identity?Math.max(.18,point.strength*.72):point.strength*Math.max(.12,1-(end-point.time)/3.25);ctx.strokeStyle=`hsla(${point.hue},92%,62%,${alpha})`;ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(current.x,current.y);ctx.stroke();}previous=current;}ctx.fillStyle="rgba(224,238,252,.72)";ctx.font="24px system-ui";ctx.fillText(identity?"assinatura completa":"janela temporal atual",24,40);frame=requestAnimationFrame(render);}
  rotateButton.onclick=()=>{autoRotate=!autoRotate;rotateButton.setText(`Rotação: ${autoRotate?"ligada":"desligada"}`);};resetButton.onclick=()=>{yaw=-.55;pitch=.28;};
  canvas.addEventListener("pointerdown",event=>{drag={x:event.clientX,y:event.clientY,yaw,pitch};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener("pointermove",event=>{if(!drag)return;yaw=drag.yaw+(event.clientX-drag.x)*.008;pitch=Math.max(-1.2,Math.min(1.2,drag.pitch+(event.clientY-drag.y)*.008));});
  canvas.addEventListener("pointerup",()=>{drag=null;});canvas.addEventListener("pointercancel",()=>{drag=null;});
  const observer=new MutationObserver(()=>{if(document.contains(shell))return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});
  void analyze(url).then(result=>{points=result.points;duration=result.duration;}).catch(error=>{toolbar.createSpan({text:`Análise indisponível: ${error instanceof Error?error.message:String(error)}`});});
  render();return shell;
}
