import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineBasicMaterial,
  LineSegments, PerspectiveCamera, Points, Scene, ShaderMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";

export type SpectralPoint = {time:number;x:number;y:number;z:number;frequencyHz:number;amplitude:number;spectralFlux:number;tonality:number;strength:number;members?:number};
export type SpectralScene = {
  setTime(time:number,complete:boolean):void;
  setFilters(minHz:number,maxHz:number,minAmplitude:number,lifetime:number):void;
  setOrbit(on:boolean):void;
  orbitBy(yaw:number,pitch:number):void;
  zoomBy(factor:number):void;
  resetCamera():void;
  resize(width:number,height:number):void;
  render():void;
  labels(max:number):Array<{x:number;y:number;time:number;age:number;amplitude:number;frequencyHz:number;color:string}>;
  dispose():void;
};

const stops=[20,2000,3000,4000,5000,6000,7000,8000,9000,10000,18000];
const palette=[[7,20,111],[7,20,111],[22,76,255],[157,40,232],[255,41,168],[255,51,24],[255,230,0],[37,237,0],[0,239,200],[245,255,232],[255,255,255]];
function colorFor(hz:number){let i=1;while(i<stops.length-1&&hz>stops[i])i++;const t=Math.max(0,Math.min(1,(hz-stops[i-1])/(stops[i]-stops[i-1])));return new Color().setRGB(...([0,1,2].map(c=>(palette[i-1][c]+(palette[i][c]-palette[i-1][c])*t)/255) as [number,number,number]),SRGBColorSpace);}
const uniforms=()=>({uTime:{value:0},uLifetime:{value:3.25},uMinHz:{value:0},uMaxHz:{value:18000},uMinAmp:{value:0},uComplete:{value:0},uPixelRatio:{value:1},uMaxPointSize:{value:256}});

export function createSpectralScene(canvas:HTMLCanvasElement,points:SpectralPoint[]):SpectralScene{
  const renderer=new WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:"low-power"});
  return createSpectralSceneWithRenderer(renderer,points,true);
}

