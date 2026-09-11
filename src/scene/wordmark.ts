import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

// Raw SVG source, inlined at build time — no network request for the geometry.
import wordmarkRaw from "../../_ref/wordmark.svg?raw";

/** Extrude settings tuned to read as a glossy, moderately-thick 3D sign. */
const EXTRUDE_DEPTH = 9;
const BEVEL_THICKNESS = 0.6;
const BEVEL_SIZE = 0.5;
const BEVEL_SEGMENTS = 3;
const CURVE_SEGMENTS = 12;

export interface WordmarkBuild {
  /** The whole "glood.ai" mark, centred at the origin, upright (+Y is up). */
  group: THREE.Group;
  /** World-space bounding box of `group`, already centred at the origin. */
  box: THREE.Box3;
  /** Convenience size vector derived from `box`. */
  size: THREE.Vector3;
}

/**
 * Parses `_ref/wordmark.svg` and extrudes every fill path into a single,
 * centred three.js Group using the given material.
 */
export function buildWordmark(material: THREE.Material): WordmarkBuild {
  const loader = new SVGLoader();
  const svgData = loader.parse(wordmarkRaw);

  // Two kinds of paths in the source file are not real letter fills and
  // must be excluded, or they extrude into solid, letter-obscuring blocks:
  //  1. The rectangle that lives inside <mask>…</mask> — SVGLoader has no
  //     concept of SVG masking, so it happily returns that rectangle as an
  //     ordinary filled path (it's meant to reveal, not to be drawn).
  //  2. The very last <path> in the file, a hairline stroke-outline
  //     duplicate of the ".ai" letters sitting directly on top of the solid
  //     ".ai" fill — extruding it too just adds coincident, z-fighting
  //     geometry with no visual benefit.
  const realPaths = svgData.paths.filter((path) => {
    const node = path.userData?.node as Element | undefined;
    return !node?.closest("mask");
  });
  const paths = realPaths.slice(0, -1);

  const raw = new THREE.Group();

  for (const path of paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: EXTRUDE_DEPTH,
        bevelEnabled: true,
        bevelThickness: BEVEL_THICKNESS,
        bevelSize: BEVEL_SIZE,
        bevelSegments: BEVEL_SEGMENTS,
        curveSegments: CURVE_SEGMENTS,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      raw.add(mesh);
    }
  }

  // SVG space has +Y pointing down; flip vertically so the mark reads
  // upright in three.js's +Y-up world space.
  raw.scale.y = -1;

  const rawBox = new THREE.Box3().setFromObject(raw);
  const center = rawBox.getCenter(new THREE.Vector3());
  raw.position.sub(center);

  const group = new THREE.Group();
  group.add(raw);

  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());

  return { group, box, size };
}
