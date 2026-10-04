// node tools/ortho.cjs <id> <outdir>  -> side.png front.png rear.png top.png: white silhouettes on black, orthographic,
// 200 px per metre, origin at the image centre (side/front/rear centred at y = 0.8 m). Compare with a scaled blueprint.
const path=require('path'),os=require('os');const playwright=require('/opt/node22/lib/node_modules/playwright');
const CACHE=path.join(os.tmpdir(),'l3d-cdn-cache');
const [id,outdir]=process.argv.slice(2);const PXM=200,W=1200,H=500;
(async()=>{const b=await playwright.chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage({viewport:{width:W,height:H}});
await p.route(/^https?:\/\//,r=>{const u=r.request().url();if(!u.startsWith('https://cdn.jsdelivr.net/'))return r.abort();return r.fulfill({path:path.join(CACHE,u.replace(/[^a-z0-9.]+/gi,'_')),contentType:'application/javascript'});});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+path.resolve(__dirname,'..','models')+'/'+id+'/index.html?shot=1');await p.waitForFunction(()=>window.__ready||window.__error,null,{timeout:240000});
await p.evaluate(([W,H,PXM])=>{const T=window.L3D.kit.THREE;const v=window.__viewer;
v.scene.children.forEach(c=>{if(c!==v.root)c.visible=false;});v.scene.background=null;v.renderer.setClearColor(0x000000,1);
const wm=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});v.root.traverse(o=>{if(o.isMesh||o.isInstancedMesh){o.material=wm;}if(o.isSprite||o.isPoints||o.isLine)o.visible=false;});
const cam=new T.OrthographicCamera(-W/2/PXM,W/2/PXM,H/2/PXM,-H/2/PXM,0.1,100);
window.__ortho=(view,cy)=>{const P={side:[[0,cy,-50],[0,1,0]],front:[[50,cy,0],[0,1,0]],rear:[[-50,cy,0],[0,1,0]],top:[[0,50,0],[0,0,1]]}[view];
cam.position.set(...P[0]);cam.up.set(...P[1]);cam.lookAt(view==='top'?0:P[0][0]===0?0:0,view==='top'?0:cy,0);if(view==='side')cam.lookAt(0,cy,0);if(view==='front'||view==='rear')cam.lookAt(0,cy,0);cam.updateProjectionMatrix();v.renderer.render(v.scene,cam);};},[W,H,PXM]);
for(const [view,cy] of [['side',0.8],['front',0.8],['rear',0.8],['top',0]]){await p.evaluate(([v,c])=>window.__ortho(v,c),[view,cy]);await p.screenshot({path:path.join(outdir,view+'.png')});}
await b.close();})();
