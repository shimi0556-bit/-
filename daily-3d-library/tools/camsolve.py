"""Solve a camera (position, target, fov) from 2D points in a reference photo whose 3D
positions on the model are known (wheel rims, roof peak, ground contacts...).
  python3 tools/camsolve.py points.json     # {"p3": [[x,y,z],...], "p2": [[px,py],...], "x0": [px,py,pz,tx,ty,tz,fov], "size": [W,H]}
Then: VW=W VH=H node tools/shot.cjs <id> <out> o '{"pos":..,"target":..,"fov":..,"bare":true}'
and   python3 tools/overlay.py PHOTO RENDER OUT.jpg   — the model edges drawn over the photo.
Needs numpy + scipy."""
import numpy as np, json, sys
from scipy.optimize import least_squares
import json as _j, sys as _s
W,H=(_j.load(open(_s.argv[1])).get('size',[1280,960]) if len(_s.argv)>1 else [1280,960])
def project(P, cam):
    pos=np.array(cam[:3]); tgt=np.array(cam[3:6]); fov=cam[6]
    f=(tgt-pos); f/=np.linalg.norm(f); up=np.array([0,1,0.0])
    r=np.cross(f,up); r/=np.linalg.norm(r); u=np.cross(r,f)
    d=P-pos; xc=d@r; yc=d@u; zc=d@f
    t=np.tan(np.radians(fov)/2)
    nx=xc/(zc*t*W/H); ny=yc/(zc*t)
    return np.stack([(nx+1)/2*W,(1-ny)/2*H],-1)
def solve(pts3, pts2, x0):
    P=np.array(pts3,float); Q=np.array(pts2,float)
    res=least_squares(lambda c:(project(P,c)-Q).ravel(), x0)
    return res.x, np.abs(res.fun).reshape(-1,2)
if __name__=='__main__':
    d=json.load(open(sys.argv[1]))
    x,err=solve(d['p3'],d['p2'],d['x0'])
    print(json.dumps({'pos':list(np.round(x[:3],4)),'target':list(np.round(x[3:6],4)),'fov':round(float(x[6]),3)}))
    print('max err px',err.max().round(2),'mean',err.mean().round(2))
