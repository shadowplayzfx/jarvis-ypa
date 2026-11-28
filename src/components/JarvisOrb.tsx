import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { JARVIS_THEMES } from '../lib/jarvisThemes';
import type { AssistantState, JarvisColorTheme } from '../types/jarvis';

interface JarvisOrbProps {
  state: AssistantState;
  colorTheme?: JarvisColorTheme;
  audioLevelRef: MutableRefObject<number>;
  speechPulseRef: MutableRefObject<number>;
  onOrbClick: () => void;
}

const NOISE_FUNCTIONS = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 3; i++) {
      total += snoise(p * frequency) * amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return total;
  }
`;

interface WebGLProbe {
  available: boolean;
  isSoftware: boolean;
}

function probeWebGL(): WebGLProbe {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl || gl.isContextLost()) {
      return { available: false, isSoftware: true };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (/Disabled/i.test(gpu)) {
      return { available: false, isSoftware: true };
    }
    const isSoftware = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return { available: true, isSoftware };
  } catch {
    return { available: false, isSoftware: true };
  }
}

function mountCanvas2DFallback(
  container: HTMLDivElement,
  stateRef: MutableRefObject<AssistantState>,
  colorThemeRef: MutableRefObject<JarvisColorTheme>,
  audioLevelRef: MutableRefObject<number>,
  speechPulseRef: MutableRefObject<number>,
  prefersReducedMotion: boolean
): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const resize = () => {
    const w = Math.max(200, container.clientWidth || 300);
    const h = Math.max(200, container.clientHeight || 300);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const motes = Array.from({ length: 48 }, (_, idx) => ({
    angle: (idx / 48) * Math.PI * 2,
    radiusFrac: 0.16 + ((idx * 37) % 68) / 100,
    speed: 0.25 + ((idx * 19) % 40) / 100,
    size: 1.1 + ((idx * 13) % 18) / 10,
    phase: idx * 0.73,
  }));

  const deepColor = new THREE.Color();
  const midColor = new THREE.Color();
  const brightColor = new THREE.Color();
  const rimColor = new THREE.Color();
  const initOrb = JARVIS_THEMES[colorThemeRef.current].orb;
  deepColor.copy(initOrb.plasmaDeep);
  midColor.copy(initOrb.plasmaMid);
  brightColor.copy(initOrb.plasmaBright);
  rimColor.copy(initOrb.shellFront);

  let rafId = 0;
  let disposed = false;
  let lastNow = performance.now();
  let plasmaTime = 0;
  let smoothedEnergy = 0;

  const toRgba = (c: THREE.Color, a: number) =>
    `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a.toFixed(3)})`;

  const renderFrame = () => {
    if (disposed || !ctx) return;

    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;

    const s = stateRef.current;
    let targetEnergy = 0.05;
    if (s === 'listening') {
      targetEnergy = Math.min(1, audioLevelRef.current * 1.45 + 0.22);
    } else if (s === 'speaking') {
      speechPulseRef.current = Math.max(0, speechPulseRef.current - dt * 2.4);
      targetEnergy = Math.min(
        1,
        0.36 +
          0.22 * Math.sin(now * 0.011) +
          0.12 * Math.sin(now * 0.021) +
          speechPulseRef.current * 0.48
      );
    } else if (s === 'thinking') {
      targetEnergy = 0.34 + 0.1 * Math.sin(now * 0.005);
    }

    const damping = 1 - Math.exp(-(targetEnergy > smoothedEnergy ? 14 : 6) * dt);
    smoothedEnergy += (targetEnergy - smoothedEnergy) * damping;

    const motionFactor = prefersReducedMotion ? 0.2 : 1;
    plasmaTime += dt * (1.2 + smoothedEnergy * 2.1) * motionFactor;

    const targetColors = JARVIS_THEMES[colorThemeRef.current].orb;
    const colorDamping = 1 - Math.exp(-7 * dt);
    deepColor.lerp(targetColors.plasmaDeep, colorDamping);
    midColor.lerp(targetColors.plasmaMid, colorDamping);
    brightColor.lerp(targetColors.plasmaBright, colorDamping);
    rimColor.lerp(targetColors.shellFront, colorDamping);

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scalePulse = 1 + smoothedEnergy * 0.075 + Math.sin(plasmaTime * 0.7) * 0.014;
    const radius = Math.min(w, h) * 0.34 * scalePulse;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Deep core gradient
    const baseGrad = ctx.createRadialGradient(
      cx - radius * 0.18,
      cy - radius * 0.2,
      radius * 0.08,
      cx,
      cy,
      radius
    );
    baseGrad.addColorStop(0, toRgba(brightColor, 0.92));
    baseGrad.addColorStop(0.45, toRgba(midColor, 0.88));
    baseGrad.addColorStop(0.85, toRgba(deepColor, 0.96));
    baseGrad.addColorStop(1, toRgba(deepColor, 0.98));
    ctx.fillStyle = baseGrad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Organic flowing plasma lobes
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const a = plasmaTime * (0.45 + i * 0.14) + i * 1.57;
      const ox = Math.cos(a) * radius * (0.28 + smoothedEnergy * 0.14);
      const oy = Math.sin(a * 1.18) * radius * (0.26 + smoothedEnergy * 0.14);
      const lobeR = radius * (0.58 + 0.12 * Math.sin(plasmaTime + i));
      const lobe = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, lobeR);
      const lobeCol = i % 2 === 0 ? brightColor : midColor;
      lobe.addColorStop(0, toRgba(lobeCol, 0.45 + smoothedEnergy * 0.25));
      lobe.addColorStop(0.6, toRgba(midColor, 0.18));
      lobe.addColorStop(1, toRgba(midColor, 0));
      ctx.fillStyle = lobe;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, lobeR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Internal glowing motes
    for (const m of motes) {
      const theta = m.angle + plasmaTime * m.speed * 0.45;
      const dist = radius * m.radiusFrac * (0.9 + 0.1 * Math.sin(plasmaTime + m.phase));
      const mx = cx + Math.cos(theta) * dist;
      const my = cy + Math.sin(theta * 1.08 + m.phase * 0.2) * dist;
      const alpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(plasmaTime * 1.6 + m.phase));
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(mx, my, m.size * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fresnel rim highlight
    const rimGrad = ctx.createRadialGradient(cx, cy, radius * 0.72, cx, cy, radius);
    rimGrad.addColorStop(0, toRgba(rimColor, 0));
    rimGrad.addColorStop(0.85, toRgba(rimColor, 0.28 + smoothedEnergy * 0.2));
    rimGrad.addColorStop(1, toRgba(brightColor, 0.65 + smoothedEnergy * 0.25));
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Subtle crisp glass outline
    ctx.strokeStyle = toRgba(brightColor, 0.38 + smoothedEnergy * 0.22);
    ctx.lineWidth = 1.25 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    rafId = requestAnimationFrame(renderFrame);
  };

  rafId = requestAnimationFrame(renderFrame);

  return () => {
    disposed = true;
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    if (canvas.parentNode === container) {
      container.removeChild(canvas);
    }
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function JarvisOrb({
  state,
  colorTheme = 'blue',
  audioLevelRef,
  speechPulseRef,
  onOrbClick,
}: JarvisOrbProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AssistantState>(state);
  const colorThemeRef = useRef<JarvisColorTheme>(colorTheme);
  const [liveSeconds, setLiveSeconds] = useState(0);

  useEffect(() => {
    colorThemeRef.current = colorTheme;
  }, [colorTheme]);

  useEffect(() => {
    stateRef.current = state;
    if (state !== 'listening') {
      setLiveSeconds(0);
      return;
    }
    setLiveSeconds(0);
    const id = window.setInterval(() => {
      setLiveSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const webglProbe = probeWebGL();
    const isSoftwareGl = webglProbe.isSoftware;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!webglProbe.available) {
      return mountCanvas2DFallback(
        container,
        stateRef,
        colorThemeRef,
        audioLevelRef,
        speechPulseRef,
        prefersReducedMotion
      );
    }

    const initialW = Math.max(200, container.clientWidth || 320);
    const initialH = Math.max(200, container.clientHeight || 320);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      renderer = null;
    }

    if (!renderer) {
      return mountCanvas2DFallback(
        container,
        stateRef,
        colorThemeRef,
        audioLevelRef,
        speechPulseRef,
        prefersReducedMotion
      );
    }

    const activeRenderer = renderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, initialW / initialH, 0.1, 100);
    camera.position.z = 3.1;

    activeRenderer.setSize(initialW, initialH);
    activeRenderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    activeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    activeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    activeRenderer.toneMappingExposure = 0.95;
    activeRenderer.setClearColor(0x000000, 0);

    container.appendChild(activeRenderer.domElement);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const initialTheme = JARVIS_THEMES[colorThemeRef.current].orb;
    const pointLight = new THREE.PointLight(initialTheme.light.getHex(), 2.0, 10);
    mainGroup.add(pointLight);

    // Outer Fresnel Glass Shell
    const shellGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const shellVertexShader = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    const shellFragmentShader = `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float fresnel = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
        gl_FragColor = vec4(uColor, fresnel * uOpacity);
      }
    `;

    const shellBackMat = new THREE.ShaderMaterial({
      vertexShader: shellVertexShader,
      fragmentShader: shellFragmentShader,
      uniforms: {
        uColor: { value: initialTheme.shellBack.clone() },
        uOpacity: { value: 0.3 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const shellFrontMat = new THREE.ShaderMaterial({
      vertexShader: shellVertexShader,
      fragmentShader: shellFragmentShader,
      uniforms: {
        uColor: { value: initialTheme.shellFront.clone() },
        uOpacity: { value: 0.41 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      depthWrite: false,
    });

    const shellBackMesh = new THREE.Mesh(shellGeo, shellBackMat);
    const shellFrontMesh = new THREE.Mesh(shellGeo, shellFrontMat);
    mainGroup.add(shellBackMesh);
    mainGroup.add(shellFrontMesh);

    // Inner FBM Simplex-Noise Plasma Sphere
    const plasmaGeo = new THREE.SphereGeometry(0.998, 96, 96);
    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 0.2 },
        uBrightness: { value: 1.31 },
        uThreshold: { value: 0.09 },
        uColorDeep: { value: initialTheme.plasmaDeep.clone() },
        uColorMid: { value: initialTheme.plasmaMid.clone() },
        uColorBright: { value: initialTheme.plasmaBright.clone() },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uScale;
        uniform float uBrightness;
        uniform float uThreshold;
        uniform vec3 uColorDeep;
        uniform vec3 uColorMid;
        uniform vec3 uColorBright;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        ${NOISE_FUNCTIONS}
        void main() {
          vec3 p = vPosition * uScale;
          vec3 q = vec3(
            fbm(p + vec3(0.0, uTime * 0.05, 0.0)),
            fbm(p + vec3(5.2, 1.3, 2.8) + uTime * 0.05),
            fbm(p + vec3(2.2, 8.4, 0.5) - uTime * 0.02)
          );
          float density = fbm(p + 2.0 * q);
          float t = (density + 0.4) * 0.8;
          float alpha = smoothstep(uThreshold, 0.7, t);

          vec3 cWhite = vec3(1.0, 1.0, 1.0);
          vec3 color = mix(uColorDeep, uColorMid, smoothstep(uThreshold, 0.5, t));
          color = mix(color, uColorBright, smoothstep(0.5, 0.8, t));
          color = mix(color, cWhite, smoothstep(0.8, 1.0, t));

          float facing = dot(normalize(vNormal), normalize(vViewPosition));
          float depthFactor = (facing + 1.0) * 0.5;
          float finalAlpha = alpha * (0.02 + 0.98 * depthFactor);
          gl_FragColor = vec4(color * uBrightness, finalAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const plasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
    mainGroup.add(plasmaMesh);

    // 600 Internal Glowing Particles
    const pCount = 600;
    const pPos = new Float32Array(pCount * 3);
    const pSizes = new Float32Array(pCount);
    const sphereRadius = 0.95;

    for (let i = 0; i < pCount; i++) {
      const r = sphereRadius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPos[i * 3 + 2] = r * Math.cos(phi);
      pSizes[i] = Math.random();
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));

    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        uniform float uTime;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.2 + pos.x) * 0.02;
          pos.x += cos(uTime * 0.15 + pos.z) * 0.02;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float baseSize = 8.0 * aSize + 4.0;
          gl_PointSize = baseSize * (1.0 / -mvPosition.z);
          vAlpha = 0.8 + 0.2 * sin(uTime + aSize * 10.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float dist = length(uv);
          if (dist > 0.5) discard;
          float glow = 1.0 - (dist * 2.0);
          glow = pow(glow, 1.8);
          gl_FragColor = vec4(uColor, glow * vAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(pGeo, pMat);
    mainGroup.add(particles);

    if (!isSoftwareGl) {
      activeRenderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(200, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      activeRenderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    let fallbackCleanup: (() => void) | null = null;
    let lastNow = performance.now();
    let plasmaTime = 0;
    let smoothedEnergy = 0;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (disposed || fallbackCleanup) return;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (activeRenderer.domElement.parentNode === container) {
        container.removeChild(activeRenderer.domElement);
      }
      fallbackCleanup = mountCanvas2DFallback(
        container,
        stateRef,
        colorThemeRef,
        audioLevelRef,
        speechPulseRef,
        prefersReducedMotion
      );
    };
    activeRenderer.domElement.addEventListener('webglcontextlost', onContextLost);

    function afterDraw(cb: () => void) {
      const gl = activeRenderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed || fallbackCleanup) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed || fallbackCleanup) return;

      const now = performance.now();
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;

      const s = stateRef.current;
      let targetEnergy = 0.05;

      if (s === 'listening') {
        targetEnergy = Math.min(1, audioLevelRef.current * 1.45 + 0.22);
      } else if (s === 'speaking') {
        speechPulseRef.current = Math.max(0, speechPulseRef.current - dt * 2.4);
        const cadence =
          0.36 +
          0.22 * Math.sin(now * 0.011) +
          0.12 * Math.sin(now * 0.021) +
          speechPulseRef.current * 0.48;
        targetEnergy = Math.min(1, cadence);
      } else if (s === 'thinking') {
        targetEnergy = 0.34 + 0.1 * Math.sin(now * 0.005);
      }

      const damping = 1 - Math.exp(-(targetEnergy > smoothedEnergy ? 14 : 6) * dt);
      smoothedEnergy += (targetEnergy - smoothedEnergy) * damping;

      const motionFactor = prefersReducedMotion ? 0.2 : 1;
      const timeScale = (1.2 + smoothedEnergy * 2.1) * motionFactor;
      plasmaTime += dt * timeScale;

      const targetColors = JARVIS_THEMES[colorThemeRef.current].orb;
      const colorDamping = 1 - Math.exp(-7 * dt);
      pointLight.color.lerp(targetColors.light, colorDamping);
      shellBackMat.uniforms.uColor.value.lerp(targetColors.shellBack, colorDamping);
      shellFrontMat.uniforms.uColor.value.lerp(targetColors.shellFront, colorDamping);
      plasmaMat.uniforms.uColorDeep.value.lerp(targetColors.plasmaDeep, colorDamping);
      plasmaMat.uniforms.uColorMid.value.lerp(targetColors.plasmaMid, colorDamping);
      plasmaMat.uniforms.uColorBright.value.lerp(targetColors.plasmaBright, colorDamping);

      plasmaMat.uniforms.uTime.value = plasmaTime;
      plasmaMat.uniforms.uBrightness.value = 1.31 + smoothedEnergy * 0.55;
      shellFrontMat.uniforms.uOpacity.value = 0.41 + smoothedEnergy * 0.22;
      pMat.uniforms.uTime.value = plasmaTime * 0.9;

      const targetScale = 1 + smoothedEnergy * 0.085 + Math.sin(plasmaTime * 0.7) * 0.014;
      mainGroup.scale.setScalar(targetScale);

      plasmaMesh.rotation.y += dt * (0.08 + smoothedEnergy * 0.25) * motionFactor;
      mainGroup.rotation.x += 0.002 * (1 + smoothedEnergy) * motionFactor;
      mainGroup.rotation.y += 0.005 * (1 + smoothedEnergy * 1.6) * motionFactor;

      activeRenderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      activeRenderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      if (fallbackCleanup) fallbackCleanup();
      shellGeo.dispose();
      shellBackMat.dispose();
      shellFrontMat.dispose();
      plasmaGeo.dispose();
      plasmaMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      activeRenderer.dispose();
      if (activeRenderer.domElement.parentNode === container) {
        container.removeChild(activeRenderer.domElement);
      }
    };
  }, [audioLevelRef, speechPulseRef]);

  const ariaLabel =
    state === 'listening'
      ? 'JARVIS is listening. Click to stop.'
      : state === 'speaking'
      ? 'JARVIS is speaking. Click to interrupt.'
      : state === 'thinking'
      ? 'JARVIS is thinking.'
      : 'Talk to JARVIS.';

  const ui = JARVIS_THEMES[colorTheme].ui;

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      {/* Measured ambient radial depth */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full blur-3xl transition-all duration-700 ${
          state === 'listening'
            ? `h-60 w-60 sm:h-72 sm:w-72 ${ui.orbAmbientListening} scale-105`
            : state === 'speaking'
            ? `h-60 w-60 sm:h-72 sm:w-72 ${ui.orbAmbientSpeaking} scale-105`
            : state === 'thinking'
            ? `h-56 w-56 sm:h-68 sm:w-68 ${ui.orbAmbientThinking} scale-100`
            : `h-52 w-52 sm:h-60 sm:w-60 ${ui.orbAmbientIdle} scale-95`
        }`}
      />

      {/* Signature Voice Stage Halo */}
      <div className="relative flex items-center justify-center">
        {state === 'listening' && (
          <>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-1 rounded-full border ${ui.orbRingRipple} animate-jarvis-ripple`}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-2 rounded-full border-2 border-transparent ${ui.orbRingSpin} animate-jarvis-spin`}
            />
          </>
        )}

        {state === 'thinking' && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-2 rounded-full border border-dashed ${ui.orbRingDrift} animate-jarvis-drift`}
          />
        )}

        {state === 'speaking' && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -inset-1.5 rounded-full border ${ui.orbRingSpeaking} transition-transform duration-300`}
          />
        )}

        <button
          type="button"
          onClick={onOrbClick}
          aria-label={ariaLabel}
          className={`relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 ${ui.focusRing}/75 cursor-pointer transition-transform duration-200 hover:scale-[1.015] active:scale-[0.985]`}
        >
          <div
            ref={mountRef}
            className="h-[220px] w-[220px] sm:h-[275px] sm:w-[275px] lg:h-[300px] lg:w-[300px]"
          />
        </button>
      </div>

      {/* Live Recording Timer Indicator */}
      {state === 'listening' && (
        <div className={`mt-1.5 font-mono text-xs ${ui.timerText} tabular-nums tracking-wide`}>
          live · {formatDuration(liveSeconds)}
        </div>
      )}
    </div>
  );
}
