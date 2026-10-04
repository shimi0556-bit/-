// Load exported GLB files with three.js GLTFLoader (as a game would) and verify the game contract:
// wheel/steer nodes present, +Z forward, resting on y = 0. Writes models/<id>/game/preview.png.
//   node tools/glb_check.cjs <model-id> [...]
const path=require('path'),fs=require('fs'),os=require('os'),http=require('http');const {execFileSync}=require('child_process');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/node22/lib/node_modules/playwright');}
const ROOT=path.resolve(__dirname,'..');const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');
async function serve(route){const url=route.request().url();if(url.startsWith('http://127.0.0.1'))return route.continue();if(!url.startsWith('https://cdn.jsdelivr.net/'))return route.abort();const f=path.join(CACHE,url.replace(/[^a-z0-9.]+/gi,'_'));if(!fs.existsSync(f)){fs.mkdirSync(CACHE,{recursive:true});execFileSync('curl',['-sSfL',url,'-o',f]);}return route.fulfill({path:f,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});}
const HTML=`<!doctype html><html><body style="margin:0;background:#20242b"><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}</script>
<script type="module">import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
window.check=async(url)=>{const g=await new GLTFLoader().loadAsync(url);const r=new T.WebGLRenderer({antialias:true});r.setSize(900,560);document.body.innerHTML='';document.body.appendChild(r.domElement);
const s=new T.Scene();s.background=new T.Color(0x20242b);s.environment=new T.PMREMGenerator(r).fromScene(new RoomEnvironment(),0.04).texture;s.add(new T.HemisphereLight(0xffffff,0x334455,1.2));const d=new T.DirectionalLight(0xffffff,2);d.position.set(5,8,6);s.add(d);
s.add(g.scene);g.scene.updateMatrixWorld(true);const bb=new T.Box3().setFromObject(g.scene),sz=bb.getSize(new T.Vector3());
const names=[];g.scene.traverse(o=>{if(/^(Wheel|Steer)_/.test(o.name))names.push(o.name);});
// forward check: the front wheels must have the larger z
const fl=g.scene.getObjectByName('Wheel_FL'),rl=g.scene.getObjectByName('Wheel_RL');const fz=fl?fl.getWorldPosition(new T.Vector3()).z:null,rz=rl?rl.getWorldPosition(new T.Vector3()).z:null;
// direction tests (numbers, not eyes): (1) rolling forward by spinRadPerMetre must move the tyre's contact
// point backwards (-Z); (2) a positive steer angle must point the wheel's rolling direction to the left (+X)
const info=g.scene.children[0].userData.l3d||{};const dirErr=[];
for(const w of info.wheels||[]){const n=g.scene.getObjectByName(w.node);if(!n)continue;const c=n.getWorldPosition(new T.Vector3());
 const bottom=c.clone().add(new T.Vector3(0,-w.radius,0)),loc=n.worldToLocal(bottom.clone());n.rotation.z+=w.spinRadPerMetre*0.05;n.updateMatrixWorld(true);const moved=n.localToWorld(loc.clone());n.rotation.z-=w.spinRadPerMetre*0.05;n.updateMatrixWorld(true);
 if(!(moved.z<bottom.z))dirErr.push(w.node+' rolls the wrong way');
 if(w.steerNode){const s=g.scene.getObjectByName(w.steerNode);const roll=()=>{const q=n.getWorldQuaternion(new T.Quaternion());const d=new T.Vector3(1,0,0).applyQuaternion(q);if(d.z<0)d.negate();return d;};
  const d0=roll();s.rotation.y+=0.3;s.updateMatrixWorld(true);const d1=roll();s.rotation.y-=0.3;s.updateMatrixWorld(true);if(!(d1.x>d0.x+0.1))dirErr.push(w.steerNode+' steers the wrong way');}}
const cam=new T.PerspectiveCamera(32,900/560,0.05,200);const R=sz.length();cam.position.set(-R*0.9,R*0.45,R*1.05);cam.lookAt(0,sz.y*0.35,0);r.render(s,cam);
let tris=0;g.scene.traverse(o=>{if(o.isMesh){const n=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;tris+=o.isInstancedMesh?n*o.count:n;}});
return {dirErr,names,minY:+bb.min.y.toFixed(3),size:sz.toArray().map(n=>+n.toFixed(2)),frontZ:fz,rearZ:rz,tris:Math.round(tris),extras:!!(g.scene.children[0]&&g.scene.children[0].userData.l3d)};};window.ready=1;</script></body></html>`;
(async()=>{const ids=process.argv.slice(2);
const srv=http.createServer((q,res)=>{const u=decodeURIComponent(q.url.split('?')[0]);if(u==='/'){res.setHeader('content-type','text/html');return res.end(HTML);}const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('content-type','model/gltf-binary');fs.createReadStream(f).pipe(res);}).listen(0,'127.0.0.1');
await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const page=await b.newPage({viewport:{width:900,height:560}});await page.route(/^https?:\/\//,serve);page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.ready);let bad=0;
for(const id of ids)for(const kind of ['','.race']){const rel=`/models/${id}/game/${id}${kind}.glb`;const r=await page.evaluate((u)=>window.check(u),rel);
 const tracked=JSON.parse(fs.readFileSync(path.join(ROOT,'models',id,'game',id+'.game.json'))).tracked;
 const okW=tracked||['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'].every(n=>r.names.includes(n));const okF=tracked||(r.frontZ>r.rearZ);const okY=Math.abs(r.minY)<0.03;
 const okD=!r.dirErr.length;if(!(okW&&okF&&okY&&r.extras&&okD))bad++;
 console.log(`  ${okW&&okF&&okY&&r.extras&&okD?'ok  ':'FAIL'} ${id}${kind}.glb: ${r.tris} tris, size ${r.size.join('×')} m, minY ${r.minY}, wheels ${tracked?'(tracked)':r.names.filter(n=>n.startsWith('Wheel')).length}, steer ${r.names.filter(n=>n.startsWith('Steer')).length}, front +Z ${tracked?'n/a':okF}, extras ${r.extras}, roll/steer ${okD?'ok':r.dirErr.join('; ')}`);
 if(!kind)await page.screenshot({path:path.join(ROOT,'models',id,'game','preview.png')});}
await b.close();srv.close();process.exit(bad?1:0);})();
