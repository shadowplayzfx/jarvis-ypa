import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { AssistantState } from '../types/jarvis';

interface JarvisOrbProps {
  state: AssistantState;
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

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function JarvisOrb({
  state,
  audioLevelRef,
  speechPulseRef,
  onOrbClick,
}: JarvisOrbProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AssistantState>(state);
  const [liveSeconds, setLiveSeconds] = useState(0);

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

    const isSoftwareGl = detectSoftwareWebGL();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    const initialW = Math.max(200, container.clientWidth || 320);
    const initialH = Math.max(200, container.clientHeight || 320);

    const camera = new THREE.PerspectiveCamera(45, initialW / initialH, 0.1, 100);
    camera.position.z = 3.1;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(initialW, initialH);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x000000, 0);

    container.appendChild(renderer.domElement);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const pointLight = new THREE.PointLight(0x0088ff, 2.0, 10);
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
        uColor: { value: new THREE.Color(0x000055) },
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
        uColor: { value: new THREE.Color(0x0066ff) },
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
        uColorDeep: { value: new THREE.Color(0x001433) },
        uColorMid: { value: new THREE.Color(0x0084ff) },
        uColorBright: { value: new THREE.Color(0x00ffe1) },
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
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(200, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    let lastNow = performance.now();
    let plasmaTime = 0;
    let smoothedEnergy = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
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
      if (disposed) return;

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

      plasmaMat.uniforms.uTime.value = plasmaTime;
      plasmaMat.uniforms.uBrightness.value = 1.31 + smoothedEnergy * 0.55;
      shellFrontMat.uniforms.uOpacity.value = 0.41 + smoothedEnergy * 0.22;
      pMat.uniforms.uTime.value = plasmaTime * 0.9;

      const targetScale = 1 + smoothedEnergy * 0.085 + Math.sin(plasmaTime * 0.7) * 0.014;
      mainGroup.scale.setScalar(targetScale);

      plasmaMesh.rotation.y += dt * (0.08 + smoothedEnergy * 0.25) * motionFactor;
      mainGroup.rotation.x += 0.002 * (1 + smoothedEnergy) * motionFactor;
      mainGroup.rotation.y += 0.005 * (1 + smoothedEnergy * 1.6) * motionFactor;

      renderer.render(scene, camera);

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
      shellGeo.dispose();
      shellBackMat.dispose();
      shellFrontMat.dispose();
      plasmaGeo.dispose();
      plasmaMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
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

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      {/* Ambient radial glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full blur-3xl transition-all duration-500 ${
          state === 'listening'
            ? 'h-64 w-64 sm:h-80 sm:w-80 bg-cyan-500/20 scale-105'
            : state === 'speaking'
            ? 'h-64 w-64 sm:h-80 sm:w-80 bg-sky-400/20 scale-105'
            : state === 'thinking'
            ? 'h-60 w-60 sm:h-72 sm:w-72 bg-blue-500/18 scale-100'
            : 'h-56 w-56 sm:h-64 sm:w-64 bg-cyan-500/10 scale-95'
        }`}
      />

      {/* Signature Voice Stage Halo */}
      <div className="relative flex items-center justify-center">
        {state === 'listening' && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-1 rounded-full border border-cyan-400/35 animate-jarvis-ripple"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-2 rounded-full border-2 border-transparent border-t-cyan-300/80 border-r-cyan-400/40 animate-jarvis-spin"
            />
          </>
        )}

        {state === 'thinking' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-full border border-dashed border-sky-400/40 animate-jarvis-drift"
          />
        )}

        {state === 'speaking' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1.5 rounded-full border border-cyan-300/40 transition-transform duration-300"
          />
        )}

        <button
          type="button"
          onClick={onOrbClick}
          aria-label={ariaLabel}
          className="relative flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/75 cursor-pointer transition-transform duration-200 active:scale-[0.98]"
        >
          <div
            ref={mountRef}
            className="h-[230px] w-[230px] sm:h-[290px] sm:w-[290px] lg:h-[320px] lg:w-[320px]"
          />
        </button>
      </div>

      {/* Live Recording Timer Indicator */}
      {state === 'listening' && (
        <div className="mt-2 font-mono text-xs text-cyan-300 tabular-nums tracking-wider">
          live · {formatDuration(liveSeconds)}
        </div>
      )}
    </div>
  );
}
