#!/usr/bin/env python3
"""FK-sample clips from a GLTF and print leg-joint world positions over time.

Usage: python3 analyze_clip.py <model.gltf> <ClipName> [ClipName...]
Adapt the printed joints at the bottom for the chain you're studying.
"""
import json, base64, struct, math, sys

GLTF = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/models/character.gltf'
CLIPS = sys.argv[2:] or ['Jump', 'Jump_Idle']
d = json.load(open(GLTF))
buf = base64.b64decode(d['buffers'][0]['uri'].split(',',1)[1])
nodes = d['nodes']
CTYPE = {5126:('f',4)}
NCOMP = {'SCALAR':1,'VEC3':3,'VEC4':4}

def read_acc(i):
    a = d['accessors'][i]; bv = d['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset',0)+a.get('byteOffset',0)
    n = NCOMP[a['type']]
    vals = struct.unpack_from(f"<{n*a['count']}f", buf, off)
    return [vals[j*n:(j+1)*n] for j in range(a['count'])]

def q_mul(a,b):
    ax,ay,az,aw=a; bx,by,bz,bw=b
    return (aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz)
def q_rot(q,v):
    r=q_mul(q_mul(q,(v[0],v[1],v[2],0.0)),(-q[0],-q[1],-q[2],q[3])); return (r[0],r[1],r[2])

PARENT={}
for i,n in enumerate(nodes):
    for c in n.get('children',[]): PARENT[c]=i
NAME={n.get('name',''):i for i,n in enumerate(nodes) if i<29}

for clip_name in CLIPS:
    anim = next(a for a in d['animations'] if a['name']==clip_name)
    # sampled channel data: {(node,path): (times, vals)}
    data={}
    for ch in anim['channels']:
        s=anim['samplers'][ch['sampler']]
        data[(ch['target']['node'],ch['target']['path'])]=(read_acc(s['input']),read_acc(s['output']))
    dur=max(t[-1][0] for t,_ in data.values())
    def sample(node,path,t,default):
        if (node,path) not in data: return default
        times,vals=data[(node,path)]
        ts=[x[0] for x in times]
        if t<=ts[0]: return vals[0]
        if t>=ts[-1]: return vals[-1]
        for i in range(1,len(ts)):
            if ts[i]>=t:
                u=(t-ts[i-1])/(ts[i]-ts[i-1])
                a,b=vals[i-1],vals[i]
                v=tuple(a[j]+(b[j]-a[j])*u for j in range(len(a)))
                if len(v)==4:
                    l=math.sqrt(sum(c*c for c in v)); v=tuple(c/l for c in v)
                return v
    def fk_at(t):
        world={33:((0,0,0),(0,0,0,1))}
        def solve(i):
            if i in world: return world[i]
            p=PARENT.get(i,33)
            pp,pr=solve(p)
            lt=sample(i,'translation',t,tuple(nodes[i].get('translation',[0,0,0])))
            lr=sample(i,'rotation',t,tuple(nodes[i].get('rotation',[0,0,0,1])))
            wp=(pp[0]+q_rot(pr,lt)[0], pp[1]+q_rot(pr,lt)[1], pp[2]+q_rot(pr,lt)[2])
            wr=q_mul(pr,lr)
            world[i]=(wp,wr); return world[i]
        for i in range(29): solve(i)
        return world
    print(f"--- {clip_name} (dur {dur:.2f}s) ---")
    print(f"{'t':>5} {'hipL y,z':>16} {'kneeL y,z':>16} {'kneeEnd(L) y,z':>16} {'footL x,y,z':>22} {'body y,z':>14}")
    for f in range(5):
        t=dur*f/4
        w=fk_at(t)
        hip=w[NAME['UpperLeg.L']][0]; knee=w[NAME['LowerLeg.L']][0]
        kw=w[NAME['LowerLeg.L']]
        end=(kw[0][0]+q_rot(kw[1],(0,1,0))[0]*0.295, kw[0][1]+q_rot(kw[1],(0,1,0))[1]*0.295, kw[0][2]+q_rot(kw[1],(0,1,0))[2]*0.295)
        foot=w[NAME['Foot.L']][0]; body=w[NAME['Body']][0]
        print(f"{t:5.2f} ({hip[1]:+.2f},{hip[2]:+.2f})   ({knee[1]:+.2f},{knee[2]:+.2f})   ({end[1]:+.2f},{end[2]:+.2f})   ({foot[0]:+.2f},{foot[1]:+.2f},{foot[2]:+.2f}) ({body[1]:+.2f},{body[2]:+.2f})")
