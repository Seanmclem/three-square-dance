#!/usr/bin/env python3
"""Author a 'Climb' animation clip and bake it into character.gltf.

Ladder/wall climb cycle, in place (controller supplies vertical motion later):
- character faces +Z (wall on +Z side)
- contralateral limbs: Foot.L with Hand.R (phase 0), Foot.R with Hand.L (phase 0.5)
- legs/arms posed via two-bone IK; feet (separate Root-child bones, baked IK rig)
  keyed to the leg-chain ends so mesh stays connected
- all 28 joints keyed (rest-static 2-key channels like existing clips)
"""
import json, base64, struct, math, sys, os

GLTF = 'public/assets/models/character.gltf'
MANIFEST = 'public/assets/models/manifest.json'

# ---------- tiny vec/quat lib (x,y,z,w) ----------
def v_add(a,b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def v_sub(a,b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def v_scale(a,s): return (a[0]*s, a[1]*s, a[2]*s)
def v_dot(a,b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def v_cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def v_len(a): return math.sqrt(v_dot(a,a))
def v_norm(a):
    l = v_len(a)
    return (a[0]/l, a[1]/l, a[2]/l) if l > 1e-9 else (0.0,1.0,0.0)

def q_mul(a,b):
    ax,ay,az,aw = a; bx,by,bz,bw = b
    return (aw*bx+ax*bw+ay*bz-az*by,
            aw*by-ax*bz+ay*bw+az*bx,
            aw*bz+ax*by-ay*bx+az*bw,
            aw*bw-ax*bx-ay*by-az*bz)
def q_inv(q): return (-q[0],-q[1],-q[2],q[3])
def q_norm(q):
    l = math.sqrt(sum(c*c for c in q))
    return tuple(c/l for c in q)
def q_rot(q, v):
    qv = (v[0],v[1],v[2],0.0)
    r = q_mul(q_mul(q,qv), q_inv(q))
    return (r[0],r[1],r[2])
def q_axis_angle(axis, ang):
    s = math.sin(ang/2); a = v_norm(axis)
    return (a[0]*s, a[1]*s, a[2]*s, math.cos(ang/2))
def q_shortest_arc(f, t):
    f = v_norm(f); t = v_norm(t)
    d = v_dot(f,t)
    if d > 0.999999: return (0.0,0.0,0.0,1.0)
    if d < -0.999999:
        # 180° — pick any perpendicular axis
        ax = v_cross((1,0,0), f)
        if v_len(ax) < 1e-6: ax = v_cross((0,0,1), f)
        return q_axis_angle(ax, math.pi)
    ax = v_cross(f,t)
    q = (ax[0], ax[1], ax[2], 1.0+d)
    return q_norm(q)

# ---------- load (from pristine backup so re-runs don't stack clips) ----------
BACKUP = GLTF + '.pristine'
if not os.path.exists(BACKUP):
    import shutil; shutil.copy2(GLTF, BACKUP)
d = json.load(open(BACKUP))
assert 'Climb' not in [a['name'] for a in d['animations']], "backup already has Climb?!"
buf = bytearray(base64.b64decode(d['buffers'][0]['uri'].split(',',1)[1]))
nodes = d['nodes']
NAME = {n.get('name',''): i for i,n in enumerate(nodes) if i < 29 or n.get('name')=='Root'}
def nid(name): return NAME[name]

PARENT = {}
for i,n in enumerate(nodes):
    for c in n.get('children',[]): PARENT[c] = i

def rest_T(i): return tuple(nodes[i].get('translation',[0,0,0]))
def rest_R(i): return tuple(nodes[i].get('rotation',[0,0,0,1]))

ARMATURE = 33  # CharacterArmature (identity)

def fk(pose):
    """pose: {nodeIdx: (T,R)} local overrides; returns {idx: (worldPos, worldRot)}"""
    world = {ARMATURE: ((0,0,0),(0,0,0,1))}
    def solve(i):
        if i in world: return world[i]
        p = PARENT.get(i, ARMATURE)
        pp, pr = solve(p)
        t, r = pose.get(i, (rest_T(i), rest_R(i)))
        wp = v_add(pp, q_rot(pr, t))
        wr = q_norm(q_mul(pr, r))
        world[i] = (wp, wr)
        return world[i]
    for i in range(len(nodes)):
        if i in PARENT or i == ARMATURE: solve(i)
    # top-level nodes without parents (shouldn't matter) — solve all reachable
    return world

rest_world = fk({})

# ---------- rig measurements ----------
def wpos(w, name): return w[nid(name)][0]

hipL   = wpos(rest_world,'UpperLeg.L'); hipR   = wpos(rest_world,'UpperLeg.R')
kneeL  = wpos(rest_world,'LowerLeg.L')
footL  = wpos(rest_world,'Foot.L');     footR  = wpos(rest_world,'Foot.R')
uarmL  = wpos(rest_world,'UpperArm.L'); uarmR  = wpos(rest_world,'UpperArm.R')
larmL  = wpos(rest_world,'LowerArm.L')
fistL  = wpos(rest_world,'Fist.L')

LEG_L1 = v_len(v_sub(kneeL, hipL))          # upper leg
LEG_L2 = v_len(v_sub(footL, kneeL))         # lower leg → foot bone
ARM_L1 = v_len(v_sub(larmL, uarmL))         # upper arm
ARM_L2 = v_len(v_sub(fistL, larmL))         # forearm → fist joint

print(f"hipL={tuple(round(c,3) for c in hipL)} uarmL={tuple(round(c,3) for c in uarmL)}")
print(f"LEG l1={LEG_L1:.3f} l2={LEG_L2:.3f}  ARM l1={ARM_L1:.3f} l2={ARM_L2:.3f}")
print(f"rest foot L={tuple(round(c,3) for c in footL)}")

# ---------- climb cycle parameters ----------
DUR   = 1.2
KEYS  = 25                      # key i at t = i*DUR/(KEYS-1); last == first (loop)
STANCE = 0.62                   # fraction of cycle in contact (limb slides down)

# Leg style modeled on the rig's own Jump/Jump_Idle fold: heel kicks BACK during the
# swing (foot z→−0.25 like the airborne pose's z=−0.50), toe plants just ahead of the
# body, knees near the hip-foot line pointing slightly forward.
FOOT_X   = footL[0]             # rest-width stance (chunky rig — narrow reads as knee-clipping)
# Foot path must stay on a healthy radius from the hip (y≈0.41): a target that grazes
# the hip joint collapses the IK to its minimum fold and the knee direction flips
# frame-to-frame (the "floppy leg"). Jump_Idle keeps the foot 0.47m from the hip.
FOOT_Z   = 0.16                 # toe plant, ahead of body
FOOT_YHI = 0.28                 # top of step — ≥0.24m from hip
FOOT_YLO = 0.05
FOOT_LIFT= 0.36                 # swing sweeps heel back to z ≈ −0.20 (jump-style, far from hip)

HAND_X   = 0.55                 # wide of the (very large) head so hands never clip it
HAND_Z   = 0.60                 # clear of the face front (head sphere reaches z≈0.55)
_dxz = math.sqrt((HAND_X-abs(uarmL[0]))**2 + (HAND_Z-uarmL[2])**2)
HAND_YHI = min(uarmL[1] + math.sqrt(max((ARM_L1+ARM_L2-0.06)**2 - _dxz**2, 0.01)) - 0.05, 1.78)
HAND_YLO = HAND_YHI - 0.50
HAND_LIFT= 0.12

print(f"hand y range: {HAND_YLO:.2f}..{HAND_YHI:.2f}")

def smooth(u): return u*u*(3-2*u)

def limb_target(phase, x, z_wall, y_lo, y_hi, lift):
    """In-place cycle: stance = slide down (body climbs), swing = reach back up."""
    p = phase % 1.0
    if p < STANCE:
        u = p / STANCE
        y = y_hi - (y_hi - y_lo) * u
        z = z_wall
    else:
        u = (p - STANCE) / (1.0 - STANCE)
        y = y_lo + (y_hi - y_lo) * smooth(u)
        z = z_wall - lift * math.sin(math.pi * u)
    return (x, y, z)

def two_bone_ik(root, target, l1, l2, pole):
    """Returns (mid, clamped_target)."""
    to = v_sub(target, root)
    dist = v_len(to)
    dmin, dmax = abs(l1-l2)+0.01, l1+l2-0.01
    dcl = max(dmin, min(dmax, dist))
    n = v_norm(to)
    target_c = v_add(root, v_scale(n, dcl))
    # pole projection perpendicular to n
    pv = v_sub(pole, root)
    pv = v_sub(pv, v_scale(n, v_dot(pv, n)))
    if v_len(pv) < 1e-6: pv = (0,0,1)
    p_hat = v_norm(pv)
    cos_a = (l1*l1 + dcl*dcl - l2*l2) / (2*l1*dcl)
    cos_a = max(-1.0, min(1.0, cos_a))
    sin_a = math.sqrt(1.0 - cos_a*cos_a)
    mid = v_add(root, v_add(v_scale(n, l1*cos_a), v_scale(p_hat, l1*sin_a)))
    return mid, target_c

def aim_bone(pose, world, node, parent, target_pos):
    """Set node's local rotation so its +Y (bone dir) aims at target_pos.
    Swing-from-rest: preserves rest twist. Updates world dict for node."""
    pw, prw = world[parent]
    lt, lr = rest_T(node), rest_R(node)
    jpos = v_add(pw, q_rot(prw, lt))
    world_if_rest = q_norm(q_mul(prw, lr))
    dir0 = q_rot(world_if_rest, (0,1,0))
    dirw = v_norm(v_sub(target_pos, jpos))
    swing = q_shortest_arc(dir0, dirw)
    wr = q_norm(q_mul(swing, world_if_rest))
    local = q_norm(q_mul(q_inv(prw), wr))
    pose[node] = (lt, local)
    world[node] = (jpos, wr)
    return jpos

# ---------- build keyframes ----------
times = [i * DUR / (KEYS-1) for i in range(KEYS)]
# channels we key densely: {(name, path): [values...]}
dense = {}
def push(name, path, val):
    dense.setdefault((name, path), []).append(val)

DEG = math.pi/180

for ki in range(KEYS):
    t = times[ki] / DUR            # normalized 0..1 (t=1 == t=0 pose: phases wrap)
    pose = {}

    # --- spine dressing ---
    bob   = 0.02 * math.sin(4*math.pi*t)          # two bobs per cycle
    roll  = 4*DEG * math.sin(2*math.pi*t)         # weight shift L/R
    bT = rest_T(nid('Body')); bR = rest_R(nid('Body'))
    body_T = (bT[0], bT[1] + bob, bT[2] - 0.05)   # butt out slightly from wall
    body_R = q_norm(q_mul(q_mul(q_axis_angle((1,0,0),  5*DEG),   # lean toward wall
                                 q_axis_angle((0,0,1), roll)), bR))
    pose[nid('Body')] = (body_T, body_R)
    pose[nid('Torso')] = (rest_T(nid('Torso')),
                          q_norm(q_mul(q_axis_angle((1,0,0), 7*DEG), rest_R(nid('Torso')))))
    pose[nid('Head')]  = (rest_T(nid('Head')),
                          q_norm(q_mul(q_axis_angle((1,0,0), -16*DEG), rest_R(nid('Head')))))

    world = fk(pose)

    # --- legs (phase: L=0, R=0.5) ---
    for side, ph in (('L', 0.0), ('R', 0.5)):
        sx = 1 if side=='L' else -1
        tgt = limb_target(t + ph, sx*abs(FOOT_X), FOOT_Z, FOOT_YLO, FOOT_YHI, FOOT_LIFT)
        hip = v_add(world[nid('Body')][0],
                    q_rot(world[nid('Body')][1], rest_T(nid(f'UpperLeg.{side}'))))
        pole = v_add(hip, (sx*0.15, 0.1, 1.0))                  # knees slightly forward, like the Jump fold
        knee, tgt_c = two_bone_ik(hip, tgt, LEG_L1, LEG_L2, pole)
        aim_bone(pose, world, nid(f'UpperLeg.{side}'), nid('Body'), knee)
        aim_bone(pose, world, nid(f'LowerLeg.{side}'), nid(f'UpperLeg.{side}'), tgt_c)
        # foot bone: child of Root — express target in Root space
        rp, rr = world[nid('Root')]
        foot_local = q_rot(q_inv(rr), v_sub(tgt_c, rp))
        # foot pitch follows the phase: ~flat when planted, toes trailing down mid-swing
        # (matches the Jump fold; a fixed planted pitch folds the foot into the shin)
        p = (t + ph) % 1.0
        swing_u = 0.0 if p < STANCE else (p - STANCE) / (1.0 - STANCE)
        pitch = 20*DEG + 35*DEG * math.sin(math.pi * swing_u)
        foot_R = q_norm(q_mul(q_axis_angle((1,0,0), pitch), rest_R(nid(f'Foot.{side}'))))
        pose[nid(f'Foot.{side}')] = (foot_local, foot_R)
        push(f'Foot.{side}', 'translation', foot_local)
        push(f'Foot.{side}', 'rotation', foot_R)

    # --- arms (contralateral: R hand with L foot) ---
    for side, ph in (('R', 0.0), ('L', 0.5)):
        sx = 1 if side=='L' else -1
        tgt = limb_target(t + ph, sx*abs(HAND_X), HAND_Z, HAND_YLO, HAND_YHI, HAND_LIFT)
        pw, prw = world[nid('Torso')]
        sh_pos = v_add(pw, q_rot(prw, rest_T(nid(f'Shoulder.{side}'))))
        sh_rot = q_norm(q_mul(prw, rest_R(nid(f'Shoulder.{side}'))))
        ua_pos = v_add(sh_pos, q_rot(sh_rot, rest_T(nid(f'UpperArm.{side}'))))
        world[nid(f'Shoulder.{side}')] = (sh_pos, sh_rot)
        pole = v_add(ua_pos, (sx*0.8, -0.6, -0.25))             # elbows out & down, away from wall
        elbow, tgt_c = two_bone_ik(ua_pos, tgt, ARM_L1, ARM_L2, pole)
        aim_bone(pose, world, nid(f'UpperArm.{side}'), nid(f'Shoulder.{side}'), elbow)
        aim_bone(pose, world, nid(f'LowerArm.{side}'), nid(f'UpperArm.{side}'), tgt_c)

    # record dense channels
    push('Body','translation', body_T);  push('Body','rotation', body_R)
    push('Torso','rotation', pose[nid('Torso')][1])
    push('Head','rotation',  pose[nid('Head')][1])
    for nm in ('UpperLeg.L','LowerLeg.L','UpperLeg.R','LowerLeg.R',
               'UpperArm.L','LowerArm.L','UpperArm.R','LowerArm.R'):
        push(nm,'rotation', pose[nid(nm)][1])

# force exact loop
for k, vals in dense.items():
    vals[-1] = vals[0]

# quaternion hemisphere continuity per channel
for (nm, path), vals in dense.items():
    if path != 'rotation': continue
    for i in range(1, len(vals)):
        if sum(a*b for a,b in zip(vals[i], vals[i-1])) < 0:
            vals[i] = tuple(-c for c in vals[i])

# flip diagnostic: largest frame-to-frame rotation step per channel (a twist-branch
# flip shows up as a step of 90°+ between adjacent keys; normal motion is <25°)
print("\nper-channel max adjacent-key rotation step:")
flips = False
for (nm, path), vals in sorted(dense.items()):
    if path != 'rotation': continue
    worst_deg = 0.0
    for i in range(1, len(vals)):
        dot = abs(sum(a*b for a,b in zip(vals[i], vals[i-1])))
        worst_deg = max(worst_deg, 2*math.degrees(math.acos(min(1.0, dot))))
    marker = '  <-- FLIP' if worst_deg > 60 else ''
    if worst_deg > 60: flips = True
    print(f"  {nm:12s} {worst_deg:6.1f}°{marker}")
assert not flips, "twist flip still present — reduce swing amplitude or fix pole"

# ---------- verify: leg chain end == foot bone position ----------
worst = 0.0
for ki in (0, 6, 12, 18):
    # rebuild pose dict for this key from dense data and FK it
    pose = {}
    def val(nm, path): return dense[(nm,path)][ki]
    pose[nid('Body')] = (val('Body','translation'), val('Body','rotation'))
    pose[nid('Torso')] = (rest_T(nid('Torso')), val('Torso','rotation'))
    for nm in ('UpperLeg.L','LowerLeg.L','UpperLeg.R','LowerLeg.R'):
        pose[nid(nm)] = (rest_T(nid(nm)), val(nm,'rotation'))
    for s in ('L','R'):
        pose[nid(f'Foot.{s}')] = (val(f'Foot.{s}','translation'), val(f'Foot.{s}','rotation'))
    w = fk(pose)
    for s in ('L','R'):
        knee_w = w[nid(f'LowerLeg.{s}')]
        # leg end = knee joint + l2 along lower leg dir
        end = v_add(knee_w[0], v_scale(q_rot(knee_w[1], (0,1,0)), LEG_L2))
        gap = v_len(v_sub(end, w[nid(f'Foot.{s}')][0]))
        worst = max(worst, gap)
print(f"max leg-end↔foot gap across sampled keys: {worst:.4f} m")
assert worst < 0.03, "leg chain does not meet foot bone — IK bug"

# ---------- bake into glTF ----------
JOINTS = [i for i in range(29)]     # nodes 0..28 are the joints
def align4(b):
    while len(b) % 4: b.append(0)

blob = bytearray()
new_bvs, new_accs = [], []
BV0, AC0 = len(d['bufferViews']), len(d['accessors'])
BUF_BASE = len(buf)

def add_accessor(vals, ctype, atype):
    """vals: list of tuples (or floats). Returns accessor index."""
    global blob
    align4(blob)
    off = BUF_BASE + len(blob)
    flat = []
    for v in vals:
        flat.extend(v if isinstance(v, (tuple,list)) else (v,))
    blob.extend(struct.pack(f'<{len(flat)}f', *flat))
    n = {'SCALAR':1,'VEC3':3,'VEC4':4}[atype]
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(flat)*4}
    new_bvs.append(bv)
    acc = {'bufferView': BV0 + len(new_bvs) - 1, 'componentType': 5126,
           'count': len(vals), 'type': atype}
    cols = list(zip(*[ (v if isinstance(v,(tuple,list)) else (v,)) for v in vals ]))
    acc['min'] = [min(c) for c in cols]
    acc['max'] = [max(c) for c in cols]
    new_accs.append(acc)
    return AC0 + len(new_accs) - 1

time_dense  = add_accessor([ (t,) for t in times ], 5126, 'SCALAR')
time_static = add_accessor([ (0.0,), (DUR,) ], 5126, 'SCALAR')

samplers, channels = [], []
def add_channel(node_idx, path, input_acc, out_vals, atype):
    out_acc = add_accessor(out_vals, 5126, atype)
    samplers.append({'input': input_acc, 'interpolation': 'LINEAR', 'output': out_acc})
    channels.append({'sampler': len(samplers)-1,
                     'target': {'node': node_idx, 'path': path}})

for i in JOINTS:
    nm = nodes[i].get('name','')
    for path, atype, restv in (('translation','VEC3',rest_T(i)), ('rotation','VEC4',rest_R(i))):
        key = (nm, path)
        if key in dense:
            add_channel(i, path, time_dense, dense[key], atype)
        else:
            add_channel(i, path, time_static, [restv, restv], atype)

d['animations'].append({'name': 'Climb', 'channels': channels, 'samplers': samplers})
buf.extend(blob)
d['buffers'][0]['byteLength'] = len(buf)
d['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(bytes(buf)).decode()
d['bufferViews'].extend(new_bvs)
d['accessors'].extend(new_accs)

json.dump(d, open(GLTF,'w'), separators=(',',':'))
print(f"wrote {GLTF}: animations={[a['name'] for a in d['animations']]}")
print(f"channels={len(channels)} newAccessors={len(new_accs)} bufferLen={len(buf)}")

# manifest
m = json.load(open(MANIFEST))
for e in m['assets']:
    if e['id'] == 'character' and 'Climb' not in e.get('animations',[]):
        e['animations'].append('Climb')
json.dump(m, open(MANIFEST,'w'), indent=2)
print("manifest updated")