/** Reusable by WebXR: the caller may provide an xr-enabled renderer and owns its lifecycle. */
export function createSpectralSceneWithRenderer(renderer:WebGLRenderer,points:SpectralPoint[],ownsRenderer=false):SpectralScene{
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace=SRGBColorSpace;
  renderer.setClearColor(0x050b13,1);
  const scene=new Scene(),camera=new PerspectiveCamera(47,2,.01,100);
  let yaw=-.55,pitch=.28,distance=3.5,orbit=false,disposed=false;
  const pGeom=new BufferGeometry(),count=points.length;
  const pos=new Float32Array(count*3),rgb=new Float32Array(count*3),time=new Float32Array(count),hz=new Float32Array(count),amp=new Float32Array(count),weight=new Float32Array(count);
  points.forEach((p,i)=>{const c=colorFor(p.frequencyHz);pos.set([p.x,p.y,p.z],i*3);rgb.set([c.r,c.g,c.b],i*3);time[i]=p.time;hz[i]=p.frequencyHz;amp[i]=p.amplitude;weight[i]=Math.min(2.6,1+Math.log2(p.members||1)*.22);});
  pGeom.setAttribute("position",new BufferAttribute(pos,3));pGeom.setAttribute("aColor",new BufferAttribute(rgb,3));pGeom.setAttribute("aTime",new BufferAttribute(time,1));pGeom.setAttribute("aHz",new BufferAttribute(hz,1));pGeom.setAttribute("aAmp",new BufferAttribute(amp,1));pGeom.setAttribute("aWeight",new BufferAttribute(weight,1));
  const shared=uniforms();shared.uPixelRatio.value=Math.min(window.devicePixelRatio||1,1.5);const gl=renderer.getContext(),pointSizeRange=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array|number[];shared.uMaxPointSize.value=Math.min(256,Math.max(1,Number(pointSizeRange?.[1])||256));
  const pMat=new ShaderMaterial({uniforms:shared,transparent:true,depthWrite:false,blending:AdditiveBlending,
    vertexShader:`attribute vec3 aColor; attribute float aTime,aHz,aAmp,aWeight; uniform float uTime,uLifetime,uMinHz,uMaxHz,uMinAmp,uComplete,uPixelRatio,uMaxPointSize; varying vec3 vColor; varying float vAlpha;
      void main(){float age=uTime-aTime;float live=step(0.0,age)*clamp(1.0-age/max(.1,uLifetime),0.0,1.0);float allowed=step(uMinHz,aHz)*step(aHz,uMaxHz)*step(uMinAmp,aAmp);vAlpha=allowed*(uComplete>.5?0.0:live);float birth=1.0-smoothstep(0.0,.55,age);vColor=mix(aColor,vec3(1.0),birth);vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float birthPhase=clamp(age/.55,0.0,1.0);float settle=birthPhase*birthPhase*(3.0-2.0*birthPhase);float pop=1.0+4.0*(1.0-settle);float normalSize=(4.0+aAmp*9.0)*aWeight*uPixelRatio*3.2/max(.5,-mv.z);gl_PointSize=clamp(normalSize*pop,1.0,uMaxPointSize);}`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){if(vAlpha<=.005)discard;vec2 uv=gl_PointCoord-.5;float box=max(abs(uv.x),abs(uv.y));float edge=1.0-smoothstep(.34,.48,box);float hollow=smoothstep(.20,.30,box);float core=1.0-smoothstep(.03,.10,length(uv));float glow=exp(-length(uv)*7.0)*.18;float alpha=(edge*hollow+core+glow)*vAlpha;gl_FragColor=vec4(vColor,alpha);}`});
  const cloud=new Points(pGeom,pMat);cloud.frustumCulled=false;scene.add(cloud);
  // Segments use static attributes; the shader clips both ends to the audio window.
  const segments:number[]=[],segmentColor:number[]=[],segmentTime:number[]=[],segmentHz:number[]=[],segmentAmp:number[]=[];
  function link(a:SpectralPoint,b:SpectralPoint){for(const p of [a,b]){segments.push(p.x,p.y,p.z);const c=colorFor(p.frequencyHz);segmentColor.push(c.r,c.g,c.b);segmentTime.push(p.time);segmentHz.push(p.frequencyHz);segmentAmp.push(p.amplitude);}}
  for(let i=1;i<count;i++){const a=points[i-1],b=points[i];if(b.time-a.time<.28&&Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)<.8)link(a,b);}
  // Sparse local chords approximate the spectral hubs without a dense O(n²) graph.
  for(let i=12;i<count;i+=4){const b=points[i],start=Math.max(0,i-240),step=Math.max(1,Math.ceil((i-start)/24));let first=-1,second=-1,firstScore=.52,secondScore=.52;for(let j=start;j<i-7;j+=step){const a=points[j],s=Math.abs(Math.log2(b.frequencyHz/a.frequencyHz))*.65+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)*.13;if(s<firstScore){second=first;secondScore=firstScore;first=j;firstScore=s;}else if(s<secondScore&&Math.abs(j-first)>5){second=j;secondScore=s;}}if(first>=0)link(points[first],b);if(second>=0)link(points[second],b);}
  const lGeom=new BufferGeometry();lGeom.setAttribute("position",new BufferAttribute(new Float32Array(segments),3));lGeom.setAttribute("aColor",new BufferAttribute(new Float32Array(segmentColor),3));lGeom.setAttribute("aTime",new BufferAttribute(new Float32Array(segmentTime),1));lGeom.setAttribute("aHz",new BufferAttribute(new Float32Array(segmentHz),1));lGeom.setAttribute("aAmp",new BufferAttribute(new Float32Array(segmentAmp),1));
  const lMat=new ShaderMaterial({uniforms:shared,transparent:true,depthWrite:false,blending:AdditiveBlending,
    vertexShader:`attribute vec3 aColor;attribute float aTime,aHz,aAmp;uniform float uTime,uLifetime,uMinHz,uMaxHz,uMinAmp,uComplete;varying vec3 vColor;varying float vAlpha;void main(){float age=uTime-aTime;float live=step(0.0,age)*clamp(1.0-age/max(.1,uLifetime),0.0,1.0);float allowed=step(uMinHz,aHz)*step(aHz,uMaxHz)*step(uMinAmp,aAmp);vAlpha=allowed*(uComplete>.5?.2:live*.31);vColor=aColor;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){if(vAlpha<=.005)discard;gl_FragColor=vec4(vColor,vAlpha);}`});
  const lines=new LineSegments(lGeom,lMat);lines.frustumCulled=false;scene.add(lines);
  // Cheap 3D grid: one material and one geometry.
  const gridCoords:number[]=[];for(let i=-5;i<=5;i++){const v=i/5;gridCoords.push(v,-1,-1,v,-1,1,-1,-1,v,1,-1,v,-1,v,-1,1,v,-1);}const gGeom=new BufferGeometry();gGeom.setAttribute("position",new BufferAttribute(new Float32Array(gridCoords),3));const gMat=new LineBasicMaterial({color:0x35516b,transparent:true,opacity:.2});scene.add(new LineSegments(gGeom,gMat));
  function cameraUpdate(){camera.position.set(distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch));camera.lookAt(0,0,0);}
  cameraUpdate();
  return{
    setTime(value,complete){shared.uTime.value=value;shared.uComplete.value=complete?1:0;},
    setFilters(min,max,intensity,lifetime){shared.uMinHz.value=min;shared.uMaxHz.value=max;shared.uMinAmp.value=intensity;shared.uLifetime.value=lifetime;},
    setOrbit(on){orbit=on;},orbitBy(dy,dp){yaw+=dy;pitch=Math.max(-1.35,Math.min(1.35,pitch+dp));cameraUpdate();},
    zoomBy(factor){distance=Math.max(1.2,Math.min(12,distance*factor));cameraUpdate();},
    resetCamera(){yaw=-.55;pitch=.28;distance=3.5;cameraUpdate();},
    resize(w,h){const width=Math.max(1,w),height=Math.max(1,h);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();},
    render(){if(disposed)return;if(orbit){yaw+=.002;cameraUpdate();}renderer.render(scene,camera);},
    labels(max){const current=shared.uTime.value,lifetime=shared.uLifetime.value,min=shared.uMinHz.value,maxHz=shared.uMaxHz.value,minAmp=shared.uMinAmp.value,width=renderer.domElement.clientWidth||960,height=renderer.domElement.clientHeight||480,result:Array<{x:number;y:number;time:number;age:number;amplitude:number;frequencyHz:number;color:string}>=[];if(max<=0)return result;const spacing=Math.max(1,Math.round(lifetime*60/max));for(let i=points.length-1;i>=0&&result.length<max;i--){const p=points[i],age=current-p.time;if(age<0||age>lifetime||p.frequencyHz<min||p.frequencyHz>maxHz||p.amplitude<minAmp||i%spacing!==0)continue;const v=new Vector3(p.x,p.y,p.z).project(camera);if(v.z<-1||v.z>1||Math.abs(v.x)>1.15||Math.abs(v.y)>1.15)continue;const c=colorFor(p.frequencyHz);result.push({x:(v.x*.5+.5)*width,y:(-.5*v.y+.5)*height,time:p.time,age,amplitude:p.amplitude,frequencyHz:p.frequencyHz,color:c.getStyle(SRGBColorSpace)});}return result;},
    dispose(){if(disposed)return;disposed=true;pGeom.dispose();lGeom.dispose();gGeom.dispose();pMat.dispose();lMat.dispose();gMat.dispose();if(ownsRenderer){renderer.dispose();renderer.forceContextLoss();}},
  };
}
