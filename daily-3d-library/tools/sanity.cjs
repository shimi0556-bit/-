// Geometric sanity check for one model (catches what eyes miss in wide shots).
//   node tools/sanity.cjs <model-id> [--far 0.4]
// 1. stray parts: a named part whose box is more than --far metres from every other part's box
//    (touches nothing), e.g. a scaled part that flew away from the car.
// 2. toggles: for every toggle, which parts move at t=1 and by how much (centre shift, box), so a
//    hinge that opens inwards or a lid that sinks into the body shows up as numbers, not a hunch.
// 3. below ground: meshes whose lowest point is under y = -0.01.
const path=require('path'),fs=require('fs'),os=require('os');const {execFileSync}=require('child_process');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/node22/lib/node_modules/playwright');}
const ROOT=path.resolve(__dirname,'..');const id=process.argv[2];const FAR=+(process.argv[process.argv.indexOf('--far')+1]||0.4)||0.4;
const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');
async function serve(route){const url=route.request().url();if(!url.startsWith('https://cdn.jsdelivr.net/'))return route.abort();const f=path.join(CACHE,url.replace(/[^a-z0-9.]+/gi,'_'));if(!fs.existsSync(f)){fs.mkdirSync(CACHE,{recursive:true});execFileSync('curl',['-sSfL',url,'-o',f]);}return route.fulfill({path:f,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});}
(async()=>{const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const page=await b.newPage();await page.route(/^https?:\/\//,serve);
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('file://'+ROOT+'/models/'+id+'/index.html?shot=1');await page.waitForFunction(()=>window.__ready||window.__error,null,{timeout:240000});
const out=await page.evaluate((FAR)=>{const T=window.L3D.THREE,v=window.__viewer,root=v.root;
const partOf=(o)=>{let p=o;while(p&&!(p.userData&&p.userData.part))p=p.parent;return p?(p.userData.part.he+' / '+p.name):(o.name||'(ללא שם)');};
const snap=()=>{root.updateMatrixWorld(true);const m=new Map();root.traverse(o=>{if(!o.isMesh||!o.visible)return;const bb=new T.Box3().setFromObject(o);if(!isFinite(bb.min.x))return;m.set(o,bb);});return m;};
v.toggles.forEach(t=>{t.t=t.target=t.init;t.apply(t.init);});
const base=snap();const cs=[...base.values()].map(bb=>bb.getCenter(new T.Vector3()));
const pct=(a,q)=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(q*(a.length-1))];};
const core=new T.Box3(new T.Vector3(pct(cs.map(c=>c.x),.05),pct(cs.map(c=>c.y),.05),pct(cs.map(c=>c.z),.05)),new T.Vector3(pct(cs.map(c=>c.x),.95),pct(cs.map(c=>c.y),.95),pct(cs.map(c=>c.z),.95)));
const all=new T.Box3();base.forEach(bb=>all.union(bb));
const stray=[],under=[];
// group meshes by their innermost named part; a part is stray when its box is more than FAR away from every other part's box
const parts=new Map();base.forEach((bb,o)=>{const k=partOf(o);if(!parts.has(k))parts.set(k,new T.Box3());parts.get(k).union(bb);if(bb.min.y<-0.01)under.push([k,+bb.min.y.toFixed(3)]);});
const gapB=(a,b)=>Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x,a.min.y-b.max.y,b.min.y-a.max.y,a.min.z-b.max.z,b.min.z-a.max.z);
const list=[...parts];for(const [k,bb] of list){let g=1e9;for(const [k2,b2] of list){if(k2===k)continue;g=Math.min(g,gapB(bb,b2));if(g<=FAR)break;}if(g>FAR)stray.push([k,+g.toFixed(2),bb.getCenter(new T.Vector3()).toArray().map(n=>+n.toFixed(2))]);}
const tg=[];for(const t of v.toggles){t.apply(1);const s=snap();const moved=new Map();s.forEach((bb,o)=>{const b0=base.get(o);if(!b0)return;const d=bb.getCenter(new T.Vector3()).sub(b0.getCenter(new T.Vector3()));if(d.length()>0.01){const k=partOf(o);if(!moved.has(k))moved.set(k,{d:d.toArray().map(n=>+n.toFixed(2)),min:bb.min.toArray().map(n=>+n.toFixed(2)),max:bb.max.toArray().map(n=>+n.toFixed(2))});}});
 tg.push([t.id,t.he,[...moved].slice(0,8)]);t.apply(t.init);}
return {core:[core.min.toArray(),core.max.toArray()].map(a=>a.map(n=>+n.toFixed(2))),all:[all.min.toArray(),all.max.toArray()].map(a=>a.map(n=>+n.toFixed(2))),stray,under:under.slice(0,10),tg};},FAR);
console.log('core box',JSON.stringify(out.core),' full box',JSON.stringify(out.all));
console.log(out.stray.length?'STRAY (far from the model):':'stray: none');out.stray.forEach(s=>console.log('  ✗',s[0],'gap',s[1],'m at',JSON.stringify(s[2])));
console.log(out.under.length?'BELOW GROUND:':'below ground: none');out.under.forEach(s=>console.log('  ✗',s[0],s[1]));
console.log('toggles at t=1 (part: centre shift [dx,dy,dz] → box):');out.tg.forEach(([id,he,m])=>{console.log(' •',id,he);m.forEach(([k,v])=>console.log('    ',k,JSON.stringify(v.d),'→',JSON.stringify(v.min),JSON.stringify(v.max)));});
await b.close();process.exit(out.stray.length||out.under.length?1:0);})();
