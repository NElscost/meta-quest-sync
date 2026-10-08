import { requestUrl, setIcon } from "obsidian";
import * as L from "leaflet";

type Config={taxon:string;center:[number,number];zoom:number};
export type AdministrativeBoundary={geometry:any|null;name:string;countryCode?:string;country?:string;level?:"state"|"country"};
type Options={resolveBoundary:(lat:number,lon:number)=>Promise<AdministrativeBoundary>;selectRegion:(lat:number,lon:number,region:AdministrativeBoundary)=>Promise<{name:string;count:number}>};
type Point=[number,number];
const coordinateCache=new Map<number,Promise<Point[]>>(),MAX_POINTS=3000,PAGE_SIZE=300,CACHE_VERSION="v2";
const pause=(ms:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,ms));
async function json(url:string){let last:unknown;for(let attempt=0;attempt<3;attempt++){try{return(await requestUrl({url})).json;}catch(error){last=error;if(attempt<2)await pause(180*(attempt+1)*(attempt+1));}}throw last;}
async function taxon(name:string){const value=await json("https://api.gbif.org/v1/species/match?name="+encodeURIComponent(name)),key=Number(value.usageKey??value.speciesKey);if(!Number.isFinite(key))throw new Error(`Taxon not found: ${name}`);return{key,name:String(value.scientificName||name)};}
function cacheKey(key:number){return`meta-quest-species-coordinates:${CACHE_VERSION}:${key}`;}
function readStored(key:number):Point[]|null{try{const value=JSON.parse(localStorage.getItem(cacheKey(key))||"null");return value&&Date.now()-value.savedAt<7*864e5&&Array.isArray(value.points)?value.points:null;}catch{return null;}}
function writeStored(key:number,points:Point[]){try{localStorage.setItem(cacheKey(key),JSON.stringify({savedAt:Date.now(),points}));}catch{}}
async function coordinates(key:number){if(coordinateCache.has(key))return coordinateCache.get(key)!;const pending=(async()=>{const stored=readStored(key);if(stored?.length)return stored;const points:Point[]=[],seen=new Set<string>();let offset=0,total=Infinity;while(offset<total&&points.length<MAX_POINTS){const params=new URLSearchParams({taxon_key:String(key),has_coordinate:"true",limit:String(PAGE_SIZE),offset:String(offset)}),page=await json("https://api.gbif.org/v1/occurrence/search?"+params);total=Math.min(Number(page.count)||0,MAX_POINTS);for(const item of page.results||[]){const lat=Number(item.decimalLatitude),lon=Number(item.decimalLongitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const id=`${lon.toFixed(5)}:${lat.toFixed(5)}`;if(seen.has(id))continue;seen.add(id);points.push([lat,lon]);}if(!page.results?.length)break;offset+=PAGE_SIZE;}writeStored(key,points);return points;})().catch(error=>{coordinateCache.delete(key);throw error;});coordinateCache.set(key,pending);return pending;}
export async function mountLeafletSpeciesMap(container:HTMLElement,config:Config,options:Options){
  container.addClass("meta-quest-species-map","meta-quest-species-map-vector");
  const toolbar=container.createDiv({cls:"meta-quest-species-map-toolbar"}),status=toolbar.createSpan({text:"Abrindo mapa global…"}),minus=toolbar.createEl("button",{attr:{"aria-label":"Zoom out"}}),plus=toolbar.createEl("button",{attr:{"aria-label":"Zoom in"}}),host=container.createDiv({cls:"meta-quest-species-vector-host"}),attribution=container.createDiv({cls:"meta-quest-species-attribution",text:"© OpenStreetMap contributors · data © GBIF"});
  setIcon(minus,"zoom-out");setIcon(plus,"zoom-in");
  const map=L.map(host,{center:config.center,zoom:config.zoom,zoomControl:false,attributionControl:false,preferCanvas:false,worldCopyJump:true,zoomAnimation:true,fadeAnimation:true,markerZoomAnimation:true});
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,crossOrigin:true,updateWhenIdle:false,keepBuffer:3}).addTo(map);
  let disposed=false,renderFrame=0,detachTimer=0;
  const resize=new ResizeObserver(()=>{if(!disposed&&host.isConnected)map.invalidateSize({animate:false});});
  const cleanup=()=>{if(disposed)return;disposed=true;window.clearTimeout(detachTimer);cancelAnimationFrame(renderFrame);minus.onclick=null;plus.onclick=null;resize.disconnect();observer.disconnect();map.remove();};
  const observer=new MutationObserver(()=>{window.clearTimeout(detachTimer);if(!container.isConnected)detachTimer=window.setTimeout(()=>{if(!container.isConnected)cleanup();},350);});
  resize.observe(host);observer.observe(document.body,{childList:true,subtree:true});
  minus.onclick=()=>{if(!disposed&&host.isConnected)map.zoomOut(1,{animate:true});};plus.onclick=()=>{if(!disposed&&host.isConnected)map.zoomIn(1,{animate:true});};
  const recordLayer=L.layerGroup().addTo(map),boundaryLayer=L.geoJSON(undefined,{style:{color:"#00ff62",weight:2.4,opacity:.95,fillColor:"#00ff00",fillOpacity:.18},interactive:false}).addTo(map);
  const matched=await taxon(config.taxon);if(disposed||!container.isConnected){cleanup();return;}status.setText(`${matched.name} · carregando coordenadas uma única vez…`);const points=await coordinates(matched.key);if(disposed||!container.isConnected){cleanup();return;}status.setText(`${matched.name} · ${points.length.toLocaleString()} coordenadas em cache`);
  map.invalidateSize({animate:false});
  const drawRecords=()=>{if(disposed||!host.isConnected)return;cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>{if(disposed||!host.isConnected)return;recordLayer.clearLayers();const bounds=map.getBounds().pad(.15),groups=new Map<string,{lat:number;lon:number;count:number}>();for(const point of points){const ll=L.latLng(point[0],point[1]);if(!bounds.contains(ll))continue;const pixel=map.latLngToContainerPoint(ll),key=Math.floor(pixel.x/42)+":"+Math.floor(pixel.y/42),group=groups.get(key)||{lat:0,lon:0,count:0};group.lat+=point[0];group.lon+=point[1];group.count++;groups.set(key,group);}for(const group of groups.values()){const count=group.count,radius=Math.min(17,4+Math.sqrt(count)*2.1),marker=L.circleMarker([group.lat/count,group.lon/count],{radius,color:"#fff0a8",weight:1.7,fillColor:"#e7a52c",fillOpacity:.88});if(count>1)marker.bindTooltip(String(count),{permanent:true,direction:"center",className:"meta-quest-species-count"});recordLayer.addLayer(marker);}});};
  map.on("moveend zoomend resize",drawRecords);drawRecords();
  let hoverTimer:number|null=null,generation=0,last:AdministrativeBoundary={geometry:null,name:""};
  map.on("mousemove",event=>{if(hoverTimer!==null)window.clearTimeout(hoverTimer);const request=++generation;hoverTimer=window.setTimeout(()=>{void options.resolveBoundary(event.latlng.lat,event.latlng.lng).then(result=>{if(request!==generation)return;last=result;boundaryLayer.clearLayers();if(result.geometry)boundaryLayer.addData({type:"Feature",properties:{},geometry:result.geometry} as any);host.classList.toggle("is-selectable",!!result.geometry);status.setText(result.name?`${result.name} · clique para selecionar`:`${matched.name} · ${points.length.toLocaleString()} coordenadas em cache`);}).catch(()=>undefined);},100);});
  map.on("mouseout",()=>{generation++;if(hoverTimer!==null)window.clearTimeout(hoverTimer);host.classList.remove("is-selectable");});
  map.on("click",event=>{status.setText("Carregando todas as fotos e sons da região…");void options.selectRegion(event.latlng.lat,event.latlng.lng,last).then(result=>status.setText(`${result.name} · ${result.count.toLocaleString()} records`)).catch(error=>status.setText(`Region unavailable: ${error instanceof Error?error.message:String(error)}`));});
  void attribution;
}
