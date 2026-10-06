// Evaluate a JS function in the model page (after build) and print the result. Handy to dump part cards or probe geometry.
//   node tools/eval.cjs <model-id> <file.js>      where file.js is an arrow function: () => { ...return value }
//   e.g. () => { const o=[]; window.__viewer.root.traverse(n=>{const p=n.userData&&n.userData.part; if(p)o.push(p.he+' | '+p.desc);}); return o.join('\n'); }
const path=require('path'),fs=require('fs'),os=require('os');const {execFileSync}=require('child_process');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/node22/lib/node_modules/playwright');}
const ROOT=path.resolve(__dirname,'..');const id=process.argv[2];const code=fs.readFileSync(process.argv[3],'utf8');
const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');
(async()=>{const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await b.newPage({viewport:{width:800,height:500}});
await page.route(/^https?:\/\//,async route=>{const url=route.request().url();if(!url.startsWith('https://cdn.jsdelivr.net/'))return route.abort();const f=path.join(CACHE,url.replace(/[^a-z0-9.]+/gi,'_'));if(!fs.existsSync(f)){fs.mkdirSync(CACHE,{recursive:true});execFileSync('curl',['-sSfL',url,'-o',f]);}return route.fulfill({path:f,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});});
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('file://'+ROOT+'/models/'+id+'/index.html?shot=1');await page.waitForFunction(()=>window.__ready||window.__error,null,{timeout:240000});
const r=await page.evaluate(new Function('return ('+code+')()'));console.log(typeof r==='string'?r:JSON.stringify(r,null,1));await b.close();})();
