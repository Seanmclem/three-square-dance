import type { ToolId } from "@/types";

export interface IconProps { color: string }

export const IconSelect = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="6,4 6,22 10,17 13,24 16,23 13,16 19,16"
      stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);

export const IconFloor = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="5" y="8" width="18" height="12" rx="1.5" stroke={color} strokeWidth="1.5"/>
    <line x1="5" y1="14" x2="23" y2="14" stroke={color} strokeWidth="0.75" strokeDasharray="2.5,2"/>
    <line x1="14" y1="8" x2="14" y2="20" stroke={color} strokeWidth="0.75" strokeDasharray="2.5,2"/>
  </svg>
);

export const IconWall = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="6"  y="6" width="6" height="16" rx="1" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.12"/>
    <rect x="16" y="6" width="6" height="16" rx="1" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.12"/>
    <rect x="5"  y="4" width="18" height="3.5" rx="1" fill={color} fillOpacity="0.45"/>
  </svg>
);

export const IconPlatform = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,5 23,10 14,15 5,10"  stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.1"/>
    <polygon points="5,10 14,15 14,21 5,16"  stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.2"/>
    <polygon points="23,10 14,15 14,21 23,16" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.07"/>
  </svg>
);

export const IconStair = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polyline points="5,22 5,18 9,18 9,14 13,14 13,10 17,10 17,6 23,6"
      stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);

export const IconLadder = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <line x1="10" y1="4" x2="10" y2="24" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="18" y1="4" x2="18" y2="24" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="10" y1="8"  x2="18" y2="8"  stroke={color} strokeWidth="1.6"/>
    <line x1="10" y1="13" x2="18" y2="13" stroke={color} strokeWidth="1.6"/>
    <line x1="10" y1="18" x2="18" y2="18" stroke={color} strokeWidth="1.6"/>
  </svg>
);

export const IconObject = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="7"    y="13" width="14"  height="3"  rx="0.5" fill={color} fillOpacity="0.8" stroke={color} strokeWidth="0.5"/>
    <rect x="7"    y="6"  width="3"   height="9"  rx="0.5" fill={color} fillOpacity="0.8" stroke={color} strokeWidth="0.5"/>
    <rect x="8"    y="16" width="2.5" height="6"  rx="0.5" fill={color} fillOpacity="0.6"/>
    <rect x="17.5" y="16" width="2.5" height="6"  rx="0.5" fill={color} fillOpacity="0.6"/>
  </svg>
);

export const IconZone = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <rect x="4" y="6" width="20" height="16" rx="2" stroke={color} strokeWidth="1.5" strokeDasharray="3.5,2.5"/>
    <circle cx="4"  cy="6"  r="2" fill={color}/>
    <circle cx="24" cy="6"  r="2" fill={color}/>
    <circle cx="4"  cy="22" r="2" fill={color}/>
    <circle cx="24" cy="22" r="2" fill={color}/>
  </svg>
);

export const IconPolyFloor = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,4 24,10 22,20 8,22 4,12"
      stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.12"/>
    <circle cx="14" cy="4"  r="2" fill={color} fillOpacity="0.9"/>
    <circle cx="24" cy="10" r="2" fill={color} fillOpacity="0.9"/>
    <circle cx="22" cy="20" r="2" fill={color} fillOpacity="0.9"/>
    <circle cx="8"  cy="22" r="2" fill={color} fillOpacity="0.9"/>
    <circle cx="4"  cy="12" r="2" fill={color} fillOpacity="0.9"/>
  </svg>
);

export const IconPolyPlatform = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,3 23,9 21,18 7,20 3,11"
      stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.12"/>
    <line x1="3"  y1="11" x2="3"  y2="15" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
    <line x1="7"  y1="20" x2="7"  y2="24" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.55"/>
    <line x1="3"  y1="15" x2="7"  y2="24" stroke={color} strokeWidth="1"   strokeLinecap="round" opacity="0.4"/>
    <circle cx="14" cy="3"  r="1.7" fill={color} fillOpacity="0.9"/>
    <circle cx="23" cy="9"  r="1.7" fill={color} fillOpacity="0.9"/>
    <circle cx="21" cy="18" r="1.7" fill={color} fillOpacity="0.9"/>
    <circle cx="7"  cy="20" r="1.7" fill={color} fillOpacity="0.9"/>
    <circle cx="3"  cy="11" r="1.7" fill={color} fillOpacity="0.9"/>
  </svg>
);

