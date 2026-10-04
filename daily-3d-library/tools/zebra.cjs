// Surface-fairness check ("zebra stripes", as used in car design studios).
//   node tools/zebra.cjs <id> <outdir> name '{"pos":[..],"target":[..],"fov":30,"axis":"y","n":18}' [name json ...]
// Every mesh gets a shader that paints black/white stripes from the reflected view ray (world space).
// Fair, curvature-continuous surfaces give smooth flowing stripes; a kink breaks them, a dent makes them wobble.
// Env: VW/VH image size (default 1280x800). Only meshes of the systems in "sys" (default body + doors) are striped, others grey; "all":true stripes everything.
const path=require('path'),os=require('os'),fs=require('fs');const {execFileSync}=require('child_process');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/opt/node22/lib/node_modules/playwright');}
const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');fs.mkdirSync(CACHE,{recursive:true});
const [id,outdir,...rest]=process.argv.slice(2);const VW=+process.env.VW||1280,VH=+process.env.VH||800;
async function serve(route){const url=route.request().url();if(!url.startsWith('https://cdn.jsdelivr.net/'))return route.abort();const f=path.join(CACHE,url.replace(/[^a-z0-9.]+/gi,'_'));if(!fs.existsSync(f))execFileSync('curl',['-sSfL',url,'-o',f]);return route.fulfill({path:f,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});}
(async()=>{fs.mkdirSync(outdir,{recursive:true});
const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await b.newPage({viewport:{width:VW,height:VH}});await page.route(/^https?:\/\//,serve);
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto('file://'+path.resolve(__dirname,'..','models',id,'index.html')+'?shot=1');
await page.waitForFunction(()=>window.__ready||window.__error,null,{timeout:240000});
for(let i=0;i<rest.length;i+=2){const name=rest[i],o=JSON.parse(rest[i+1]);
await page.evaluate((o)=>{const T=window.L3D.kit.THREE;const v=window.__viewer;
v.scene.children.forEach(c=>{if(c!==v.root&&!c.isLight)c.visible=false;});v.scene.background=new T.Color(0x202326);
const ax={x:0,y:1,z:2}[o.axis||'y'];
const mk=(on)=>new T.ShaderMaterial({side:T.DoubleSide,uniforms:{n:{value:o.n||18},ax:{value:ax},on:{value:on?1:0}},
 vertexShader:'varying vec3 wn;varying vec3 wp;void main(){wn=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
 fragmentShader:'uniform float n;uniform int ax;uniform float on;varying vec3 wn;varying vec3 wp;void main(){vec3 vd=normalize(wp-cameraPosition);vec3 nn=normalize(wn);if(dot(nn,vd)>0.)nn=-nn;vec3 r=reflect(vd,nn);float c=ax==0?r.x:ax==1?r.y:r.z;float s=step(0.5,fract(c*n*0.5+0.5));float sh=0.55+0.45*max(0.,dot(nn,normalize(vec3(0.3,1.,0.2))));vec3 col=on>0.5?mix(vec3(0.05),vec3(0.95),s):vec3(0.35)*sh;gl_FragColor=vec4(col,1.);}'});
const zon=mk(true),zoff=mk(false);
const want=new Set(o.sys||['body','doors']);v.root.traverse(m=>{if(!(m.isMesh||m.isInstancedMesh))return;const shell=want.has(m.userData.sysId);
 if(m.isSprite||m.isPoints||m.isLine){m.visible=false;return;}m.material=(o.all||shell)?zon:zoff;});
v.toggles.forEach(t=>{t.target=t.t=0;t.apply(0);});
v.camera.position.set(...o.pos);v.controls.target.set(...o.target);v.camera.fov=o.fov||30;v.camera.updateProjectionMatrix();v.controls.update();window.__render();},o);
await page.screenshot({path:path.join(outdir,name+'.png')});}
await b.close();})();
