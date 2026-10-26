/* Resource Pack Studio · static, private Minecraft Java 26.3 pack workspace.
 * JSZip is vendored and loaded before this script. All processing is in-browser.
 */
(() => {
'use strict';
const TARGET = [97,1];
const LIMITS = { archive: 400 * 1024 * 1024, unpacked: 1600 * 1024 * 1024, entries: 80000, perFile: 400 * 1024 * 1024 };
const state = { packs:[], index:new Map(), overrides:new Map(), excluded:new Set(), selected:null, tab:'assets', filter:'all', search:'', limit:350, issueList:[], diagnosisDone:false, importBusy:false, busy:false, previewToken:0, animations:[], currentObjectUrls:[], paint:null, modelView:null, counter:1 };
const $ = id => document.getElementById(id);
const esc = str => String(str ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const truncate = (s,n=65) => String(s).length>n ? String(s).slice(0,n-1)+'…':String(s);
const sleep = () => new Promise(r=>setTimeout(r,0));
const fmtSize = n => n<1024 ? n+' B' : n<1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(1)+' MB';
const prettyName = p => p.split('/').pop();
const isModel = p => /^assets\/[^/]+\/models\/.*\.json$/i.test(p) || /^assets\/[^/]+\/items\/.*\.json$/i.test(p);
const isShader = p => /^assets\/[^/]+\/shaders\//i.test(p) && /\.(?:fsh|vsh|glsl|json)$/i.test(p);
const isAnimation = p => /\.png\.mcmeta$/i.test(p);
const kind = p => isShader(p)?'shader':isAnimation(p)?'animation':isModel(p)?'model':/\.png$/i.test(p)?'texture':/\.json$/i.test(p)?'json':'other';
const iconFor = k => ({shader:'⌘',animation:'▶',model:'⬡',texture:'▧',json:'{}',other:'□'})[k]||'□';
const getOrigin = p => { const match=p.match(/^assets\/([^/]+)\//); return match?match[1]:'minecraft'; };
function toast(message, type='info') { const node=document.createElement('div');node.className='toast '+(type==='error'?'error':type==='good'?'good':'');node.textContent=message;$('toastRegion').append(node);setTimeout(()=>node.remove(),4200); }
function showStatus(msg){$('statusLine').textContent=msg;}
function setBusy(v,msg){state.busy=v;$('exportBtn').disabled=v||!state.index.size;$('projectBtn').disabled=v||!state.packs.length;$('addPackBtn').disabled=v;if(msg)showStatus(msg);}
function findPack(id){return state.packs.find(p=>p.id===id);}
function normalPath(p){return p.replace(/\\/g,'/').replace(/^\.\//,'');}
function validPath(p){return !!p && !p.startsWith('/') && !p.includes('\0') && !p.split('/').some(s=>s==='..'||s==='.'||!s) && !/^[A-Za-z]:/.test(p);}
function versionTuple(v,upper=false){if(Array.isArray(v))return [Number(v[0]),Number(v[1]??(upper?2147483647:0))];if(typeof v==='number')return [v,upper?2147483647:0];return null;}
function cmpVersion(a,b){return a[0]!==b[0]?a[0]-b[0]:a[1]-b[1];}
function formatString(meta){const p=meta?.pack;if(!p)return 'Unknown';if(p.min_format!==undefined||p.max_format!==undefined){const mn=versionTuple(p.min_format), mx=versionTuple(p.max_format,true);return mn&&mx?`${mn.join('.')}–${mx.join('.')}`:'Unknown';}return p.pack_format===undefined?'Unknown':String(p.pack_format);}
function compatible(meta){const p=meta?.pack;if(!p)return false;if(p.min_format!==undefined&&p.max_format!==undefined){const min=versionTuple(p.min_format), max=versionTuple(p.max_format,true);return !!(min&&max&&cmpVersion(min,TARGET)<=0&&cmpVersion(TARGET,max)<=0);}return false;}
function entriesFromZIP(zip){return Object.entries(zip.files).filter(([,f])=>!f.dir);}
async function readBytes(entry){if(entry.bytes)return entry.bytes;if(!entry.zipObj)return new Uint8Array();const n=entry.zipObj._data?.uncompressedSize;if(n>LIMITS.perFile)throw Error('File exceeds maximum safe size.');const bytes=await entry.zipObj.async('uint8array');if(bytes.byteLength<5*1024*1024)entry.bytes=bytes;return bytes;}
async function readText(entry){return new TextDecoder().decode(await readBytes(entry));}
async function readJSON(entry){return JSON.parse(await readText(entry));}
function setModified(entry,bytes){entry.bytes=bytes;entry.modified=true;entry.zipObj=null;entry.size=bytes.length;state.diagnosisDone=false;}
async function loadPack(file, preferredName=null, forcedId=null){
 if(file.size>LIMITS.archive)throw Error(`${file.name}: ZIP exceeds ${fmtSize(LIMITS.archive)} limit.`);
 const zip=await JSZip.loadAsync(file, {checkCRC32:false,createFolders:false});const all=entriesFromZIP(zip);
 if(all.length>LIMITS.entries)throw Error(`${file.name}: too many files (${all.length}).`);
 let total=0;
 for(const [key,z] of all){const path=normalPath(key);if(!validPath(path))throw Error(`${file.name}: unsafe ZIP path ${truncate(key)}.`);const size=z._data?.uncompressedSize??0;const compressed=z._data?.compressedSize??0;total+=size;if(size>LIMITS.perFile||total>LIMITS.unpacked)throw Error(`${file.name}: uncompressed size exceeds safe limits.`);if(compressed>0&&size>10485760&&size/compressed>5000)throw Error(`${file.name}: unsafe compression ratio.`);}
 const packMetas=all.filter(([name])=>/^(?:[^/]+\/)?pack\.mcmeta$/i.test(name));
 const prefix=zip.file('pack.mcmeta')?'':packMetas.length===1?packMetas[0][0].slice(0,-'pack.mcmeta'.length):'';
 const packInfo=zip.file(prefix+'pack.mcmeta');
 if(!packInfo){if(zip.file('shaders/shaders.properties'))throw Error(`${file.name}: Iris shaderpacks are separate from resource packs.`);throw Error(`${file.name}: missing pack.mcmeta (not a resource pack ZIP).`);}
 let meta;try{meta=JSON.parse(await packInfo.async('string'));}catch{throw Error(`${file.name}: invalid pack.mcmeta JSON.`);}
 if(!meta?.pack)throw Error(`${file.name}: pack.mcmeta has no "pack" object.`);
 const id=forcedId??'pack-'+state.counter++;
 const pack={id,name:preferredName||file.name.replace(/\.zip$/i,''),originalName:file.name,blob:file,enabled:true,files:new Map(),meta,size:file.size,unpacked:total,readmeWarnings:[],rawFileCount:all.length};
 // Read base resources then flatten applicable 26.3 overlay resources from this ZIP.
 const base=[];const overlays=[];
 const overlayDefs=Array.isArray(meta.overlays?.entries)?meta.overlays.entries:[];
 for(const o of overlayDefs){if(!o||typeof o.directory!=='string'||!/^[a-zA-Z0-9_.-]+$/.test(o.directory))continue;
 const min=versionTuple(o.min_format??o.formats?.min_inclusive), max=versionTuple(o.max_format??o.formats?.max_inclusive,true);
 if(min&&max&&cmpVersion(min,TARGET)<=0&&cmpVersion(TARGET,max)<=0)overlays.push(o.directory);
 }
 for(const [rawName,z] of all){if(!rawName.startsWith(prefix))continue;const path=normalPath(rawName.slice(prefix.length));if(!path||path==='pack.mcmeta')continue;
 // Overlays are flattened for the 26.3 target; inactive overlay files are left out.
 const first=path.split('/')[0];if(overlayDefs.some(o=>o?.directory===first))continue;
 base.push([path,z]);
 }
 for(const [path,z] of base)pack.files.set(path,{zipObj:z,bytes:null,modified:false,size:z._data?.uncompressedSize??0,rawPath:path});
 for(const dir of overlays){for(const [rawName,z] of all){const full=normalPath(rawName);if(!full.startsWith(prefix+dir+'/'))continue;const dest=full.slice((prefix+dir+'/').length);if(validPath(dest))pack.files.set(dest,{zipObj:z,bytes:null,modified:false,size:z._data?.uncompressedSize??0,rawPath:dir+'/'+dest});}}
 if(!compatible(meta))pack.readmeWarnings.push(`Pack metadata (${formatString(meta)}) does not declare support for Minecraft 26.3. Changing the output metadata does not automatically upgrade assets.`);
 if(overlayDefs.length&&!overlays.length)pack.readmeWarnings.push('Pack contains overlays, but none explicitly target 26.3. Unmatched overlay files were not applied.');
 if(meta.filter)pack.readmeWarnings.push('This pack uses metadata filters; verify effective output carefully.');
 return pack;
}
function buildIndex(){
 const oldSelection=state.selected;const byPath=new Map();
 for(const pack of state.packs){if(!pack.enabled)continue;for(const [path,entry] of pack.files){if(!byPath.has(path))byPath.set(path,[]);byPath.get(path).push({pack,entry});}}
 const result=new Map();for(const [path,sources] of byPath){const desired=state.overrides.get(path);const current=sources.find(s=>s.pack.id===desired)||sources[0];result.set(path,{path,sources,current,kind:kind(path),conflict:sources.length>1});}
 state.index=result;if(oldSelection&&!result.has(oldSelection))state.selected=null;
 state.issueList=state.issueList.filter(x=>!x.path||result.has(x.path));
 updateCounts();renderPacks();renderFiles();renderInspector();
}
function updateCounts(){const items=[...state.index.values()];$('packCount').textContent=state.packs.length;$('packCountTop').textContent=`${state.packs.length} PACK${state.packs.length===1?'':'S'} LOADED`;$('statAssets').textContent=items.length.toLocaleString();$('statConflicts').textContent=items.filter(a=>a.conflict).length.toLocaleString();$('statShaders').textContent=items.filter(a=>a.kind==='shader').length.toLocaleString();$('assetTabCount').textContent=items.length;$('conflictTabCount').textContent=items.filter(a=>a.conflict).length;$('diagnosticsTabCount').textContent=state.issueList.length;$('exportBtn').disabled=state.busy||!items.length;$('projectBtn').disabled=state.busy||!state.packs.length;}
function renderPacks(){const box=$('packsList');if(!state.packs.length){box.innerHTML='<div class="empty-stack"><span class="stack-graphic">▦</span><b>No packs yet</b><p>Add ZIPs or use the sample project to get started.</p></div>';return;}
 box.innerHTML=state.packs.map((p,i)=>`<div draggable="true" data-pack-id="${esc(p.id)}" class="pack-card ${p.enabled?'':'inactive'}"><span class="pack-handle" title="Drag to reorder">⠿</span><div class="pack-main"><div class="pack-name" title="${esc(p.name)}">${esc(p.name)}</div><div class="pack-meta"><span>${fmtSize(p.size)}</span><span>·</span><span>${esc(formatString(p.meta))}</span></div><div class="pack-actions"><button class="icon-btn" data-action="pack-up" data-id="${esc(p.id)}" title="Move up" ${i===0?'disabled':''}>↑</button><button class="icon-btn" data-action="pack-down" data-id="${esc(p.id)}" title="Move down" ${i===state.packs.length-1?'disabled':''}>↓</button><button class="icon-btn" data-action="pack-remove" data-id="${esc(p.id)}" title="Remove pack">×</button></div>${p.readmeWarnings.length?'<div class="pack-meta" title="'+esc(p.readmeWarnings.join('\n'))+'"><span style="color:#f6bd60">⚠ Version / overlay notice</span></div>':''}</div><input type="checkbox" class="pack-toggle" data-action="pack-enable" data-id="${esc(p.id)}" aria-label="Enable ${esc(p.name)}" ${p.enabled?'checked':''}></div>`).join('');
}
function getVisible(){let rows=[...state.index.values()];if(state.tab==='conflicts')rows=rows.filter(x=>x.conflict);if(state.tab==='diagnostics')return [];
 if(state.filter!=='all')rows=rows.filter(x=>x.kind===state.filter);
 const q=state.search.toLowerCase().trim();if(q)rows=rows.filter(x=>x.path.toLowerCase().includes(q)||x.sources.some(s=>s.pack.name.toLowerCase().includes(q)));
 return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
function renderFiles(){const list=$('filesList');$('listHeading').textContent=state.tab==='assets'?'FILES':state.tab==='conflicts'?'CONFLICTING FILES':'DIAGNOSTIC RESULTS';
 if(state.tab==='diagnostics'){renderDiagnosisList();return;}
 const rows=getVisible();$('visibleFiles').textContent=`${rows.length.toLocaleString()} items`;
 if(!state.packs.length){list.innerHTML='<div class="file-empty"><div class="empty-icon">▧</div><h2>Build your perfect resource pack</h2><p>Drop resource pack ZIPs here to inspect textures, preview animations, detect conflicting shaders and export a merged pack.</p><button class="btn btn-primary" data-action="add">＋ Add ZIP files</button><button class="btn btn-ghost" data-action="sample">Try sample project</button></div>';return;}
 if(!rows.length){list.innerHTML='<div class="file-empty"><div class="empty-icon">⌕</div><h2>No matching files</h2><p>Try a different search or change your asset-type filter.</p></div>';return;}
 const show=rows.slice(0,state.limit);
 list.innerHTML=show.map(x=>`<div class="file-row ${x.path===state.selected?'selected':''}" data-path="${esc(x.path)}" role="button" tabindex="0" aria-label="Inspect ${esc(x.path)}"><span class="file-icon ${x.kind}">${iconFor(x.kind)}</span><div class="file-details"><div class="file-title" title="${esc(x.path)}">${esc(prettyName(x.path))}</div><div class="file-path" title="${esc(x.path)}">${esc(x.path)}</div></div><div class="file-right"><span class="file-source" title="${esc(x.current.pack.name)}">${esc(truncate(x.current.pack.name,16))}</span>${x.current.entry.modified?'<span class="status-chip edited">EDITED</span>':x.conflict?'<span class="status-chip conflict">CONFLICT</span>':'<span class="status-chip">'+x.kind.toUpperCase()+'</span>'}<input class="tiny-check" type="checkbox" data-exclude="${esc(x.path)}" title="Include in output ZIP" aria-label="Include ${esc(x.path)} in output" ${state.excluded.has(x.path)?'':'checked'}></div></div>`).join('')+(rows.length>show.length?`<div class="file-empty" style="padding:18px"><button class="btn btn-outline" data-action="more">Show more (${(rows.length-show.length).toLocaleString()} remaining)</button></div>`:'');
}
function renderDiagnosisList(){const el=$('filesList');$('visibleFiles').textContent=`${state.issueList.length} issues`;
 if(!state.packs.length){el.innerHTML='<div class="file-empty"><h2>No packs loaded</h2><p>Add resource packs to run diagnostics.</p></div>';return;}
 if(!state.diagnosisDone){el.innerHTML='<div class="file-empty"><div class="empty-icon">◇</div><h2>Validate loaded resources</h2><p>Scan JSON syntax, model and shader dependencies, legacy directives and selected Minecraft 26.3 compatibility concerns.</p><button class="btn btn-primary" data-action="scan">Run diagnostics</button></div>';return;}
 const issues=state.issueList.filter(x=>!state.search||`${x.path||''} ${x.text||''}`.toLowerCase().includes(state.search.toLowerCase()));
 if(!issues.length){el.innerHTML='<div class="file-empty"><div class="empty-icon" style="color:#44d6a3">✓</div><h2>No static issues found</h2><p>This is not a Minecraft runtime compatibility guarantee.</p><button class="btn btn-outline" data-action="scan">Scan again</button></div>';return;}
 el.innerHTML=issues.slice(0,state.limit).map(issue=>`<div class="file-row" ${issue.path?'data-path="'+esc(issue.path)+'"':''} role="button" tabindex="0"><span class="file-icon ${issue.level==='error'?'shader':'animation'}">${issue.level==='error'?'!':'⚠'}</span><div class="file-details"><div class="file-title">${esc(issue.title)}</div><div class="file-path" title="${esc(issue.path||'')}">${esc(issue.path||'Pack metadata')} · ${esc(issue.text)}</div></div></div>`).join('')+(issues.length>state.limit?'<div class="file-empty"><button class="btn btn-outline" data-action="more">Show more</button></div>':'');
}
async function importFiles(files){if(state.importBusy||!files.length)return;state.importBusy=true;setBusy(true,`Reading ${files.length} file(s)…`);let count=0;
 for(const f of files){try{if(/\.rps$/i.test(f.name)){await importProject(f);count++;}else if(/\.zip$/i.test(f.name)){const p=await loadPack(f);state.packs.unshift(p);count++;}else toast(`Skipped unsupported file: ${f.name}`,'error');}catch(err){toast(err.message||String(err),'error');}}
 state.importBusy=false;state.diagnosisDone=false;state.issueList=[];buildIndex();setBusy(false,`${state.packs.length} pack(s), ${state.index.size} effective assets`);if(count)toast(`${count} file(s) loaded successfully`,'good');
}
function movePack(id,delta){const i=state.packs.findIndex(p=>p.id===id);if(i<0||i+delta<0||i+delta>=state.packs.length)return;[state.packs[i],state.packs[i+delta]]=[state.packs[i+delta],state.packs[i]];state.diagnosisDone=false;buildIndex();}
function selectPath(path){if(!state.index.has(path))return;state.selected=path;state.previewToken++;renderFiles();renderInspector();}
function clearPreviews(){for(const a of state.animations){clearInterval(a);}state.animations=[];for(const url of state.currentObjectUrls)URL.revokeObjectURL(url);state.currentObjectUrls=[];state.paint=null;state.modelView=null;}
function entryUrl(bytes, mime){const url=URL.createObjectURL(new Blob([bytes],{type:mime}));state.currentObjectUrls.push(url);return url;}
function section(title,content=''){return `<section class="inspector-section"><h4>${esc(title)}</h4>${content}</section>`;}
function property(k,v){return `<div class="property-row"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;}
async function renderInspector(){clearPreviews();const box=$('inspectorBody');const path=state.selected;const token=state.previewToken;
 if(!path||!state.index.has(path)){$('inspectorTitle').textContent='Select an asset';$('inspectorSubtitle').textContent='Preview and inspect selected files.';box.innerHTML='<div class="inspector-empty"><div class="inspector-graphic">◈</div><h3>Nothing selected</h3><p>Choose an asset to inspect its source and settings.</p></div>';return;}
 const file=state.index.get(path);$('inspectorTitle').textContent=prettyName(path);$('inspectorSubtitle').textContent=path;box.innerHTML='<div class="inspector-note">Loading asset preview…</div>';
 const base=`${section('FILE DETAILS',property('Category',file.kind)+property('Source',file.current.pack.name)+property('Size',fmtSize(file.current.entry.size))+property('Status',file.conflict?'Conflict · '+file.sources.length+' sources':'No path conflict'))}${section('SOURCE RESOLUTION',file.conflict?`<p class="inspector-note">Select which pack contributes this exact path. Higher priority wins by default.</p><select class="source-select" id="sourceSelector">${file.sources.map(s=>`<option value="${esc(s.pack.id)}" ${file.current.pack.id===s.pack.id?'selected':''}>${esc(s.pack.name)}</option>`).join('')}</select>`:'<p class="inspector-note">No competing source for this file.</p>')}`;
 let preview='';try{if(file.kind==='texture')preview=await imagePreview(file,token);else if(file.kind==='animation')preview=await animationMetaPreview(file,token);else if(file.kind==='model')preview=await modelPreview(file,token);else if(file.kind==='shader')preview=await shaderPreview(file,token);else if(file.kind==='json')preview=await textPreview(file,token,true);else preview=await textPreview(file,token,false);}catch(err){preview=`<div class="diagnostic error"><strong>Cannot preview file</strong>${esc(err.message)}</div>`;}
 if(token!==state.previewToken)return;box.innerHTML=preview+base+section('ACTIONS',`<div class="inspector-actions"><button class="btn btn-ghost btn-small" id="downloadAsset">⇩ Download file</button><button class="btn btn-ghost btn-small" id="toggleExport">${state.excluded.has(path)?'Include in export':'Exclude from export'}</button></div>`);
 $('sourceSelector')?.addEventListener('change',e=>{state.overrides.set(path,e.target.value);buildIndex();});
 $('downloadAsset')?.addEventListener('click',()=>downloadEntry(path));$('toggleExport')?.addEventListener('click',()=>{if(state.excluded.has(path))state.excluded.delete(path);else state.excluded.add(path);renderFiles();renderInspector();});
 await installPreviewHandlers(file,token);
}
async function textPreview(file,token,parseJSON){const bytes=await readBytes(file.current.entry);if(token!==state.previewToken)return '';if(bytes.length>1024*1024)return `<div class="warning-banner">Large file (${fmtSize(bytes.length)}); preview disabled.</div>`;
 let text=new TextDecoder().decode(bytes),msgs=[];if(parseJSON){try{JSON.parse(text);}catch(e){msgs.push(`<div class="diagnostic error"><strong>Invalid JSON</strong>${esc(e.message)}</div>`);}}
 const code=esc(text.length>25000?text.slice(0,25000)+'\n… truncated preview':text);
 return section('CONTENT PREVIEW',`<pre class="code-view">${code}</pre>${msgs.join('')}${parseJSON?'<button class="btn btn-ghost btn-small" id="editTextBtn">Edit JSON text</button>':''}`);
}
async function shaderPreview(file,token){const text=await readText(file.current.entry);if(token!==state.previewToken)return '';
 let msgs=[];const includes=[...text.matchAll(/^\s*#include\s*["<]([^">]+)[">]/gm)].map(m=>m[1]);if(/#moj_import\s*["<]/.test(text))msgs.push(['warn','Legacy #moj_import directive','Minecraft 26.3 compiles shaders using ShaderC #include.']);
 const checked=includes.map(inc=>{const found=findShaderInclude(file.path,inc);return {inc,found};});for(const inc of checked)if(!inc.found)msgs.push(['info','Include not found in loaded packs',inc.inc+' (may exist in the vanilla client)']);
 if(/\.(?:vsh|fsh)$/.test(file.path)&&(/\b(?:in|out)\s+\w+\s+\w+\s*;/.test(text))&&!/layout\s*\(\s*location\s*=/.test(text))msgs.push(['warn','Potential input/output location issue','26.3 ShaderC requires explicit locations for applicable shader inputs/outputs.']);
 let html=section('CORE / POST SHADER',`<div class="warning-banner">Static inspection only. Minecraft runtime compilation and visual output are not simulated. Mojang does not guarantee core shader overrides.</div><pre class="code-view">${esc(text.slice(0,30000))}${text.length>30000?'\n… preview truncated':''}</pre><div class="inspector-actions"><button class="btn btn-ghost btn-small" id="editTextBtn">Edit shader source</button></div>`);
 html+=section('SHADER ANALYSIS',property('Includes',includes.length)+property('Lines',text.split('\n').length)+property('Other pack overrides',file.sources.length-1)+msgs.map(([type,title,m])=>`<div class="diagnostic ${type}"><strong>${esc(title)}</strong>${esc(m)}</div>`).join('')+(!msgs.length?'<div class="diagnostic info">No obvious static warnings. This does not verify runtime correctness.</div>':''));
 return html;
}
function findShaderInclude(path,inc){const ns=getOrigin(path);const clean=inc.replace(/^\//,'');const dir=path.slice(0,path.lastIndexOf('/'));const candidates=[`assets/${ns}/shaders/${clean}`,`${dir}/${clean}`,`assets/${ns}/shaders/include/${clean}`];if(inc.includes(':')){const [namespace,subpath]=inc.split(':');candidates.push(`assets/${namespace}/shaders/${subpath}`);}return candidates.find(p=>state.index.has(p))||null;}
async function animationMetaPreview(file,token){let obj,issue='';try{obj=await readJSON(file.current.entry);}catch(e){issue=e.message;}
 if(token!==state.previewToken)return '';const imagePath=file.path.slice(0,-'.mcmeta'.length);
 return section('ANIMATION METADATA',`<pre class="code-view">${esc(JSON.stringify(obj||{},null,2))}</pre>${issue?`<div class="diagnostic error">${esc(issue)}</div>`:''}<p class="inspector-note">Paired texture: <strong>${esc(imagePath)}</strong>. Select the PNG to view animation frames.</p><button class="btn btn-ghost btn-small" id="editTextBtn">Edit metadata JSON</button>`);
}
async function imagePreview(file,token){const bytes=await readBytes(file.current.entry);if(token!==state.previewToken)return '';const info=await pngInfo(bytes);if(token!==state.previewToken)return '';
 let animation=null;const metaFile=state.index.get(file.path+'.mcmeta');if(metaFile){try{animation=(await readJSON(metaFile.current.entry)).animation||null;}catch{/* invalid metadata reported in diagnostics */}}
 const n=animation?Math.floor(info.height/info.width):1;
 return section(animation?'ANIMATED TEXTURE PREVIEW':'TEXTURE PREVIEW',`<div class="preview-panel"><div class="preview-top"><span>${animation?'ANIMATED SPRITE':'PIXEL TEXTURE'}</span><span>${info.width} × ${info.height}</span></div><div class="preview-canvas-wrap checker"><canvas id="textureCanvas" width="${info.width}" height="${animation?info.width:info.height}" aria-label="Texture preview"></canvas></div>${animation?`<div class="play-bar"><button class="btn btn-ghost btn-small" id="animPlayBtn">Pause</button><label>Speed <input id="animationSpeed" type="range" min="0.25" max="4" step="0.25" value="1"></label><span class="mini-name" id="framePosition">1 / ${Math.max(n,1)}</span></div>`:''}</div>${animation&&info.height%info.width!==0?'<div class="warning-banner">Animation sprite height is not a multiple of width; assuming square frames.</div>':''}<div class="inspector-actions"><button class="btn btn-ghost btn-small" id="editTextureBtn">Pixel editor</button><button class="btn btn-ghost btn-small" id="replaceTextureBtn">Replace PNG</button></div>${animation?'':'<p class="inspector-note">Pixel editor modifies only this resource’s selected source, not the original imported ZIP.</p>'}`);
}
function pngInfo(bytes){return new Promise((resolve,reject)=>{if(bytes.length<24||String.fromCharCode(...bytes.slice(1,4))!=='PNG')return reject(Error('Invalid PNG header'));const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);resolve({width:dv.getUint32(16),height:dv.getUint32(20)});});}
async function modelPreview(file,token){let spec;try{spec=await readJSON(file.current.entry);}catch(e){return section('3D MODEL PREVIEW',`<div class="diagnostic error">Invalid model JSON: ${esc(e.message)}</div>`);}
 if(token!==state.previewToken)return '';
 let resolved=await resolveModel(file.path,spec,new Set());if(token!==state.previewToken)return '';
 const elements=resolved.elements||[];
 const generated=!elements.length&&!!resolved.textures?.layer0;
 if(!elements.length&&!generated){return section('MODEL',`<div class="diagnostic info">No directly renderable cuboids or generated item texture. This model may use unsupported game-specific geometry or a vanilla parent missing from the loaded packs.</div><pre class="code-view">${esc(JSON.stringify(spec,null,2).slice(0,14000))}</pre>`);}
 return section('3D MODEL PREVIEW',`<div class="preview-panel"><div class="preview-top"><span>SOFTWARE 3D VIEWER</span><span>${elements.length} ELEMENTS</span></div><canvas id="modelCanvas" class="canvas-3d checker" width="620" height="480" aria-label="3D model viewer"></canvas><div class="model-hint">Drag to orbit · Scroll to zoom · Simplified rendering</div><div class="inspector-actions"><button class="btn btn-ghost btn-small" id="resetCamera">Reset camera</button></div></div><p class="inspector-note">Supports cuboid elements, parent model resolution, texture references, basic element rotations and generated item textures. Not a complete Minecraft renderer; block states, tinting, lighting and mod-specific model features may differ.</p><div class="inspector-actions"><button class="btn btn-ghost btn-small" id="editTextBtn">Edit model JSON</button></div>`) + section('MODEL CONTENT',`<pre class="code-view">${esc(JSON.stringify(spec,null,2).slice(0,12000))}</pre>`);
}
function modelRefPath(ref,current){if(!ref||ref.startsWith('builtin/'))return null;const i=ref.indexOf(':');const ns=i>=0?ref.slice(0,i):getOrigin(current), name=i>=0?ref.slice(i+1):ref;return `assets/${ns}/models/${name}.json`;}
async function resolveModel(path,json,visited){if(visited.has(path))return {elements:[],textures:{},cycle:true};visited.add(path);
 // Since 1.21.4, assets/*/items/*.json often refers to a model through a nested item definition.
 if(/\/items\//.test(path)&&json?.model){const name=findModelRef(json.model);if(name){const modelPath=modelRefPath(name,path);const model=state.index.get(modelPath);if(model){try{return resolveModel(modelPath,await readJSON(model.current.entry),visited);}catch{/* fallback */}}}}
 const out={textures:{},elements:[],display:json.display||{}};if(json.parent){const parentPath=modelRefPath(json.parent,path);if(parentPath&&state.index.has(parentPath)){try{const p=await resolveModel(parentPath,await readJSON(state.index.get(parentPath).current.entry),visited);out.textures={...p.textures};out.elements=p.elements;out.display={...p.display,...out.display};}catch{/* unresolved parent */}}}
 out.textures={...out.textures,...(json.textures||{})};if(Array.isArray(json.elements))out.elements=json.elements;return out;
}
function findModelRef(obj){if(!obj||typeof obj!=='object')return null;if(typeof obj.model==='string')return obj.model;for(const key of ['models','fallback','cases','entries','on_true','on_false']){const v=obj[key];if(Array.isArray(v)){for(const x of v){const r=findModelRef(x);if(r)return r;}}else{const r=findModelRef(v);if(r)return r;}}return null;}
function resolveTextureName(key,textures,ns){if(typeof key!=='string')return null;const seen=new Set();while(key.startsWith('#')){const k=key.slice(1);if(seen.has(k))return null;seen.add(k);key=textures[k];if(typeof key!=='string')return null;}
 const j=key.indexOf(':');const a=j>=0?key.slice(0,j):ns,b=j>=0?key.slice(j+1):key;return `assets/${a}/textures/${b}.png`;
}
async function loadImageFromEntry(entry){const bytes=await readBytes(entry);return new Promise((resolve,reject)=>{const url=entryUrl(bytes,'image/png');const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Unable to decode PNG image.'));img.src=url;});}
async function installPreviewHandlers(file,token){if(token!==state.previewToken)return;
 if(file.kind==='texture')await startTexturePreview(file,token);
 if(file.kind==='model')await startModelPreview(file,token);
 if(token!==state.previewToken)return;
 $('editTextBtn')?.addEventListener('click',()=>openTextEditor(file,token));
 $('replaceTextureBtn')?.addEventListener('click',()=>{const input=$('replaceTextureInput');input.onchange=async()=>{const f=input.files?.[0];input.value='';if(!f)return;try{const bytes=new Uint8Array(await f.arrayBuffer());await pngInfo(bytes);setModified(file.current.entry,bytes);state.diagnosisDone=false;buildIndex();toast('PNG replaced in working copy.','good');}catch(e){toast(e.message,'error');}};input.click();});
}
async function startTexturePreview(file,token){const canvas=$('textureCanvas');if(!canvas)return;let img;try{img=await loadImageFromEntry(file.current.entry);}catch(e){if(canvas.parentNode)canvas.parentNode.textContent='Invalid PNG: '+e.message;return;}if(token!==state.previewToken)return;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;const metaFile=state.index.get(file.path+'.mcmeta');let meta=null;if(metaFile){try{meta=(await readJSON(metaFile.current.entry)).animation;}catch{}}
 const frameSize=meta?img.width:img.height;const frameCount=Math.max(1,Math.floor(img.height/frameSize));const rawFrames=meta?.frames?.length?meta.frames:Array.from({length:frameCount},(_,i)=>i);const frames=rawFrames.map(f=>typeof f==='number'?{index:f,time:meta?.frametime||1}:{index:f.index,time:f.time||meta?.frametime||1}).filter(f=>Number.isInteger(f.index)&&f.index>=0&&f.index<frameCount);if(!frames.length)frames.push({index:0,time:1});
 let count=0,step=0,playing=true,lastTime=performance.now();canvas.width=img.width;canvas.height=frameSize;
 const paintFrame=()=>{if(!canvas.isConnected||token!==state.previewToken)return;const f=frames[step];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,f.index*frameSize,img.width,frameSize,0,0,img.width,frameSize);const label=$('framePosition');if(label)label.textContent=`${f.index+1} / ${frameCount}`;};
 paintFrame();if(meta){const id=setInterval(()=>{if(!playing)return;const now=performance.now(),elapsed=now-lastTime;lastTime=now;count+=elapsed/50*Number($('animationSpeed')?.value||1);if(count>=frames[step].time){count=0;step=(step+1)%frames.length;paintFrame();}},50);state.animations.push(id);$('animPlayBtn')?.addEventListener('click',e=>{playing=!playing;e.currentTarget.textContent=playing?'Pause':'Play';lastTime=performance.now();});}
 const editBtn=$('editTextureBtn');if(editBtn)editBtn.onclick=()=>{if(meta){toast('For animated sprites, use Replace PNG to preserve the full sprite sheet.','error');return;}openPixelEditor(file,img,canvas,token);};
}
function openPixelEditor(file,img,canvas,token){if(!canvas||token!==state.previewToken)return;const ctx=canvas.getContext('2d',{willReadFrequently:true});const width=canvas.width,height=canvas.height;const snap=[];
 state.paint={file,canvas,ctx,snap,mode:'paint',color:'#f6bd60',down:false};
 const parent=canvas.closest('.preview-panel');const old=parent.querySelector('.pixel-tools');if(old)old.remove();const tools=document.createElement('div');tools.className='pixel-tools';tools.innerHTML=`<div class="action-row"><span class="mini-name">PIXEL EDITOR · ${width}×${height}</span><input class="color-input" id="paintColor" type="color" value="#f6bd60" aria-label="Paint color"></div><div class="inspector-actions"><button class="btn btn-ghost btn-small" id="paintMode">Pen</button><button class="btn btn-ghost btn-small" id="eraserMode">Eraser</button><button class="btn btn-ghost btn-small" id="undoPaint">Undo</button><button class="btn btn-primary btn-small" id="savePaint">Save edits</button></div>`;parent.append(tools);
 canvas.style.cursor='crosshair';canvas.style.touchAction='none';
 const snapshot=()=>{snap.push(ctx.getImageData(0,0,width,height));if(snap.length>15)snap.shift();};
 const stroke=e=>{if(!state.paint||state.paint.canvas!==canvas)return;const rect=canvas.getBoundingClientRect(), x=Math.floor((e.clientX-rect.left)*width/rect.width),y=Math.floor((e.clientY-rect.top)*height/rect.height);if(x<0||y<0||x>=width||y>=height)return;ctx.fillStyle=state.paint.color;if(state.paint.mode==='erase')ctx.clearRect(x,y,1,1);else ctx.fillRect(x,y,1,1);};
 canvas.onpointerdown=e=>{if(e.button!==0)return;snapshot();state.paint.down=true;canvas.setPointerCapture(e.pointerId);stroke(e);};canvas.onpointermove=e=>{if(state.paint?.down)stroke(e);};canvas.onpointerup=()=>{if(state.paint)state.paint.down=false;};canvas.onpointercancel=()=>{if(state.paint)state.paint.down=false;};
 $('paintColor').oninput=e=>{state.paint.color=e.target.value;};$('paintMode').onclick=()=>{state.paint.mode='paint';};$('eraserMode').onclick=()=>{state.paint.mode='erase';};$('undoPaint').onclick=()=>{const v=snap.pop();if(v)ctx.putImageData(v,0,0);};
 $('savePaint').onclick=async()=>{try{const blob=await new Promise((res,rej)=>canvas.toBlob(x=>x?res(x):rej(Error('Canvas export failed.')),'image/png'));setModified(file.current.entry,new Uint8Array(await blob.arrayBuffer()));updateCounts();renderFiles();renderInspector();toast('Pixel changes saved in the working copy.','good');}catch(e){toast(e.message,'error');}};
 toast('Pixel editor opened. Click or drag on the texture.');
}
// Orthographic canvas renderer for vanilla cuboid models. This is intentionally
// simpler than Minecraft's full rendering pipeline and never claims pixel parity.
const FACE_VERTS={
 north:(a,b)=>[[a[0],b[1],a[2]],[b[0],b[1],a[2]],[b[0],a[1],a[2]],[a[0],a[1],a[2]]],
 south:(a,b)=>[[b[0],b[1],b[2]],[a[0],b[1],b[2]],[a[0],a[1],b[2]],[b[0],a[1],b[2]]],
 west:(a,b)=>[[a[0],b[1],b[2]],[a[0],b[1],a[2]],[a[0],a[1],a[2]],[a[0],a[1],b[2]]],
 east:(a,b)=>[[b[0],b[1],a[2]],[b[0],b[1],b[2]],[b[0],a[1],b[2]],[b[0],a[1],a[2]]],
 up:(a,b)=>[[a[0],b[1],b[2]],[b[0],b[1],b[2]],[b[0],b[1],a[2]],[a[0],b[1],a[2]]],
 down:(a,b)=>[[a[0],a[1],a[2]],[b[0],a[1],a[2]],[b[0],a[1],b[2]],[a[0],a[1],b[2]]]
};
function rotatedElement(vertex,rot){if(!rot||!rot.axis||!rot.angle)return vertex;const origin=rot.origin||[8,8,8],a=Number(rot.angle)*Math.PI/180,v=[vertex[0]-origin[0],vertex[1]-origin[1],vertex[2]-origin[2]],c=Math.cos(a),s=Math.sin(a);let r=v;if(rot.axis==='x')r=[v[0],v[1]*c-v[2]*s,v[1]*s+v[2]*c];if(rot.axis==='y')r=[v[0]*c+v[2]*s,v[1],-v[0]*s+v[2]*c];if(rot.axis==='z')r=[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]];return r.map((n,i)=>n+origin[i]);}
function project3(v,yaw,pitch,zoom,w,h){let x=v[0]-8,y=v[1]-8,z=v[2]-8;const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);const xr=x*cy-z*sy,zr=x*sy+z*cy,yr=y*cp-zr*sp,depth=y*sp+zr*cp;const scale=Math.min(w,h)/27*zoom;return {x:w/2+xr*scale,y:h/2-yr*scale,z:depth};}
function affineTriangle(ctx,img,p,uv){const [a,b,c]=uv;const det=(a.u*(b.v-c.v)+b.u*(c.v-a.v)+c.u*(a.v-b.v));if(Math.abs(det)<.0001)return;const m=(x,y,z)=> (x*(b.v-c.v)+y*(c.v-a.v)+z*(a.v-b.v))/det;const n=(x,y,z)=> (x*(c.u-b.u)+y*(a.u-c.u)+z*(b.u-a.u))/det;
 const A=m(p[0].x,p[1].x,p[2].x),C=n(p[0].x,p[1].x,p[2].x),E=p[0].x-A*a.u-C*a.v;
 const B=m(p[0].y,p[1].y,p[2].y),D=n(p[0].y,p[1].y,p[2].y),F=p[0].y-B*a.u-D*a.v;
 ctx.save();ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);ctx.lineTo(p[1].x,p[1].y);ctx.lineTo(p[2].x,p[2].y);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,E,F);ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0);ctx.restore();
}
function texturedQuad(ctx,img,ps,uv){const [x1,y1,x2,y2]=uv;const u=[{u:x1*img.width/16,v:y1*img.height/16},{u:x2*img.width/16,v:y1*img.height/16},{u:x2*img.width/16,v:y2*img.height/16},{u:x1*img.width/16,v:y2*img.height/16}];affineTriangle(ctx,img,[ps[0],ps[1],ps[2]],[u[0],u[1],u[2]]);affineTriangle(ctx,img,[ps[0],ps[2],ps[3]],[u[0],u[2],u[3]]);}
async function startModelPreview(file,token){const canvas=$('modelCanvas');if(!canvas)return;let spec;try{spec=await readJSON(file.current.entry);}catch{return;}const resolved=await resolveModel(file.path,spec,new Set());if(token!==state.previewToken)return;
 const ns=getOrigin(file.path), imgs=new Map(),faces=[];
 for(const el of (resolved.elements||[]).slice(0,500)){
 if(!Array.isArray(el.from)||!Array.isArray(el.to)||!el.faces)continue;
 for(const [name,face] of Object.entries(el.faces)){if(!FACE_VERTS[name])continue;const texPath=resolveTextureName(face.texture,resolved.textures,ns), verts=FACE_VERTS[name](el.from,el.to).map(v=>rotatedElement(v,el.rotation));faces.push({name,verts,uv:Array.isArray(face.uv)?face.uv:[0,0,16,16],texPath});}
 }
 if(!faces.length&&resolved.textures?.layer0){const texPath=resolveTextureName('#layer0',resolved.textures,ns);faces.push({name:'item',verts:[[0,16,8],[16,16,8],[16,0,8],[0,0,8]],uv:[0,0,16,16],texPath});}
 for(const path of new Set(faces.map(f=>f.texPath).filter(Boolean))){const found=state.index.get(path);if(found)try{imgs.set(path,await loadImageFromEntry(found.current.entry));}catch{/* placeholder */}}
 if(token!==state.previewToken)return;
 let yaw=.66,pitch=.46,zoom=1.0,drag=null;const ctx=canvas.getContext('2d');
 const draw=()=>{if(!canvas.isConnected)return;ctx.clearRect(0,0,canvas.width,canvas.height);const visible=faces.map(f=>{const ps=f.verts.map(v=>project3(v,yaw,pitch,zoom,canvas.width,canvas.height));return {...f,ps,depth:ps.reduce((s,p)=>s+p.z,0)/4};}).sort((a,b)=>b.depth-a.depth);
 for(const f of visible){ctx.save();ctx.beginPath();ctx.moveTo(f.ps[0].x,f.ps[0].y);for(let j=1;j<4;j++)ctx.lineTo(f.ps[j].x,f.ps[j].y);ctx.closePath();ctx.fillStyle=f.name==='up'?'#aebacc':f.name==='north'||f.name==='west'?'#667b9a':'#8494ae';ctx.fill();const img=imgs.get(f.texPath);if(img)texturedQuad(ctx,img,f.ps,f.uv);else{ctx.globalAlpha=.5;ctx.fillStyle='#f36bbc';ctx.fill();ctx.globalAlpha=1;}ctx.strokeStyle='#0a122099';ctx.lineWidth=1;ctx.stroke();ctx.restore();}}
 draw();canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.01;pitch=Math.max(-1.45,Math.min(1.45,drag.pitch+(e.clientY-drag.y)*.01));draw();};canvas.onpointerup=()=>{drag=null;};canvas.onpointercancel=()=>{drag=null;};canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.4,Math.min(3.5,zoom*(e.deltaY>0?.9:1.1)));draw();};$('resetCamera')?.addEventListener('click',()=>{yaw=.66;pitch=.46;zoom=1;draw();});
}
function openTextEditor(file,token){if(token!==state.previewToken)return;readText(file.current.entry).then(text=>{if(token!==state.previewToken)return;const box=$('inspectorBody');const modal=document.createElement('div');modal.className='inspector-section';modal.innerHTML='<h4>EDIT FILE CONTENT</h4><textarea class="code-edit" id="editSourceText"></textarea><div class="inspector-actions"><button class="btn btn-primary btn-small" id="saveSourceText">Save changes</button><button class="btn btn-ghost btn-small" id="cancelSourceText">Cancel</button></div>';box.prepend(modal);$('editSourceText').value=text;$('editSourceText').focus();$('cancelSourceText').onclick=()=>modal.remove();$('saveSourceText').onclick=()=>{try{const t=$('editSourceText').value;if(file.path.endsWith('.json')||file.path.endsWith('.mcmeta'))JSON.parse(t);setModified(file.current.entry,new TextEncoder().encode(t));buildIndex();toast('Changes saved in the working copy.','good');}catch(e){toast(`Invalid JSON: ${e.message}`,'error');}};}).catch(e=>toast(e.message,'error'));}
async function downloadEntry(path){try{const file=state.index.get(path);if(!file)return;downloadBlob(new Blob([await readBytes(file.current.entry)],{type:'application/octet-stream'}),prettyName(path));}catch(e){toast(e.message,'error');}}
function downloadBlob(blob,filename){const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function exportMerged(){if(!state.index.size||state.busy)return;setBusy(true,'Building merged ZIP…');try{
 const output=new JSZip();const meta={pack:{description:'Merged with Resource Pack Studio · Minecraft 26.3',min_format:[97,1],max_format:[97,1]}};
 output.file('pack.mcmeta',JSON.stringify(meta,null,2));let included=0;const items=[...state.index.values()].filter(x=>!state.excluded.has(x.path)&&x.path!=='pack.mcmeta');
 for(let i=0;i<items.length;i++){const f=items[i];if(!validPath(f.path))continue;output.file(f.path,await readBytes(f.current.entry),{binary:true});included++;if(i%60===0){showStatus(`Adding ${i+1}/${items.length} assets…`);await sleep();}}
 const blob=await output.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:5}}, progress=>{showStatus(`Compressing merged pack · ${progress.percent.toFixed(0)}%`);});
 downloadBlob(blob,`ResourcePackStudio_26.3_${Date.now()}.zip`);toast(`Export complete: ${included} resources · ${fmtSize(blob.size)}`,'good');showStatus(`Exported ${included} assets. Check compatibility in Minecraft 26.3.`);
 }catch(e){toast(`Export failed: ${e.message}`,'error');showStatus('Export failed.');}finally{setBusy(false);}}
async function saveProject(){if(!state.packs.length||state.busy)return;setBusy(true,'Saving editable project…');try{
 const zip=new JSZip();const ids=state.packs.map(p=>({id:p.id,name:p.name,originalName:p.originalName,enabled:p.enabled}));const data={version:1,target:'26.3',packs:ids,overrides:[...state.overrides],excluded:[...state.excluded],modified:[]};
 for(let i=0;i<state.packs.length;i++){const p=state.packs[i];zip.file(`packs/${i}.zip`,p.blob,{binary:true});for(const [path,e] of p.files)if(e.modified){const editPath=`modifications/${i}/${data.modified.length}.bin`;zip.file(editPath,await readBytes(e));data.modified.push({packIndex:i,path,file:editPath});}showStatus(`Saving pack ${i+1}/${state.packs.length}`);await sleep();}
 zip.file('resource-pack-studio.json',JSON.stringify(data,null,2));const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});downloadBlob(blob,`ResourcePackStudio_project_${Date.now()}.rps`);toast('Project saved with source ZIP files and edits.','good');
 }catch(e){toast('Unable to save project: '+e.message,'error');}finally{setBusy(false);}}
async function importProject(file){const archive=await JSZip.loadAsync(file);const manifest=archive.file('resource-pack-studio.json');if(!manifest)throw Error('Not a Resource Pack Studio project.');const data=JSON.parse(await manifest.async('string'));
 if(data.version!==1||!Array.isArray(data.packs)||data.packs.length>50)throw Error('Unsupported project version or pack count.');
 const loaded=[];for(let i=0;i<data.packs.length;i++){const raw=archive.file(`packs/${i}.zip`);if(!raw)throw Error(`Project missing source pack ${i}.`);const content=await raw.async('blob');const input=new File([content],data.packs[i].originalName||`pack-${i}.zip`,{type:'application/zip'});const p=await loadPack(input,data.packs[i].name,data.packs[i].id);p.enabled=!!data.packs[i].enabled;loaded.push(p);}
 for(const edit of data.modified||[]){const p=loaded[edit.packIndex],e=p?.files.get(edit.path),z=archive.file(edit.file);if(e&&z)setModified(e,await z.async('uint8array'));}
 // Loading a saved project replaces the whole workspace, including previous overrides.
 state.packs=loaded;state.overrides=new Map(data.overrides||[]);state.excluded=new Set(data.excluded||[]);state.selected=null;state.counter=Math.max(state.counter,loaded.length+1);toast('Restored saved project.','good');
}
async function scanDiagnostics(){if(state.busy)return;setBusy(true,'Running static analysis…');const issues=[];
 for(const p of state.packs){for(const text of p.readmeWarnings)issues.push({level:'warn',title:'Pack compatibility notice · '+p.name,text});}
 const entries=[...state.index.values()];const shaders=entries.filter(x=>x.kind==='shader');
 for(const f of entries){if(f.conflict&&f.kind==='shader')issues.push({level:'warn',title:'Shader path override conflict',text:`${f.sources.length} packs contain this shader`,path:f.path});}
 let checked=0;for(const f of entries){if(f.current.entry.size>2*1024*1024)continue;
 if(/\.(?:json|mcmeta)$/i.test(f.path)){
 let obj;try{obj=await readJSON(f.current.entry);}catch(e){issues.push({level:'error',title:'Invalid JSON',text:e.message,path:f.path});continue;}
 if(f.kind==='model'){
 const parent=obj.parent;if(typeof parent==='string'&&!parent.startsWith('builtin/')){const pp=modelRefPath(parent,f.path);if(pp&&!state.index.has(pp)&&!pp.startsWith('assets/minecraft/'))issues.push({level:'warn',title:'Unresolved custom model parent',text:`${parent}; not present in loaded packs`,path:f.path});}
 for(const val of Object.values(obj.textures||{})){if(typeof val!=='string'||val.startsWith('#'))continue;const tex=resolveTextureName(val,{},getOrigin(f.path));if(tex&&!state.index.has(tex)&&getOrigin(tex)!=='minecraft')issues.push({level:'warn',title:'Unresolved custom model texture',text:val,path:f.path});}
 }
 if(f.kind==='animation'){
 const paired=f.path.slice(0,-7);if(!state.index.has(paired))issues.push({level:'warn',title:'Missing paired PNG',text:paired,path:f.path});
 if(obj?.animation?.frametime!==undefined&&(!Number.isInteger(obj.animation.frametime)||obj.animation.frametime<1))issues.push({level:'warn',title:'Invalid frametime',text:'Animation frame time should be a positive integer',path:f.path});
 }
 }else if(/\.(?:fsh|vsh|glsl)$/i.test(f.path)){
 let txt='';try{txt=await readText(f.current.entry);}catch{continue;}
 if(/#moj_import\s*["<]/.test(txt))issues.push({level:'warn',title:'Legacy shader import directive',text:'Review #moj_import; 26.3 uses ShaderC #include.',path:f.path});
 for(const m of txt.matchAll(/^\s*#include\s*["<]([^">]+)[">]/gm)){if(!findShaderInclude(f.path,m[1]))issues.push({level:'info',title:'Shader include not in uploaded packs',text:`${m[1]} (could be provided by vanilla Minecraft)`,path:f.path});}
 }
 checked++;if(checked%80===0){showStatus(`Scanned ${checked}/${entries.length} resources…`);await sleep();}
 }
 state.issueList=issues;state.diagnosisDone=true;updateCounts();renderFiles();setBusy(false,`Scan complete · ${issues.length} notices · ${entries.length} assets inspected`);toast(`Static scan finished: ${issues.length} notice(s)`,'good');
}
async function makeDemo(){if(state.busy)return;setBusy(true,'Building sample packs…');try{
 const png=async(draw,width=16,height=16)=>{const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;draw(ctx,width,height);return new Uint8Array(await new Promise((resolve,reject)=>c.toBlob(async b=>b?resolve(await b.arrayBuffer()):reject(Error('PNG generation failed')),'image/png')));};
 const stone=await png(c=>{c.fillStyle='#687f9b';c.fillRect(0,0,16,16);for(let y=0;y<16;y+=4)for(let x=0;x<16;x+=4){c.fillStyle=(x+y)%8===0?'#8497af':'#526782';c.fillRect(x,y,3,3);}});
 const stone2=await png(c=>{c.fillStyle='#5166a8';c.fillRect(0,0,16,16);for(let i=0;i<25;i++){c.fillStyle=i%3===0?'#80acec':'#334f80';c.fillRect((i*7)%16,(i*9)%16,3,3);}});
 const animated=await png((c)=>{for(let j=0;j<4;j++){const y=j*16;c.fillStyle=['#bb4a29','#ed7526','#ffb343','#e5a126'][j];c.fillRect(0,y,16,16);c.fillStyle='#ffe49d';c.fillRect(5,y+8-j,6,5);c.fillRect(7,y+3+j,3,7);}},16,64);
 const model={parent:'minecraft:block/block',textures:{all:'minecraft:block/stone'},elements:[{from:[0,0,0],to:[16,16,16],faces:{north:{texture:'#all'},south:{texture:'#all'},west:{texture:'#all'},east:{texture:'#all'},up:{texture:'#all'},down:{texture:'#all'}}}]};
 const shader='#version 150\n#include "minecraft:include/common.glsl"\nlayout(location = 0) in vec2 texCoord;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(texCoord, 0.7, 1.0); }\n';
 const a=new JSZip();a.file('pack.mcmeta',JSON.stringify({pack:{description:'Demo – base pack',min_format:[97,1],max_format:[97,1]}}));a.file('assets/minecraft/textures/block/stone.png',stone);a.file('assets/minecraft/textures/block/portal.png',animated);a.file('assets/minecraft/textures/block/portal.png.mcmeta',JSON.stringify({animation:{frametime:3,frames:[0,1,2,3]}}));a.file('assets/minecraft/models/block/demo_cube.json',JSON.stringify(model,null,2));a.file('assets/minecraft/shaders/core/terrain.fsh',shader);
 const b=new JSZip();b.file('pack.mcmeta',JSON.stringify({pack:{description:'Demo – override pack',min_format:[97,1],max_format:[97,1]}}));b.file('assets/minecraft/textures/block/stone.png',stone2);b.file('assets/minecraft/shaders/core/terrain.fsh',shader.replace('0.7','0.3'));
 const blobA=await a.generateAsync({type:'blob',compression:'DEFLATE'}),blobB=await b.generateAsync({type:'blob',compression:'DEFLATE'});
 const one=new File([blobA],'Demo_Base.zip',{type:'application/zip'}),two=new File([blobB],'Demo_Override.zip',{type:'application/zip'});
 state.packs.unshift(await loadPack(one,'Demo · Base'));state.packs.unshift(await loadPack(two,'Demo · Override'));state.diagnosisDone=false;buildIndex();showStatus('Demo loaded · select a PNG, model, animation or shader.');toast('Loaded two demo packs with deliberate texture and shader conflicts.','good');
 }catch(e){toast('Sample project failed: '+e.message,'error');}finally{setBusy(false);}}
function handleAction(action,id){if(action==='add'){$('zipInput').click();return;}if(action==='sample'){makeDemo();return;}if(action==='more'){state.limit+=350;renderFiles();return;}if(action==='scan'){scanDiagnostics();return;}if(action==='pack-up'){movePack(id,-1);return;}if(action==='pack-down'){movePack(id,1);return;}if(action==='pack-remove'){const i=state.packs.findIndex(p=>p.id===id);if(i!==-1){state.packs.splice(i,1);state.diagnosisDone=false;buildIndex();}return;}}
function initEvents(){
 $('addPackBtn').addEventListener('click',()=>{$('zipInput').click();});$('exportBtn').addEventListener('click',exportMerged);$('projectBtn').addEventListener('click',saveProject);
 $('zipInput').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';importFiles(files);});
 $('searchInput').addEventListener('input',e=>{state.search=e.target.value;state.limit=350;renderFiles();});$('typeFilter').addEventListener('change',e=>{state.filter=e.target.value;state.limit=350;renderFiles();});
 document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{state.tab=t.dataset.tab;state.limit=350;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));renderFiles();}));
 $('filesList').addEventListener('click',e=>{const action=e.target.closest('[data-action]');if(action){handleAction(action.dataset.action,action.dataset.id);return;}const check=e.target.closest('input[data-exclude]');if(check){const p=check.dataset.exclude;if(check.checked)state.excluded.delete(p);else state.excluded.add(p);if(state.selected===p)renderInspector();return;}const row=e.target.closest('[data-path]');if(row)selectPath(row.dataset.path);});
 $('filesList').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.file-row[data-path]')){e.preventDefault();selectPath(e.target.dataset.path);}});
 $('packsList').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button&&button.type!=='checkbox')handleAction(button.dataset.action,button.dataset.id);});$('packsList').addEventListener('change',e=>{if(e.target.dataset.action==='pack-enable'){const p=findPack(e.target.dataset.id);if(p){p.enabled=e.target.checked;state.diagnosisDone=false;buildIndex();}}});
 let dragPack=null;$('packsList').addEventListener('dragstart',e=>{const c=e.target.closest('.pack-card');if(!c)return;dragPack=c.dataset.packId;c.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragPack);});$('packsList').addEventListener('dragover',e=>{const c=e.target.closest('.pack-card');if(c&&dragPack){e.preventDefault();c.classList.add('drag-target');}});$('packsList').addEventListener('dragleave',e=>{e.target.closest('.pack-card')?.classList.remove('drag-target');});$('packsList').addEventListener('drop',e=>{const target=e.target.closest('.pack-card');if(!target||!dragPack)return;e.preventDefault();const a=state.packs.findIndex(p=>p.id===dragPack),b=state.packs.findIndex(p=>p.id===target.dataset.packId);if(a>=0&&b>=0&&a!==b){const [p]=state.packs.splice(a,1);state.packs.splice(b,0,p);state.diagnosisDone=false;buildIndex();}dragPack=null;});$('packsList').addEventListener('dragend',()=>{dragPack=null;document.querySelectorAll('.pack-card').forEach(c=>c.classList.remove('dragging','drag-target'));});
 let drops=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types?.includes('Files')){drops++;$('dropOverlay').classList.add('visible');}});window.addEventListener('dragleave',e=>{drops=Math.max(0,drops-1);if(!drops)$('dropOverlay').classList.remove('visible');});window.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files'))e.preventDefault();});window.addEventListener('drop',e=>{e.preventDefault();drops=0;$('dropOverlay').classList.remove('visible');if(e.dataTransfer?.files?.length)importFiles([...e.dataTransfer.files]);});
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement.tagName)){e.preventDefault();$('searchInput').focus();}});
}
initEvents();buildIndex();showStatus('Ready · open ZIP files or try the sample project.');
window.ResourcePackStudio={getState:()=>({packs:state.packs.length,assets:state.index.size,conflicts:[...state.index.values()].filter(f=>f.conflict).length,selected:state.selected}),importFiles,exportMerged,makeDemo};
})();
