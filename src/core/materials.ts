export interface MaterialMapConfig {
  enabled: boolean;
  path:    string;
}

export interface MaterialDef {
  id:                string;
  label:             string;
  tileScale:         number;
  roughnessVal:      number;
  metalnessVal:      number;
  displacementScale: number;
  maps: {
    albedo:       MaterialMapConfig;
    normal:       MaterialMapConfig;
    roughness:    MaterialMapConfig;
    metalness:    MaterialMapConfig;
    ao:           MaterialMapConfig;
    displacement: MaterialMapConfig;
  };
}

function buildMaps(id: string, metalness = false): MaterialDef['maps'] {
  const b = `/assets/textures/${id}`;
  return {
    albedo:      { enabled: true,     path: `${b}/albedo.jpg` },
    normal:      { enabled: true,     path: `${b}/normal.jpg` },
    roughness:   { enabled: true,     path: `${b}/roughness.jpg` },
    metalness:   { enabled: metalness,path: `${b}/metalness.jpg` },
    ao:          { enabled: true,     path: `${b}/ao.jpg` },
    displacement:{ enabled: false,    path: `${b}/displacement.jpg` },
  };
}

export const MATERIAL_REGISTRY: Record<string, MaterialDef> = {
  brick_01: {
    id: 'brick_01', label: 'Brick',
    tileScale: 1.0, roughnessVal: 0.9, metalnessVal: 0.0, displacementScale: 0.03,
    maps: buildMaps('brick_01'),
  },
  brick_ext_01: {
    id: 'brick_ext_01', label: 'Brick Exterior',
    tileScale: 1.0, roughnessVal: 0.85, metalnessVal: 0.0, displacementScale: 0.03,
    maps: buildMaps('brick_ext_01'),
  },
  concrete_01: {
    id: 'concrete_01', label: 'Concrete',
    tileScale: 2.0, roughnessVal: 0.85, metalnessVal: 0.0, displacementScale: 0.02,
    maps: buildMaps('concrete_01'),
  },
  cobblestone_01: {
    id: 'cobblestone_01', label: 'Cobblestone',
    tileScale: 0.5, roughnessVal: 0.95, metalnessVal: 0.0, displacementScale: 0.04,
    maps: buildMaps('cobblestone_01'),
  },
  pavingstone_01: {
    id: 'pavingstone_01', label: 'Paving Stone',
    tileScale: 0.6, roughnessVal: 0.9, metalnessVal: 0.0, displacementScale: 0.03,
    maps: buildMaps('pavingstone_01'),
  },
  wood_planks_01: {
    id: 'wood_planks_01', label: 'Wood Planks',
    tileScale: 0.8, roughnessVal: 0.7, metalnessVal: 0.0, displacementScale: 0.01,
    maps: buildMaps('wood_planks_01', true),
  },
};
