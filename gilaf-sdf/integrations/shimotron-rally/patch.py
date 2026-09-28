"""Put Gilaf models into a copy of the Shimotron Rally single-file build.

usage: python3 patch.py <rally.html> [out.html]

Adds the car 'גילוף GT' to the garage, an animated dog by every start gate, and mushroom houses
and crystal rocks along the verges. The models come from ./models (see README.md for how to re-export).
Every change is anchored on an exact snippet of the build; if the game changes, the script stops
and names the anchor that no longer matches instead of writing a broken file.
"""
import base64, os, sys
here = os.path.dirname(os.path.abspath(__file__))
src_path = sys.argv[1] if len(sys.argv) > 1 else 'rally.html'
out_path = sys.argv[2] if len(sys.argv) > 2 else 'rally-gilaf.html'
src = open(src_path, encoding='utf-8').read()
def uri(p): return 'data:model/gltf-binary;base64,' + base64.b64encode(open(os.path.join(here, 'models', p), 'rb').read()).decode()

def sub(s, old, new):
    assert s.count(old) == 1, ('anchor not unique', old[:80], s.count(old))
    return s.replace(old, new, 1)

s = src
# 1. the car model next to the concept car
s = sub(s, '`}},tk=', '`},gilaf:{hi:`' + uri('gilaf-car.glb') + '`,lo:`' + uri('gilaf-car-lo.glb') + '`}},tk=')

# 2. the car in the car list, right after the concept car, with the concept's physics
concept_tail = "exhaust:[.42,-.38,-2.06,!0]},shape:{halfL:2.2,w:1,flare:.08,floor:-.44,belt:.06,hoodDrop:.2,roof:.52,cabin:[.9,.25,-.5,-1.55],cabinW:.8,wing:`none`}},"
gilaf_car = ("{id:`gilaf`,model:`gilaf`,name:`גילוף GT`,desc:`נפסלה במנוע גילוף מנוסחאות מתמטיות: קופה רטרו עם פסי מירוץ, כנף אחורית וחישוקי כוכב`,price:0,"
             "spec:{mass:1320,body:{half:[1,.3,2.15],offset:[0,-.18,0]},cabin:{half:[.72,.2,1.2],offset:[0,.36,-.25]},wheel:{radius:.384,width:.28,front:1.4,rear:-1.4,track:.975,grip:1.7},"
             "engine:{accel:11.8,topSpeed:71,frontShare:.28},downforce:.7,drag:7e-4,exhaust:[.42,-.05,-2.24,!0]},"
             "shape:{halfL:2.2,w:1,flare:.08,floor:-.44,belt:.06,hoodDrop:.2,roof:.52,cabin:[.9,.25,-.5,-1.55],cabinW:.8,wing:`none`}},")
s = sub(s, concept_tail, concept_tail + gilaf_car)

