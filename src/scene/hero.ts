import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildWordmark } from "./wordmark";

export interface HeroBrand {
  rank: number;
  name: string;
  slug: string;
  logo: string;
  points: number;
  storeUrl: string;
  color: string;
}

/* ------------------------------------------------------------------------ */
/* Tunables                                                                  */
/* ------------------------------------------------------------------------ */

const TILE_COUNT = 10;
const TILE_WIDTH = 26;
const TILE_HEIGHT = 21;
const TILE_DEPTH = 3.5;
const TILE_RADIUS = 4.2;
const TILE_SEGMENTS = 4;
const FLOAT_AMPLITUDE = 1.5;
const HOVER_LIFT = 6;
const HOVER_SCALE = 0.1;

// The sticker texture is rendered at the tile's own aspect ratio (rather
// than square) so a landscape tile face never stretches the logo.
const CANVAS_W = 1024;
const CANVAS_H = Math.round((CANVAS_W * TILE_HEIGHT) / TILE_WIDTH);
// The cropped logo content fills whichever of these binds first.
const LOGO_MAX_WIDTH_RATIO = 0.84;
const LOGO_MAX_HEIGHT_RATIO = 0.7;
const LOGO_RASTER_WIDTH = 1600;
const LOGO_ALPHA_THRESHOLD = 10;

const MAIN_FOV = 30;
const MAIN_POLAR = 1.3;
const MAIN_AZIMUTH = -0.22;
const STAGE_POLAR = 1.86;
const STAGE_AZIMUTH = 0.55;

// Camera fit: how much of the container's NDC half-extent the composition's
// projected bounding box is allowed to reach (1.0 = touching the edge).
const FILL_FRACTION_DESKTOP = 0.92;
const FILL_FRACTION_MOBILE = 0.94;
const MOBILE_BREAKPOINT = 860;
const STAGE_FILL_FRACTION = 0.8;

// Aims the main camera slightly above the composition's true centre, so the
// composition itself renders a bit lower in the card — clearing room at the
// top edge for the "Your brand here?" annotation without shrinking anything.
const MAIN_VERTICAL_BIAS = 0.04;

