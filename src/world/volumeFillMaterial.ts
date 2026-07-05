import * as THREE from "three";
import type { TriggerVolumeVisual } from "@/types";

// A translucent gradient fill for a trigger volume ("warp box"). Alpha is computed from
// local height in the fragment shader and everything is driven by uniforms, so color /
// fade / opacity / animation can change without rebuilding geometry. `sizeY` is the box
// height (world units) — the shader normalizes local Y against it.
export function createVolumeFillMaterial(visual: TriggerVolumeVisual, sizeY: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:      { value: new THREE.Color(visual.color) },
      uOpacity:    { value: visual.opacity },
      uFadeDir:    { value: visual.fadeDir === "down" ? -1 : 1 },
      uFadeHeight: { value: Math.max(0.001, visual.fadeHeight) },
      uSizeY:      { value: sizeY },
      uTime:       { value: 0 },
      uAnimate:    { value: visual.animate ? 1 : 0 },
    },
    vertexShader: `
      uniform float uSizeY;
      varying float vH;
      void main() {
        vH = position.y / uSizeY + 0.5;   // 0 = bottom, 1 = top
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3  uColor;
      uniform float uOpacity;
      uniform float uFadeDir;
      uniform float uFadeHeight;
      uniform float uTime;
      uniform float uAnimate;
      varying float vH;
      void main() {
        float d = uFadeDir > 0.0 ? vH : 1.0 - vH;
        float a = 1.0 - clamp(d / uFadeHeight, 0.0, 1.0);
        a *= uOpacity;
        a *= mix(1.0, 0.65 + 0.35 * sin(uTime * 2.0), uAnimate);
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  });
}
