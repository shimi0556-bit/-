// Export a model as game-ready GLB files (BUILD_GUIDE §8).
//   node tools/export_glb.cjs <model-id> [...]     → models/<id>/game/<id>.glb, <id>.race.glb, <id>.game.json
// Conventions (glTF): metres, +Y up, the vehicle faces +Z, +X is its left; origin on the ground under the
// middle of the vehicle. Wheel nodes are named Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR (spin about their
// local Z); front wheels sit under Steer_FL / Steer_FR (turn about local Y) unless the same node does both.
// The .race.glb hides the systems listed in meta.game.lodHide (engine internals, armour layers…).
const path=require('path'),fs=require('fs'),os=require('os');const {execFileSync}=require('child_process');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/node22/lib/node_modules/playwright');}
const ROOT=path.resolve(__dirname,'..');
// glTF optimisation (cd tools && npm i): weld + dedup + prune + quantize for both files; the race file is also
// simplified with meshoptimizer. Quantization (KHR_mesh_quantization) is read by three.js, Babylon, Unity glTFast,
// Godot 4 and Unreal's glTF importer.
async function optimise(buf,race){
  let core,fn,ext,mo;try{core=require('./node_modules/@gltf-transform/core');fn=require('./node_modules/@gltf-transform/functions');ext=require('./node_modules/@gltf-transform/extensions');mo=require('./node_modules/meshoptimizer');}catch(e){console.log('  (no tools/node_modules: run `cd tools && npm i` for optimised GLB; writing raw files)');return buf;}
  const io=new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS);await mo.MeshoptSimplifier.ready;
  const doc=await io.readBinary(new Uint8Array(buf));
  const steps=[fn.dedup(),fn.weld()];
  if(race)steps.push(fn.simplify({simplifier:mo.MeshoptSimplifier,ratio:0.5,error:0.0015}));
  steps.push(fn.prune(),fn.quantize({quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12}));
  await doc.transform(...steps);
  return Buffer.from(await io.writeBinary(doc));
}const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');
async function serve(route){const url=route.request().url();if(!url.startsWith('https://cdn.jsdelivr.net/'))return route.abort();const f=path.join(CACHE,url.replace(/[^a-z0-9.]+/gi,'_'));if(!fs.existsSync(f)){fs.mkdirSync(CACHE,{recursive:true});execFileSync('curl',['-sSfL',url,'-o',f]);}return route.fulfill({path:f,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});}
(async()=>{const ids=process.argv.slice(2);const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
for(const id of ids){const page=await b.newPage();await page.route(/^https?:\/\//,serve);page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('file://'+ROOT+'/models/'+id+'/index.html?shot=1');await page.waitForFunction(()=>window.__ready||window.__error,null,{timeout:240000});
const out=await page.evaluate(async()=>{
  const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  const T=window.L3D.THREE,K=window.L3D.kit,v=window.__viewer,meta=window.L3D_META,game=meta.game||{};const rig=K.registry.rig;
  v.setExplode(0);v.setXray(false);v.setCut(0,'z');v.toggles.forEach(t=>{t.t=t.target=t.init;t.apply(t.init);});
  if(!rig)throw new Error('model has no K.gameRig()');
  const wheels=[];
  // Steer_* pivots get an identity rest rotation, so "positive angle about local Y = turn left" holds in
  // every engine. (A left wheel built as rotation.y = π re-imports as Euler (π, 0, π), and adding to .y
  // then steers the other way: glb_check.cjs tests this numerically.)
  for(const w of rig.wheels||[]){const tag=(w.front?'F':'R')+(w.s>0?'R':'L');w.spin.name='Wheel_'+tag;
    if(w.steer){const node=w.steer,par=node.parent,piv=new T.Group();piv.name='Steer_'+tag;piv.position.copy(node.position);par.add(piv);par.remove(node);node.position.set(0,0,0);piv.add(node);
      if(node!==w.spin)node.name='SteerRest_'+tag;w.steer=piv;}}
  const root=v.root;const wrap=new T.Group();wrap.name='Vehicle_'+meta.id;wrap.rotation.y=-Math.PI/2;
  const parent=root.parent;parent.remove(root);wrap.add(root);wrap.updateMatrixWorld(true);
  const box=new T.Box3();wrap.traverseVisible(o=>{if(o.isMesh)box.union(new T.Box3().setFromObject(o));}); /* visible meshes only: hidden cables/flags would inflate it */const size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());
  for(const w of rig.wheels||[]){const p=w.spin.getWorldPosition(new T.Vector3());wheels.push({node:w.spin.name,steerNode:w.steer?w.steer.name:null,front:w.front,side:w.s>0?'right':'left',radius:+w.r.toFixed(3),position:p.toArray().map(n=>+n.toFixed(3)),spinRadPerMetre:+(-w.s/w.r).toFixed(4)});}
  const info={id:meta.id,title:meta.title,titleEn:meta.titleEn,units:'metres',up:'+Y',forward:'+Z',left:'+X',origin:'ground, middle of the vehicle',
    dimensions:{length:+size.z.toFixed(3),width:+size.x.toFixed(3),height:+size.y.toFixed(3)},
    collider:{type:'box',center:c.toArray().map(n=>+n.toFixed(3)),halfExtents:size.clone().multiplyScalar(0.5).toArray().map(n=>+n.toFixed(3))},
    physics:game,wheels,tracked:rig.kind==='tracked',
    nodes:{spin:'rotate each Wheel_* node about its own local Z by spinRadPerMetre × metres driven forward (three.js: wheel.rotateZ(...))',steer:'set Steer_* rotation about local Y (rest rotation is identity): a positive angle turns toward the vehicle\'s left (+X)'},
    files:{full:meta.id+'.glb',race:meta.id+'.race.glb'}};
  // keep only the part card (Hebrew name, material, description) as glTF extras; models park
  // Object3Ds and typed arrays in userData, which the exporter would serialise as JSON
  root.traverse(o=>{const p=o.userData&&o.userData.part;o.userData=p?{part:{he:p.he,en:p.en,mat:p.mat,desc:p.desc}}:{};});
  wrap.userData={l3d:info};
  const ex=new GLTFExporter();
  const toB64=(ab)=>{let s='';const u=new Uint8Array(ab);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
  const run=async()=>toB64(await ex.parseAsync(wrap,{binary:true,onlyVisible:true,maxTextureSize:512}));
  const full=await run();
  const hidden=[];for(const id of game.lodHide||[]){const g=root.children.find(c=>c.name===id);if(g&&g.visible){g.visible=false;hidden.push(g);}}
  // also drop tiny parts (< 2 cm) in the race version: invisible at racing distance
  const tiny=[];root.traverse(o=>{if(o.isMesh&&o.visible){const bb=new T.Box3().setFromObject(o);const s=bb.getSize(new T.Vector3());if(Math.max(s.x,s.y,s.z)<0.02){o.visible=false;tiny.push(o);}}});
  const race=await run();
  hidden.forEach(g=>g.visible=true);tiny.forEach(o=>o.visible=true);
  let tri=0,triR=0;root.traverse(o=>{if(o.isMesh){const g=o.geometry,n=(g.index?g.index.count:g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);tri+=n;}});
  info.triangles={full:Math.round(tri)};
  return {info,full,race,hiddenSystems:hidden.map(g=>g.name),tinyHidden:tiny.length};});
const dir=path.join(ROOT,'models',id,'game');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,id+'.glb'),await optimise(Buffer.from(out.full,'base64'),false));fs.writeFileSync(path.join(dir,id+'.race.glb'),await optimise(Buffer.from(out.race,'base64'),true));
fs.writeFileSync(path.join(dir,id+'.game.json'),JSON.stringify(out.info,null,2)+'\n');
const kb=(f)=>Math.round(fs.statSync(path.join(dir,f)).size/1024);
console.log(`  ok   ${id}: ${id}.glb ${kb(id+'.glb')} KB, ${id}.race.glb ${kb(id+'.race.glb')} KB (hid ${out.hiddenSystems.join(', ')||'—'} + ${out.tinyHidden} tiny meshes), ${out.info.wheels.length} wheel nodes, ${out.info.dimensions.length}×${out.info.dimensions.width}×${out.info.dimensions.height} m`);
await page.close();}
await b.close();})();
