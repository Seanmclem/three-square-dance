import * as THREE from "three";

/** Render a Three.js Object3D into a 128×128 PNG data URL. */
export function renderModelThumbnail(root: THREE.Object3D): string | null {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  try {
    renderer.setSize(128, 128);
    renderer.setPixelRatio(1);

    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e1e);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10000);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(1, 2, 1.5);
    scene.add(dir);

    const box    = new THREE.Box3().setFromObject(root);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return null;

    const clone = root.clone();
    clone.position.sub(center);
    clone.scale.setScalar(2 / maxDim);
    scene.add(clone);

    const d = 3.5;
    camera.position.set(d, d * 0.7, d);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    renderer.dispose();
  }
}