# 3. load the scenery models at boot, with the same loader as the cars
props = {'dog': uri('dog.glb'), 'mushroom': uri('mushroom.glb'), 'crystals': uri('crystals.glb')}
inject = r'''var __gilaf={props:null,loader:null,src:null,dogs:[],q:null,sys:!1,track:null};globalThis.__gilafDebug=__gilaf;
async function __gilafLoad(e){let t={DOG},n={};__gilaf.loader=e,__gilaf.src=t,await Promise.all(Object.entries(t).map(async([t,r])=>{try{n[t]=await e.loadAsync(r)}catch(e){console.warn(`gilaf model ${t} did not load`,e)}})),__gilaf.props=n}
function __gilafPrep(e){return e.traverse(e=>{e.isMesh&&(e.castShadow=!0,e.receiveShadow=!0,e.isSkinnedMesh&&(e.frustumCulled=!1))}),e}
function __gilafDecorate(e){let t=__gilaf.props;if(!t)return;__gilaf.track=e;try{let n=e.n,r=new e.group.constructor;r.name=`גילוף`,r.userData.track=e;let i=(t,n,i,a,o,s)=>{let c=e.pose(n,i*a),l=e._groundY(c.position.x,c.position.z);return t.position.set(c.position.x,l,c.position.z),t.rotation.y=Math.atan2(-c.right.x*i,-c.right.z*i)+(s||0),t.scale.setScalar(o),r.add(t),t};t.dog&&__gilaf.loader.loadAsync(__gilaf.src.dog).then(t=>{let n=i(__gilafPrep(t.scene),.006,-1,e.W+10,3.2,0);n.name=`כלבלב גילוף`,__gilaf.dogs.length>24&&(__gilaf.dogs=__gilaf.dogs.filter(__gilafLive)),__gilaf.dogs.push({root:n,clip:t.animations[0],bind:null})}).catch(e=>console.warn(`gilaf dog`,e));let a=1234567,o=()=>(a=a*16807%2147483647)/2147483647,s=0;for(let r=.05;r<.95;r+=.055){let a=s%2?1:-1;s++;let c=Math.round(r*n)%n;if(e.covered&&e.covered[c]||e.inGap(c,a))continue;let l=s%3==0?`crystals`:`mushroom`,u=t[l];if(!u)continue;let d=l===`mushroom`;i(__gilafPrep(u.scene.clone()),r,a,e.W+14+o()*6,d?4.4+o()*1.4:3.2+o()*1,o()*6.28)}e.group.add(r),!__gilaf.sys&&e.engine&&(__gilaf.sys=!0,e.engine.addSystem({update:()=>__gilafAnimate(e.engine.time.elapsed)}))}catch(e){console.warn(`gilaf decorate failed`,e)}}
function __gilafLive(e){let t=e.root;for(;t.parent;)t=t.parent;return!!t.isScene}
function __gilafAnimate(e){for(let t of __gilaf.dogs){let n=t.clip;if(!n||!__gilafLive(t))continue;t.bind||(t.bind=n.tracks.map(e=>{let n=e.name.lastIndexOf(`.`);return{tr:e,node:t.root.getObjectByName(e.name.slice(0,n)),prop:e.name.slice(n+1)}}).filter(e=>e.node),__gilaf.q=__gilaf.q||t.root.quaternion.clone());let r=e%n.duration;for(let e of t.bind){let t=e.tr.times,n=e.tr.values,i=n.length/t.length,a=0;for(;a<t.length-2&&t[a+1]<=r;)a++;let o=Math.min(1,Math.max(0,(r-t[a])/(t[a+1]-t[a]||1)));if(e.prop===`quaternion`)e.node.quaternion.fromArray(n,a*4),__gilaf.q.fromArray(n,(a+1)*4),e.node.quaternion.slerp(__gilaf.q,o);else{let t=e.node[e.prop];t.set(n[a*i]+(n[(a+1)*i]-n[a*i])*o,n[a*i+1]+(n[(a+1)*i+1]-n[a*i+1])*o,n[a*i+2]+(n[(a+1)*i+2]-n[a*i+2])*o)}}}}
'''
dog_obj = '{' + ','.join(f'{k}:`{v}`' for k, v in props.items()) + '}'
inject = inject.replace('{DOG}', dog_obj)
s = sub(s, 'async function uk(){let e=new FD().setMeshoptDecoder(FO),', inject + 'async function uk(){let e=new FD().setMeshoptDecoder(FO),')
s = sub(s, 'await Promise.all(t)}function dk(e){', 'await Promise.all(t),await __gilafLoad(e)}function dk(e){')

# 4. decorate every race track after it is built
s = sub(s, 'this._tyres(e),this._lights(e),this.group}', 'this._tyres(e),this._lights(e),__gilafDecorate(this),this.group}')

# 5. its own name, so it is easy to tell apart from the main game
s = sub(s, '<title>שימוטרון ראלי</title>', '<title>שימוטרון ראלי (גילוף)</title>')
open(out_path, 'w', encoding='utf-8').write(s)
print('bytes', len(s.encode('utf-8')), 'added', len(s.encode('utf-8')) - len(src.encode('utf-8')))