/* ------------------------------------------------------------------------ */
/* Small utilities                                                          */
/* ------------------------------------------------------------------------ */

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function supportsWebGL(): boolean {
  try {
    if (typeof WebGLRenderingContext === "undefined") return false;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

function showFallback(container: HTMLElement): void {
  container.innerHTML = "";
  const img = document.createElement("img");
  img.src = "/hero-fallback.png";
  img.alt = "A 3D glood.ai logo surrounded by ten brand sticker tiles";
  img.className = "hero-scene__fallback";
  img.loading = "eager";
  container.appendChild(img);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function createPlaceholderCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const s = CANVAS_H / 410; // scale legacy pixel values tuned at ~512x410

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "#c9d9dd";
  ctx.lineWidth = 8 * s;
  ctx.setLineDash([20 * s, 16 * s]);
  roundRectPath(ctx, 30 * s, 30 * s, CANVAS_W - 60 * s, CANVAS_H - 60 * s, 32 * s);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#84a0a8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${40 * s}px 'Plus Jakarta Sans', sans-serif`;
  wrapText(ctx, "Your brand here?", CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.72, 48 * s);

  return canvas;
}

interface LogoContent {
  /** Large offscreen raster of the source logo, used as the drawImage source. */
  raster: HTMLCanvasElement;
  /** Tight pixel bounding box (in raster space) of the logo's non-transparent content. */
  bbox: { x: number; y: number; w: number; h: number };
}

// Most brand SVGs carry a lot of empty canvas around their actual mark (a
// 200x80 viewBox with a small icon + short text, say). Rasterising at a large
// size and scanning the alpha channel finds the real content box generically
// — no per-brand tuning, and it keeps working for real logos later.
const logoContentCache = new Map<string, Promise<LogoContent | null>>();

function computeLogoContent(logoUrl: string): Promise<LogoContent | null> {
  const cached = logoContentCache.get(logoUrl);
  if (cached) return cached;

  const promise = (async (): Promise<LogoContent | null> => {
    try {
      const img = await loadImage(logoUrl);
      const rasterW = LOGO_RASTER_WIDTH;
      const rasterH = Math.max(1, Math.round((LOGO_RASTER_WIDTH * img.height) / img.width));
      const raster = document.createElement("canvas");
      raster.width = rasterW;
      raster.height = rasterH;
      const rctx = raster.getContext("2d", { willReadFrequently: true });
      if (!rctx) return null;
      rctx.clearRect(0, 0, rasterW, rasterH);
      rctx.drawImage(img, 0, 0, rasterW, rasterH);

      const { data } = rctx.getImageData(0, 0, rasterW, rasterH);
      let minX = rasterW;
      let minY = rasterH;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < rasterH; y++) {
        const rowOffset = y * rasterW;
        for (let x = 0; x < rasterW; x++) {
          const alpha = data[(rowOffset + x) * 4 + 3];
          if (alpha > LOGO_ALPHA_THRESHOLD) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const bbox =
        maxX >= minX && maxY >= minY
          ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
          : { x: 0, y: 0, w: rasterW, h: rasterH }; // fully transparent source: fall back to the whole image

      return { raster, bbox };
    } catch {
      return null;
    }
  })();

  logoContentCache.set(logoUrl, promise);
  return promise;
}

async function createLogoCanvas(logoUrl: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const content = await computeLogoContent(logoUrl);
  if (content) {
    const { raster, bbox } = content;
    // Fit the cropped content into whichever of the two caps binds first,
    // so every logo reads as large as the tile can hold.
    const maxW = CANVAS_W * LOGO_MAX_WIDTH_RATIO;
    const maxH = CANVAS_H * LOGO_MAX_HEIGHT_RATIO;
    const scale = Math.min(maxW / bbox.w, maxH / bbox.h);
    const w = bbox.w * scale;
    const h = bbox.h * scale;
    ctx.drawImage(raster, bbox.x, bbox.y, bbox.w, bbox.h, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
  } else {
    const s = CANVAS_H / 410;
    ctx.fillStyle = "#c9d9dd";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${100 * s}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText("?", CANVAS_W / 2, CANVAS_H / 2 + 8 * s);
  }

  return canvas;
}

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;
  const corners: THREE.Vector3[] = [];
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
}

/** Largest |NDC.x| or |NDC.y| among the projected corners (1 = at the frame edge). */
function projectedHalfExtent(camera: THREE.PerspectiveCamera, corners: THREE.Vector3[]): number {
  let maxAbs = 0;
  const v = new THREE.Vector3();
  for (const c of corners) {
    v.copy(c).project(camera);
    maxAbs = Math.max(maxAbs, Math.abs(v.x), Math.abs(v.y));
  }
  return maxAbs;
}

/**
 * Positions `camera` along `direction` from `center` so the projected
 * bounding box of `corners` fills exactly `fillFraction` of the viewport's
 * half-extent — i.e. the composition's on-screen box, not a loose bounding
 * sphere. Uses a short bracket-then-bisect search since perspective size
 * isn't invertible in closed form once the box's own depth extent matters.
 */
/**
 * @param verticalBias Fraction of the vertical FOV to re-aim upward after
 * fitting, so the composition sits slightly lower in frame (leaves clear
 * space at the top edge, e.g. for the annotation callout) without changing
 * its size. Returns the point the camera actually ends up looking at, so
 * callers can keep OrbitControls' target in sync.
 */
function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  corners: THREE.Vector3[],
  center: THREE.Vector3,
  direction: THREE.Vector3,
  aspect: number,
  fillFraction: number,
  verticalBias = 0
): THREE.Vector3 {
  camera.aspect = aspect;
  const dir = direction.clone().normalize();

  const apply = (distance: number): number => {
    camera.position.copy(center).add(dir.clone().multiplyScalar(distance));
    camera.near = Math.max(0.1, distance * 0.02);
    camera.far = distance * 4 + 50;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    return projectedHalfExtent(camera, corners);
  };

  let lo = 1;
  let hi = 40;
  let extent = apply(hi);
  let guard = 0;
  while (extent > fillFraction && guard < 30) {
    hi *= 1.6;
    extent = apply(hi);
    guard += 1;
  }
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (apply(mid) > fillFraction) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  apply(hi); // leave the camera at the converged (slightly conservative) distance

  if (verticalBias === 0) return center;

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const distance = camera.position.distanceTo(center);
  const worldShift = distance * Math.tan(verticalBias * vFov);
  const aimPoint = center.clone().add(new THREE.Vector3(0, worldShift, 0));
  camera.lookAt(aimPoint);
  camera.updateMatrixWorld(true);
  return aimPoint;
}

/* ------------------------------------------------------------------------ */
/* Tile state                                                                */
/* ------------------------------------------------------------------------ */

interface TileState {
  mesh: THREE.Mesh;
  frontMaterial: THREE.MeshStandardMaterial;
  brand: HeroBrand | null;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  phase: number;
  period: number;
  rotPhase: number;
  hover: number;
  hoverTarget: number;
}

/* ------------------------------------------------------------------------ */
/* Mount                                                                     */
/* ------------------------------------------------------------------------ */

export function mountHero(container: HTMLElement, brands: HeroBrand[]): void {
  try {
    setup(container, brands);
  } catch (err) {
    console.warn("[hero] falling back to static image:", err);
    showFallback(container);
  }
}

function setup(container: HTMLElement, brands: HeroBrand[]): void {
  if (!supportsWebGL()) {
    showFallback(container);
    return;
  }

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    console.warn("[hero] WebGLRenderer creation failed:", err);
    showFallback(container);
    return;
  }

  const reduced = prefersReducedMotion();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.domElement.className = "hero-scene__canvas";

  // Remove the flat placeholder wordmark; keep the annotation + caption
  // overlays exactly where they are, and drop the live canvas in behind them.
  container.querySelector(".hero-scene__mark")?.remove();
  container.insertBefore(renderer.domElement, container.firstChild);

  const scene = new THREE.Scene();

  /* ---- environment (image-based lighting only, background stays transparent) ---- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  const envTexture = envRT.texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  /* ---- wordmark ---- */
  const letterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    roughness: 0.25,
    metalness: 0,
  });
  const { group: wordmarkGroup, box: wordmarkBox, size: wordmarkSize } = buildWordmark(letterMaterial);
  scene.add(wordmarkGroup);

  /* ---- sticker tiles ---- */
  // A slightly cool grey on the sides/back (vs. pure white on the front and
  // on the letters) reads as a distinct, physical sticker edge rather than
  // blending into the card background.
  const frostMaterial = new THREE.MeshStandardMaterial({ color: 0xe2eaed, roughness: 0.5, metalness: 0 });
  const tileGeometry = new RoundedBoxGeometry(TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH, TILE_SEGMENTS, TILE_RADIUS);

  const rx = 0.57 * wordmarkSize.x;
  const ry = 1.3 * wordmarkSize.y;
  const depthRange = wordmarkSize.z * 1.1 + 4;

  const byRank = new Map(brands.map((b) => [b.rank, b] as const));
  const tileStates: TileState[] = [];
  const textureReady: Promise<void>[] = [];

  for (let rank = 1; rank <= TILE_COUNT; rank++) {
    const brand = byRank.get(rank) ?? null;
    const angle = Math.PI / 2 - (rank - 1) * ((Math.PI * 2) / TILE_COUNT);
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    // Tiles beside the letters (angle near 0/180, i.e. level with the glyphs)
    // are biased behind the wordmark so they tuck in at the edges instead of
    // covering a whole letter; only tiles above/below the letter row (angle
    // near ±90) get real front/back variety, since overlapping a letter's
    // top or bottom silhouette there reads as layered rather than hidden.
    const sideness = Math.abs(Math.cos(angle));
    const behindBias = -sideness * depthRange * 0.85;
    const variety = Math.sin(angle * 2.5 + 0.6) * depthRange * (1 - sideness);
    const z = behindBias + variety;

    const placeholderTexture = new THREE.CanvasTexture(createPlaceholderCanvas());
    placeholderTexture.colorSpace = THREE.SRGBColorSpace;
    // Printed-sticker look: matte (high roughness) with a deliberately low
    // envMapIntensity so the bright environment doesn't wash the logo out,
    // plus an emissiveMap of the same texture so brand colours read at true
    // saturation under the scene's bright tone-mapped exposure.
    const frontMaterial = new THREE.MeshStandardMaterial({
      map: placeholderTexture,
      roughness: 0.7,
      metalness: 0,
      envMap: envTexture,
      envMapIntensity: 0.35,
      emissiveMap: placeholderTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.25,
    });

    const materials = [frostMaterial, frostMaterial, frostMaterial, frostMaterial, frontMaterial, frostMaterial];
    const mesh = new THREE.Mesh(tileGeometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const rotX = -0.18 - Math.cos(angle) * 0.04;
    const rotY = -Math.sin(angle) * 0.32;
    mesh.rotation.set(rotX, rotY, 0);
    mesh.position.set(x, y, z);
    mesh.userData.slug = brand?.slug ?? null;

    scene.add(mesh);

    tileStates.push({
      mesh,
      frontMaterial,
      brand,
      basePosition: new THREE.Vector3(x, y, z),
      baseRotation: new THREE.Euler(rotX, rotY, 0),
      phase: ((rank * 13) % 24) * (Math.PI / 12),
      period: 4 + ((rank * 37) % 20) / 10,
      rotPhase: ((rank * 29) % 24) * (Math.PI / 12),
      hover: 0,
      hoverTarget: 0,
    });

    if (brand) {
      textureReady.push(
        createLogoCanvas(brand.logo).then((canvas) => {
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          frontMaterial.map?.dispose();
          frontMaterial.map = texture;
          frontMaterial.emissiveMap = texture;
          frontMaterial.needsUpdate = true;
        })
      );
    }
  }

  /* ---- composition bounds (drives camera fit) ---- */
  const compositionBox = wordmarkBox.clone();
  const halfX = TILE_WIDTH / 2;
  const halfY = TILE_HEIGHT / 2 + FLOAT_AMPLITUDE;
  const halfZ = TILE_DEPTH / 2 + HOVER_LIFT;
  for (const t of tileStates) {
    const p = t.basePosition;
    compositionBox.expandByPoint(new THREE.Vector3(p.x - halfX, p.y - halfY, p.z - halfZ));
    compositionBox.expandByPoint(new THREE.Vector3(p.x + halfX, p.y + halfY, p.z + halfZ));
  }
  const sphere = new THREE.Sphere();
  compositionBox.getBoundingSphere(sphere);

  /* ---- lights ---- */
  const keyLight = new THREE.DirectionalLight(0xfff2df, 4.8);
  keyLight.position.copy(sphere.center).add(new THREE.Vector3(sphere.radius * 0.7, sphere.radius * 1.6, sphere.radius * 0.7));
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -sphere.radius * 1.5;
  keyLight.shadow.camera.right = sphere.radius * 1.5;
  keyLight.shadow.camera.top = sphere.radius * 1.5;
  keyLight.shadow.camera.bottom = -sphere.radius * 1.5;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = sphere.radius * 6;
  keyLight.shadow.bias = -0.0015;
  keyLight.shadow.radius = 10;
  keyLight.shadow.blurSamples = 16;
  keyLight.target.position.copy(wordmarkBox.getCenter(new THREE.Vector3()));
  scene.add(keyLight, keyLight.target);

  const fillLight = new THREE.DirectionalLight(0xbfe0ff, 0.3);
  fillLight.position.copy(sphere.center).add(new THREE.Vector3(-sphere.radius, sphere.radius * 0.5, -sphere.radius * 0.3));
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
  rimLight.position.copy(sphere.center).add(new THREE.Vector3(0, sphere.radius * 0.3, -sphere.radius * 1.4));
  scene.add(rimLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdce8ec, 0.12);
  scene.add(hemiLight);

  /* ---- shadow-catcher floor: soft, tight, low-opacity, right under the letters ---- */
  const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.1 });
  const floorWidth = wordmarkSize.x * 1.7;
  const floorDepth = wordmarkSize.x * 1.1;
  // ShadowMaterial's built-in shader has no alphaMap support, so a radial
  // fade — guaranteeing the plane's own rectangular edge is never visible,
  // no matter how far the soft VSM shadow spreads — is patched in directly:
  // the local-space distance from the plane's centre fades the shadow's
  // alpha to 0 well before the geometric edge.
  const floorHalfW = floorWidth / 2;
  const floorHalfD = floorDepth / 2;
  floorMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFadePos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFadePos = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace("uniform float opacity;", "uniform float opacity;\nvarying vec2 vFadePos;")
      .replace(
        "gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );",
        `vec2 fadeUv = vFadePos / vec2( ${floorHalfW.toFixed(3)}, ${floorHalfD.toFixed(3)} );
        float fade = 1.0 - smoothstep( 0.5, 1.0, length( fadeUv ) );
        gl_FragColor = vec4( color, opacity * fade * ( 1.0 - getShadowMask() ) );`
      );
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorWidth, floorDepth), floorMaterial);
  floor.rotation.x = -Math.PI / 2 + 0.045;
  floor.rotation.z = 0.015;
  const wordmarkCenter = wordmarkBox.getCenter(new THREE.Vector3());
  floor.position.set(wordmarkCenter.x, wordmarkBox.min.y - 2, wordmarkCenter.z - wordmarkSize.z * 0.08);
  floor.receiveShadow = true;
  scene.add(floor);

  /* ---- camera + controls ---- */
  const compositionCorners = boxCorners(compositionBox);
  const fitCenter = compositionBox.getCenter(new THREE.Vector3());

  const camera = new THREE.PerspectiveCamera(MAIN_FOV, 4 / 3, 1, 2000);
  const mainDirection = new THREE.Vector3().setFromSphericalCoords(1, MAIN_POLAR, MAIN_AZIMUTH);
  const initialAim = fitCameraToBox(
    camera,
    compositionCorners,
    fitCenter,
    mainDirection,
    4 / 3,
    FILL_FRACTION_DESKTOP,
    MAIN_VERTICAL_BIAS
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(initialAim);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 1.25;
  controls.maxPolarAngle = 1.85;
  controls.minAzimuthAngle = MAIN_AZIMUTH - 0.6;
  controls.maxAzimuthAngle = MAIN_AZIMUTH + 0.6;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.6;
  controls.update();

  let resumeTimer: number | undefined;
  controls.addEventListener("start", () => {
    if (reduced) return;
    controls.autoRotate = false;
    if (resumeTimer) window.clearTimeout(resumeTimer);
  });
  controls.addEventListener("end", () => {
    if (reduced) return;
    resumeTimer = window.setTimeout(() => {
      controls.autoRotate = true;
    }, 3000);
  });

  /* ---- resize / fit ---- */
  function applyFit(width: number, aspect: number): void {
    // Measured from the true composition centre (not controls.target, which
    // carries the vertical-bias offset) so repeated resizes can't drift.
    const dir = camera.position.clone().sub(fitCenter);
    const normalized = dir.lengthSq() > 0 ? dir : mainDirection.clone();
    const fillFraction = width <= MOBILE_BREAKPOINT ? FILL_FRACTION_MOBILE : FILL_FRACTION_DESKTOP;
    const aim = fitCameraToBox(camera, compositionCorners, fitCenter, normalized, aspect, fillFraction, MAIN_VERTICAL_BIAS);
    controls.target.copy(aim);
    controls.update();
  }

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    applyFit(w, w / h);
  });
  resizeObserver.observe(container);

  /* ---- hover + tooltip + click-to-scroll ---- */
  const tooltip = document.createElement("div");
  tooltip.className = "hero-tooltip";
  container.appendChild(tooltip);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: TileState | null = null;

  function pickTile(event: PointerEvent): TileState | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(tileStates.map((t) => t.mesh));
    if (!hits.length) return null;
    return tileStates.find((t) => t.mesh === hits[0].object) ?? null;
  }

  function handlePointerMove(event: PointerEvent): void {
    const next = pickTile(event);
    if (next !== hovered) {
      if (hovered) hovered.hoverTarget = 0;
      hovered = next;
      if (hovered) hovered.hoverTarget = 1;
    }
    renderer.domElement.style.cursor = hovered ? "pointer" : "";
  }

  function handlePointerLeave(): void {
    if (hovered) hovered.hoverTarget = 0;
    hovered = null;
    renderer.domElement.style.cursor = "";
  }

  function handleClick(): void {
    if (!hovered?.brand) return;
    const slug = hovered.brand.slug;
    document.getElementById("leaderboard")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const row = document.querySelector<HTMLElement>(`.leaderboard-tile[data-slug="${slug}"]`);
    if (!row) return;
    row.classList.add("is-highlight");
    window.setTimeout(() => row.classList.remove("is-highlight"), 1500);
  }

  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
  renderer.domElement.addEventListener("click", handleClick);

  function updateTooltip(): void {
    if (!hovered?.brand) {
      tooltip.classList.remove("is-visible");
      return;
    }
    const { brand } = hovered;
    tooltip.textContent = `#${brand.rank} · ${brand.name} · ${brand.points.toLocaleString("en-IN")} pts`;
    const worldPos = hovered.mesh.getWorldPosition(new THREE.Vector3());
    worldPos.y += TILE_HEIGHT / 2 + 5;
    worldPos.project(camera);
    const rect = container.getBoundingClientRect();
    const x = (worldPos.x * 0.5 + 0.5) * rect.width;
    const y = (-worldPos.y * 0.5 + 0.5) * rect.height;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.classList.add("is-visible");
  }

  /* ---- visibility gating ---- */
  let isVisible = true;
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0]?.isIntersecting ?? true;
    },
    { threshold: 0.01 }
  );
  intersectionObserver.observe(container);

  /* ---- animation loop ---- */
  const clock = new THREE.Clock();
  const liftDir = new THREE.Vector3();

  function updateTiles(elapsed: number): void {
    for (const t of tileStates) {
      const floatY = reduced ? 0 : Math.sin((elapsed * Math.PI * 2) / t.period + t.phase) * FLOAT_AMPLITUDE;
      t.hover += (t.hoverTarget - t.hover) * 0.12;

      liftDir.copy(camera.position).sub(t.basePosition);
      if (liftDir.lengthSq() > 0) liftDir.normalize();
      const lift = t.hover * HOVER_LIFT;

      t.mesh.position.set(
        t.basePosition.x + liftDir.x * lift,
        t.basePosition.y + floatY + liftDir.y * lift,
        t.basePosition.z + liftDir.z * lift
      );

      const idleWobble = reduced ? 0 : Math.sin(elapsed * 0.6 + t.rotPhase) * 0.035;
      t.mesh.rotation.set(t.baseRotation.x, t.baseRotation.y + idleWobble, t.baseRotation.z);
      t.mesh.scale.setScalar(1 + t.hover * HOVER_SCALE);
    }
  }

  function animate(): void {
    requestAnimationFrame(animate);
    if (!isVisible || document.hidden) return;
    const elapsed = clock.getElapsedTime();
    updateTiles(elapsed);
    controls.update();
    renderer.render(scene, camera);
    updateTooltip();
  }
  animate();

  /* ---- "A Bigger Stage" second view: one extra render, copied to a 2D canvas ---- */
  // Fit to the wordmark alone (not the full tile ring) for a bigger, more
  // dramatic shot: the letters are guaranteed never to crop, while tiles
  // near the edges may — matching the mock's second, closer-in image.
  const stageCamera = new THREE.PerspectiveCamera(MAIN_FOV, 4 / 3, 1, 2000);
  const stageDirection = new THREE.Vector3().setFromSphericalCoords(1, STAGE_POLAR, STAGE_AZIMUTH);
  const wordmarkCorners = boxCorners(wordmarkBox);
  const stageCenter = wordmarkBox.getCenter(new THREE.Vector3());

  function renderStageSnapshot(): void {
    const stageContainer = document.getElementById("stage-scene");
    if (!stageContainer) return;
    const w = stageContainer.clientWidth;
    const h = stageContainer.clientHeight;
    if (w === 0 || h === 0) return;

    let stageCanvas = stageContainer.querySelector<HTMLCanvasElement>(".stage-scene__canvas");
    if (!stageCanvas) {
      stageContainer.querySelector(".stage-scene__mark")?.remove();
      stageCanvas = document.createElement("canvas");
      stageCanvas.className = "stage-scene__canvas";
      stageContainer.insertBefore(stageCanvas, stageContainer.firstChild);
    }

    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevPixelRatio = renderer.getPixelRatio();

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    fitCameraToBox(stageCamera, wordmarkCorners, stageCenter, stageDirection, w / h, STAGE_FILL_FRACTION);
    renderer.render(scene, stageCamera);

    stageCanvas.width = renderer.domElement.width;
    stageCanvas.height = renderer.domElement.height;
    const ctx2d = stageCanvas.getContext("2d");
    ctx2d?.drawImage(renderer.domElement, 0, 0);

    // restore the interactive main view
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = prevSize.x / prevSize.y;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    renderStageSnapshot();
  });
  Promise.all(textureReady).then(renderStageSnapshot);

  let stageResizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    if (stageResizeTimer) window.clearTimeout(stageResizeTimer);
    stageResizeTimer = window.setTimeout(renderStageSnapshot, 250);
  });
}
