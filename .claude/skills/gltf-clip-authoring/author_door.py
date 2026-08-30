#!/usr/bin/env python3
"""Author Door_Open/Door_Close clips into door.gltf and build doorway.gltf.

Run from the repo root. Regenerates from door.gltf.pristine every run so
iteration never stacks clips (pristine is created on first run, deleted by hand
when done). Follows the chest.gltf clip layout: LINEAR samplers, 24fps keys,
2-key static channels, accessors appended to the embedded base64 buffer.
"""
import json, base64, struct, math, os, shutil, sys

ROOT = os.getcwd()
MODELS = os.path.join(ROOT, "public/assets/models")
DOOR = os.path.join(MODELS, "door.gltf")
PRISTINE = DOOR + ".pristine"
DOORWAY = os.path.join(MODELS, "doorway.gltf")
MANIFEST = os.path.join(MODELS, "manifest.json")

# ---------------------------------------------------------------- door clips
if not os.path.exists(PRISTINE):
    shutil.copyfile(DOOR, PRISTINE)
    print("created", PRISTINE)

d = json.load(open(PRISTINE))
assert not d.get("animations"), "pristine already has animations?"
buf = bytearray(base64.b64decode(d["buffers"][0]["uri"].split(",", 1)[1]))

DOOR_NODE = next(i for i, n in enumerate(d["nodes"]) if n["name"] == "Door")
DOOR_T = d["nodes"][DOOR_NODE]["translation"]

def yquat(deg):
    h = math.radians(deg) / 2.0
    return (0.0, math.sin(h), 0.0, math.cos(h))

def smoothstep(s):
    return s * s * (3 - 2 * s)

FPS = 24.0
OPEN_ANGLE = -100.0   # negative Y = swings inward (away from the +Z front)

# Door_Open: ease to -104 deg with slight overshoot, settle at -100. 19 keys, 0.75s.
open_keys = []
for k in range(19):
    t = k / FPS
    if k <= 14:
        theta = -104.0 * smoothstep(k / 14.0)
    else:
        theta = -104.0 + 4.0 * smoothstep((k - 14) / 4.0)
    open_keys.append((t, theta))
open_keys[-1] = (open_keys[-1][0], OPEN_ANGLE)

# Door_Close: gravity-swing shut (ease-in), slam at t=16/24, small rebound, settle. 22 keys.
close_angles = {17: -4.0, 18: -7.0, 19: -5.0, 20: -1.5, 21: 0.0}
close_keys = []
for k in range(22):
    t = k / FPS
    if k <= 16:
        s = k / 16.0
        theta = OPEN_ANGLE * (1.0 - s ** 1.8)
    else:
        theta = close_angles[k]
    close_keys.append((t, theta))

# flip diagnostic: max adjacent-key rotation step
for name, keys in (("Door_Open", open_keys), ("Door_Close", close_keys)):
    worst = max(abs(b[1] - a[1]) for a, b in zip(keys, keys[1:]))
    print(f"{name}: {len(keys)} keys, {keys[-1][0]:.3f}s, max step {worst:.1f} deg")
    assert worst < 60.0, "adjacent-key step too large"

