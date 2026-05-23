import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

const _eval = new Evaluator();
_eval.useGroups = false;

export function csgSubtract(base: THREE.Mesh, cutter: THREE.Mesh): THREE.Mesh {
  const brushA = new Brush(base.geometry);
  brushA.position.copy(base.position);
  brushA.quaternion.copy(base.quaternion);
  brushA.scale.copy(base.scale);
  brushA.updateMatrixWorld();

  const brushB = new Brush(cutter.geometry);
  brushB.position.copy(cutter.position);
  brushB.quaternion.copy(cutter.quaternion);
  brushB.scale.copy(cutter.scale);
  brushB.updateMatrixWorld();

  return _eval.evaluate(brushA, brushB, SUBTRACTION);
}