export const IconMaterial = ({ color }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
    <rect x="4" y="4" width="9" height="9" rx="1.5" stroke={color} strokeWidth="1.5"/>
    <rect x="15" y="4" width="9" height="9" rx="1.5" stroke={color} strokeWidth="1.5"/>
    <rect x="4" y="15" width="9" height="9" rx="1.5" stroke={color} strokeWidth="1.5"/>
    <rect x="15" y="15" width="9" height="9" rx="1.5" fill={color} fillOpacity="0.5" stroke={color} strokeWidth="1.5"/>
  </svg>
);

export const IconPlay = ({ color }: IconProps) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="5,3 17,10 5,17" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round"/>
  </svg>
);

export const IconSpawn = ({ color }: IconProps) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <line x1="10" y1="16" x2="10" y2="5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <polygon points="10,3 7,8 13,8" fill={color}/>
    <circle cx="10" cy="17" r="1.8" fill={color} fillOpacity="0.7"/>
  </svg>
);

export const IconTriggerVolume = ({ color }: IconProps) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="5" width="14" height="10" rx="1" stroke={color} strokeWidth="1.5" strokeDasharray="3 2"/>
    <circle cx="10" cy="10" r="2" fill={color} fillOpacity="0.6"/>
  </svg>
);

export const IconDecal = ({ color }: IconProps) => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
    {/* peeling sticker: rounded square with a lifted corner */}
    <path d="M4 5.5 A1.5 1.5 0 0 1 5.5 4 H14.5 A1.5 1.5 0 0 1 16 5.5 V11 L11 16 H5.5 A1.5 1.5 0 0 1 4 14.5 Z"
      stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.12"/>
    <path d="M16 11 L11 16 L11 12.5 A1.5 1.5 0 0 1 12.5 11 Z" fill={color} fillOpacity="0.55"/>
  </svg>
);

export const IconShapeCylinder = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <ellipse cx="14" cy="8" rx="8" ry="3.5" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15"/>
    <path d="M6 8 V20 A8 3.5 0 0 0 22 20 V8" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08"/>
  </svg>
);

export const IconShapeWedge = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="4,21 24,21 24,7" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
    <line x1="4" y1="21" x2="24" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const IconShapeBox = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    {/* tapered block: narrow top face over a wide base */}
    <polygon points="10,7 18,7 22,14 24,21 4,21 6,14" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.12"/>
    <line x1="10" y1="7" x2="6" y2="14" stroke={color} strokeWidth="1"/>
    <line x1="18" y1="7" x2="22" y2="14" stroke={color} strokeWidth="1"/>
    <line x1="6" y1="14" x2="22" y2="14" stroke={color} strokeWidth="1" opacity="0.5"/>
  </svg>
);

export const IconSelectFace = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,5 23,10 14,15 5,10" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill={color} fillOpacity="0.45"/>
    <polygon points="5,10 14,15 14,21 5,16" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <polygon points="23,10 14,15 14,21 23,16" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
  </svg>
);

export const IconSelectVertex = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,5 23,10 14,15 5,10" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <polygon points="5,10 14,15 14,21 5,16" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <polygon points="23,10 14,15 14,21 23,16" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <circle cx="14" cy="5" r="2.4" fill={color}/>
    <circle cx="23" cy="10" r="2.4" fill={color}/>
    <circle cx="5" cy="10" r="2.4" fill={color}/>
    <circle cx="14" cy="15" r="2.4" fill={color}/>
  </svg>
);

export const IconSelectEdge = ({ color }: IconProps) => (
  <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
    <polygon points="14,5 23,10 14,15 5,10" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <polygon points="5,10 14,15 14,21 5,16" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <polygon points="23,10 14,15 14,21 23,16" stroke={color} strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
    <line x1="14" y1="15" x2="14" y2="21" stroke={color} strokeWidth="2.6" strokeLinecap="round"/>
  </svg>
);

export const TOOL_ICONS: Record<ToolId, React.FC<IconProps>> = {
  select:           IconSelect,
  "select-face":    IconSelectFace,
  "select-vertex":  IconSelectVertex,
  "select-edge":    IconSelectEdge,
  floor:            IconFloor,
  "poly-floor":     IconPolyFloor,
  wall:             IconWall,
  platform:         IconPlatform,
  "poly-platform":  IconPolyPlatform,
  stair:            IconStair,
  ladder:           IconLadder,
  object:           IconObject,
  zone:             IconZone,
  spawnpoint:       IconSpawn,
  "trigger-volume": IconTriggerVolume,
  decal:            IconDecal,
  "shape-cylinder": IconShapeCylinder,
  "shape-wedge":    IconShapeWedge,
  "shape-box":      IconShapeBox,
};