def append_accessor(gltf, data, ctype, atype, fmt, minmax=False):
    global buf
    while len(buf) % 4:
        buf += b"\x00"
    off = len(buf)
    flat = [c for v in data for c in (v if isinstance(v, tuple) else (v,))]
    buf += struct.pack("<%d%s" % (len(flat), fmt), *flat)
    gltf["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(buf) - off})
    acc = {"bufferView": len(gltf["bufferViews"]) - 1, "componentType": ctype,
           "count": len(data), "type": atype}
    if minmax:
        acc["min"] = [min(v if isinstance(v, tuple) else (v,))[0] if False else min(flat)]
        acc["max"] = [max(flat)]
    gltf["accessors"].append(acc)
    return len(gltf["accessors"]) - 1

def build_anim(name, keys):
    times = [t for t, _ in keys]
    quats = [yquat(a) for _, a in keys]
    # hemisphere continuity
    for i in range(1, len(quats)):
        if sum(a * b for a, b in zip(quats[i - 1], quats[i])) < 0:
            quats[i] = tuple(-c for c in quats[i])
    ti = append_accessor(d, times, 5126, "SCALAR", "f", minmax=True)
    ri = append_accessor(d, quats, 5126, "VEC4", "f")
    sti = append_accessor(d, [times[0], times[-1]], 5126, "SCALAR", "f", minmax=True)
    tri = append_accessor(d, [tuple(DOOR_T)] * 2, 5126, "VEC3", "f")
    return {
        "name": name,
        "channels": [
            {"sampler": 0, "target": {"node": DOOR_NODE, "path": "translation"}},
            {"sampler": 1, "target": {"node": DOOR_NODE, "path": "rotation"}},
        ],
        "samplers": [
            {"input": sti, "interpolation": "LINEAR", "output": tri},
            {"input": ti, "interpolation": "LINEAR", "output": ri},
        ],
    }

d["animations"] = [build_anim("Door_Close", close_keys), build_anim("Door_Open", open_keys)]
d["buffers"][0] = {
    "byteLength": len(buf),
    "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(buf)).decode(),
}
json.dump(d, open(DOOR, "w"), separators=(",", ":"))
print("wrote", DOOR, f"({os.path.getsize(DOOR)} bytes)")

# ---------------------------------------------------------------- doorway.gltf
src = json.load(open(PRISTINE))
sbuf = base64.b64decode(src["buffers"][0]["uri"].split(",", 1)[1])

def read_bytes(gltf, acc_idx):
    acc = gltf["accessors"][acc_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    comp_size = {5126: 4, 5123: 2, 5125: 4}[acc["componentType"]]
    ncomp = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[acc["type"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    n = acc["count"] * ncomp * comp_size
    return sbuf[off:off + n], acc

frame_mesh = next(m for m in src["meshes"] if m["name"] == "Cube.014")
fp = frame_mesh["primitives"][0]
frame_mat = src["materials"][fp["material"]]

out_buf = bytearray()
out = {
    "asset": {"generator": "three-world-builder (doorway variant of Quaternius door.gltf)", "version": "2.0"},
    "scene": 0,
    "scenes": [{"name": "Scene", "nodes": [0, 1]}],
    "nodes": [
        {"mesh": 0, "name": "Door_Frame"},
        {"mesh": 1, "name": "Doorway_Void"},
    ],
    "meshes": [
        {"name": "Door_Frame", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]},
        {"name": "Doorway_Void", "primitives": [{"attributes": {"POSITION": 3, "NORMAL": 4}, "indices": 5, "material": 1}]},
    ],
    "materials": [
        dict(frame_mat),
        {"name": "Void", "doubleSided": True,
         "pbrMetallicRoughness": {"baseColorFactor": [0, 0, 0, 1], "metallicFactor": 0, "roughnessFactor": 1},
         "extensions": {"KHR_materials_unlit": {}}},
    ],
    "extensionsUsed": ["KHR_materials_unlit"],
    "accessors": [],
    "bufferViews": [],
    "buffers": [],
}

def emit(raw, acc_template):
    global out_buf
    while len(out_buf) % 4:
        out_buf += b"\x00"
    off = len(out_buf)
    out_buf += raw
    out["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(raw)})
    acc = dict(acc_template)
    acc.pop("byteOffset", None)
    acc["bufferView"] = len(out["bufferViews"]) - 1
    out["accessors"].append(acc)

for idx in (fp["attributes"]["POSITION"], fp["attributes"]["NORMAL"], fp["indices"]):
    raw, acc = read_bytes(src, idx)
    emit(raw, acc)

# void panel: arch-shaped polygon following the frame's inner rim, scaled
# outward so its edges stay buried in the solid frame (a plain rectangle poked
# past the OUTER arch curve at the top corners)
raw, acc = read_bytes(src, fp["attributes"]["POSITION"])
fverts = [struct.unpack_from("<3f", raw, i * 12) for i in range(acc["count"])]
SPRING, CX = 2.66, 0.0        # arch springs at y~2.658 (measured)
front = [v for v in fverts if v[2] > 0.45]
rim = sorted({(round(v[0], 4), round(v[1], 4)) for v in front
              if v[1] > 2.7 and math.hypot(v[0] - CX, v[1] - SPRING) < 1.35})
rim.sort(key=lambda p: math.atan2(p[1] - SPRING, p[0] - CX))  # right (0) -> left (pi)
K = 1.16
arch = [(CX + K * (x - CX), SPRING + K * (y - SPRING)) for x, y in rim]
X, Y0, Z = 1.45, 0.01, 0.10
outline = [(-X, Y0), (X, Y0), (X, SPRING)] + arch + [(-X, SPRING)]
verts2d = [(0.0, 1.3)] + outline          # fan center + convex outline
pos = [(x, y, Z) for x, y in verts2d]
idx = []
for i in range(len(outline)):
    j = 1 + (i + 1) % len(outline)
    idx += [0, 1 + i, j]
emit(struct.pack("<%df" % (len(pos) * 3), *[c for v in pos for c in v]),
     {"componentType": 5126, "count": len(pos), "type": "VEC3",
      "min": [min(p[i] for p in pos) for i in range(3)],
      "max": [max(p[i] for p in pos) for i in range(3)]})
emit(struct.pack("<%df" % (len(pos) * 3), *[c for _ in pos for c in (0.0, 0.0, 1.0)]),
     {"componentType": 5126, "count": len(pos), "type": "VEC3"})
emit(struct.pack("<%dH" % len(idx), *idx),
     {"componentType": 5123, "count": len(idx), "type": "SCALAR"})
print("void panel:", len(outline), "outline pts, arch pts:", [(round(x,2), round(y,2)) for x, y in arch])

out["buffers"] = [{
    "byteLength": len(out_buf),
    "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(out_buf)).decode(),
}]
json.dump(out, open(DOORWAY, "w"), separators=(",", ":"))
print("wrote", DOORWAY, f"({os.path.getsize(DOORWAY)} bytes)")

# ---------------------------------------------------------------- manifest
m = json.load(open(MANIFEST))
door_entry = next(e for e in m["assets"] if e.get("id") == "door")
door_entry["animations"] = ["Door_Close", "Door_Open"]
if "animated" not in door_entry["tags"]:
    door_entry["tags"].insert(door_entry["tags"].index("prop") + 1, "animated")
if not any(e.get("id") == "doorway" for e in m["assets"]):
    dw = json.loads(json.dumps(door_entry))  # deep copy of the door entry
    dw.update({"id": "doorway", "label": "Doorway",
               "path": "/assets/models/doorway.gltf",
               "thumbnail": "/assets/models/doorway_thumb.png",
               "colliderType": "mesh", "dateAdded": "2026-08-30"})
    dw.pop("animations"); dw["tags"] = [t for t in dw["tags"] if t != "animated"]
    m["assets"].insert(m["assets"].index(door_entry) + 1, dw)
json.dump(m, open(MANIFEST, "w"), indent=2)
print("manifest updated")
