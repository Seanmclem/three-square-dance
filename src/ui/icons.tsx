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

export const IconPlay = ({ color }: IconProps) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="5,3 17,10 5,17" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round"/>
  </svg>
);

export const TOOL_ICONS: Record<ToolId, React.FC<IconProps>> = {
  select:           IconSelect,
  floor:            IconFloor,
  "poly-floor":     IconPolyFloor,
  wall:             IconWall,
  platform:         IconPlatform,
  "poly-platform":  IconPolyPlatform,
  stair:            IconStair,
  object:           IconObject,
  zone:             IconZone,
};
