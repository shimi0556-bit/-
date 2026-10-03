// Custom camera shots for QA and photo comparison (BUILD_GUIDE §6).
//   node tools/shot.cjs <model-id> <outdir> name '{"pos":[x,y,z],"target":[x,y,z],"fov":30,"toggles":[],"cut":0,"axis":"z","frames":0}' ...
const path=require('path'),fs=require('fs'),os=require('os');const {execFileSync}=require('child_process');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/node22/lib/node_modules/playwright');}
const ROOT=path.resolve(__dirname,'..');const id=process.argv[2];
const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');
async function serve(route){const url=route.request().url();if(!url.startsWith('https://cdn.jsdelivr.net/'))return route.abort();const f=path.join(CACHE,url.replace(/[^a-z0-9.]+/gi,'_'));if(!fs.existsSync(f)){fs.mkdirSync(CACHE,{recursive:true});execFileSync('curl',['-sSfL',url,'-o',f]);}return route.fulfill({path:f,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});}
(async()=>{const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await b.newPage({viewport:{width:1280,height:800}});await page.route(/^https?:\/\//,serve);
page.on('pageerror',e=>console.log('ERR',e.message));page.on('console',m=>{if(m.type()!=='log')console.log('['+m.type()+']',m.text().slice(0,600));});
await page.goto('file://'+ROOT+'/models/'+id+'/index.html?shot=1');await page.waitForFunction(()=>window.__ready||window.__error,null,{timeout:240000});
const OUT=process.argv[3];fs.mkdirSync(OUT,{recursive:true});const args=process.argv.slice(4);
for(let i=0;i<args.length;i+=2){const name=args[i],o=JSON.parse(args[i+1]);
await page.evaluate(([o])=>{const v=window.__viewer;v.toggles.forEach(t=>{const on=(o.toggles||[]).includes(t.id);t.target=t.t=on?1:0;t.apply(t.t);});v.setExplode(o.explode||0);v.setXray(!!o.xray);v.setCut(o.cut||0,o.axis||'z');
if(o.frames){for(let i=0;i<o.frames;i++)window.L3D.kit.registry.frames.forEach(f=>f(i*0.1,0.1));}if(o.fireAt!==undefined)window.L3D.kit.__fire.at(o.fireAt);v.camera.position.set(...o.pos);v.controls.target.set(...o.target);v.camera.fov=o.fov||40;v.camera.updateProjectionMatrix();v.controls.update();window.__render();},[o]);
await page.screenshot({path:path.join(OUT,name+'.png'),timeout:120000});}
await b.close();})();
