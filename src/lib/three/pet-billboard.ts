import * as THREE from "three";

export interface PetBillboardOptions {
  position: [number, number, number];
  width: number;
  height: number;
  videoUrl: string | null;
  posterUrl: string | null;
  chromaKeyColor?: "green" | "blue";
}

export interface PetBillboard {
  group: THREE.Group;
  setVideoUrl: (
    url: string | null,
    loop?: boolean,
    options?: PetBillboardPlaybackOptions
  ) => void;
  update: (timeSeconds: number, motionKey: string | null, motionAge: number) => void;
  dispose: () => void;
}

export interface PetBillboardPlaybackOptions {
  waitForLoopBoundary?: boolean;
  durationMs?: number;
  onEnded?: () => void;
}

interface PlaybackRequest {
  url: string | null;
  loop: boolean;
  durationMs: number | null;
  onEnded: (() => void) | null;
}

interface FallbackTransform {
  translateXPercent: number;
  translateYPercent: number;
  translateXPx: number;
  translateYPx: number;
  scaleX: number;
  scaleY: number;
  rotationZ: number;
  opacity: number;
}

interface FallbackAnimationKeyframe {
  offset: number;
  transform: FallbackTransform;
}

interface FallbackAnimation {
  motionKey: string | null;
  durationMs: number;
  loopable: boolean;
  keyframes: FallbackAnimationKeyframe[];
}

const IDENTITY_FALLBACK_TRANSFORM: FallbackTransform = {
  translateXPercent: 0,
  translateYPercent: 0,
  translateXPx: 0,
  translateYPx: 0,
  scaleX: 1,
  scaleY: 1,
  rotationZ: 0,
  opacity: 1
};

export function createPetBillboard(options: PetBillboardOptions): PetBillboard {
  const group = new THREE.Group();
  group.position.set(...options.position);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext("2d");
  const fallbackTexture = new THREE.CanvasTexture(canvas);
  fallbackTexture.colorSpace = THREE.SRGBColorSpace;

  const material = createChromaKeyMaterial(
    fallbackTexture,
    options.chromaKeyColor ?? "green"
  );
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(options.width, options.height),
    material
  );
  mesh.position.y = options.height / 2;
  mesh.renderOrder = 20;
  group.add(mesh);

  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  let videoTexture: THREE.VideoTexture | null = null;
  let currentVideoUrl: string | null = null;
  let currentSourceIsVideo = false;
  let fallbackHasPoster = false;
  let loadVersion = 0;
  let pendingPlayback: PlaybackRequest | null = null;
  let activeEndedCallback: (() => void) | null = null;
  let playbackEndTimer: number | null = null;
  let currentPlaybackLoop = true;
  let currentPlaybackDurationMs: number | null = null;
  let activeFallbackAnimation: FallbackAnimation | null = null;
  let fallbackAnimationStartedAtSeconds: number | null = null;

  function setTexture(texture: THREE.Texture) {
    material.uniforms.map.value = texture;
    material.needsUpdate = true;
  }

  function drawPosterImage(image: HTMLImageElement) {
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(
      canvas.width / Math.max(image.naturalWidth, 1),
      canvas.height / Math.max(image.naturalHeight, 1)
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(
      image,
      (canvas.width - width) / 2,
      canvas.height - height,
      width,
      height
    );
    fallbackTexture.needsUpdate = true;
    fallbackHasPoster = true;
    setTexture(fallbackTexture);
  }

  function loadPosterFallback(version: number) {
    if (options.posterUrl) {
      loadImageIntoFallback(options.posterUrl, version);
    } else {
      drawFallback(performance.now() / 1000);
    }
  }

  function loadImageIntoFallback(imageUrl: string, version: number) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (version === loadVersion) {
        drawPosterImage(image);
      }
    };
    image.onerror = () => {
      if (version === loadVersion) {
        drawFallback(performance.now() / 1000);
      }
    };
    image.src = imageUrl;
  }

  async function loadFallbackManifest(url: string, version: number) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const manifest = (await response.json()) as unknown;

      if (version !== loadVersion) {
        return;
      }

      activeFallbackAnimation = parseFallbackAnimationManifest(manifest);
      fallbackAnimationStartedAtSeconds = null;

      if (activeFallbackAnimation) {
        schedulePlaybackEndFallback(getCurrentPlaybackDurationMs());
      }

      if (isRecord(manifest) && typeof manifest.stillImageUrl === "string") {
        loadImageIntoFallback(manifest.stillImageUrl, version);
      } else {
        drawFallback(performance.now() / 1000);
      }
    } catch {
      if (version === loadVersion) {
        activeFallbackAnimation = null;
        fallbackAnimationStartedAtSeconds = null;
        drawFallback(performance.now() / 1000);
      }
    }
  }

  function resetVideoTexture() {
    clearPlaybackEndTimer();
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (videoTexture) {
      videoTexture.dispose();
      videoTexture = null;
    }
  }

  function clearPlaybackEndTimer() {
    if (playbackEndTimer !== null) {
      window.clearTimeout(playbackEndTimer);
      playbackEndTimer = null;
    }
  }

  function schedulePlaybackEndFallback(durationMs: number | null) {
    clearPlaybackEndTimer();

    if (durationMs === null || isCurrentPlaybackLooping()) {
      return;
    }

    playbackEndTimer = window.setTimeout(() => {
      playbackEndTimer = null;
      completeCurrentPlayback();
    }, Math.max(durationMs, 250) + 180);
  }

  function completeCurrentPlayback() {
    clearPlaybackEndTimer();

    if (pendingPlayback) {
      const nextPlayback = pendingPlayback;
      pendingPlayback = null;
      startPlayback(nextPlayback);
      return;
    }

    const onEnded = activeEndedCallback;
    activeEndedCallback = null;
    onEnded?.();
  }

  video.addEventListener("ended", completeCurrentPlayback);

  setTexture(fallbackTexture);

  function drawFallback(timeSeconds: number) {
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    fallbackHasPoster = false;
    const glow = context.createRadialGradient(128, 170, 24, 128, 190, 150);
    glow.addColorStop(0, "rgba(255,255,255,0.95)");
    glow.addColorStop(0.52, "rgba(246,226,196,0.78)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const bob = Math.sin(timeSeconds * 1.4) * 4;
    context.fillStyle = "rgba(48,44,42,0.88)";
    context.beginPath();
    context.ellipse(128, 214 + bob, 58, 82, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(128, 120 + bob, 48, 42, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(92, 102 + bob);
    context.lineTo(75, 50 + bob);
    context.lineTo(118, 84 + bob);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(164, 102 + bob);
    context.lineTo(181, 50 + bob);
    context.lineTo(138, 84 + bob);
    context.closePath();
    context.fill();

    context.fillStyle = "rgba(255,255,255,0.92)";
    context.beginPath();
    context.arc(111, 118 + bob, 4, 0, Math.PI * 2);
    context.arc(145, 118 + bob, 4, 0, Math.PI * 2);
    context.fill();

    fallbackTexture.needsUpdate = true;
  }

  function setVideoUrl(
    url: string | null,
    loop = true,
    playbackOptions: PetBillboardPlaybackOptions = {}
  ) {
    const request: PlaybackRequest = {
      url,
      loop,
      durationMs: playbackOptions.durationMs ?? null,
      onEnded: playbackOptions.onEnded ?? null
    };

    if (
      playbackOptions.waitForLoopBoundary &&
      currentSourceIsVideo &&
      currentVideoUrl !== url &&
      !video.paused &&
      !video.ended
    ) {
      pendingPlayback = request;
      video.loop = false;
      schedulePlaybackEndFallback(getRemainingVideoTimeMs(video));
      return;
    }

    pendingPlayback = null;
    startPlayback(request);
  }

  function startPlayback(request: PlaybackRequest) {
    activeEndedCallback = request.onEnded;
    currentPlaybackLoop = request.loop;
    currentPlaybackDurationMs = request.durationMs;
    video.loop = request.loop;

    if (currentVideoUrl === request.url) {
      fallbackAnimationStartedAtSeconds = null;

      if (currentSourceIsVideo) {
        video.currentTime = 0;
        schedulePlaybackEndFallback(request.loop ? null : request.durationMs);
        void video.play().catch(() => {
          setTexture(fallbackTexture);
          loadPosterFallback(loadVersion);
          schedulePlaybackEndFallback(request.loop ? null : request.durationMs);
        });
      } else {
        schedulePlaybackEndFallback(getCurrentPlaybackDurationMs());
      }
      return;
    }

    currentVideoUrl = request.url;
    currentSourceIsVideo = false;
    activeFallbackAnimation = null;
    fallbackAnimationStartedAtSeconds = null;
    loadVersion += 1;
    const version = loadVersion;
    resetVideoTexture();
    setTexture(fallbackTexture);
    loadPosterFallback(version);

    if (!request.url) {
      schedulePlaybackEndFallback(request.loop ? null : request.durationMs);
      return;
    }

    if (isFallbackManifestUrl(request.url)) {
      void loadFallbackManifest(request.url, version);
      schedulePlaybackEndFallback(getCurrentPlaybackDurationMs());
      return;
    }

    currentSourceIsVideo = true;
    video.src = request.url;
    videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    setTexture(videoTexture);
    schedulePlaybackEndFallback(request.loop ? null : request.durationMs);
    void video.play().catch(() => {
      currentSourceIsVideo = false;
      setTexture(fallbackTexture);
      loadPosterFallback(version);
      schedulePlaybackEndFallback(request.loop ? null : request.durationMs);
    });
  }

  setVideoUrl(options.videoUrl, true);

  return {
    group,
    setVideoUrl,
    update: (timeSeconds, motionKey, motionAge) => {
      if (!currentVideoUrl && !fallbackHasPoster) {
        drawFallback(timeSeconds);
      }

      resetBillboardTransform();
      applyFallbackAnimationTransform(timeSeconds, motionKey, motionAge);
    },
    dispose: () => {
      video.removeEventListener("ended", completeCurrentPlayback);
      clearPlaybackEndTimer();
      resetVideoTexture();
      fallbackTexture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    }
  };

  function resetBillboardTransform() {
    group.position.set(...options.position);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    material.uniforms.opacityMultiplier.value = 1;
  }

  function applyFallbackAnimationTransform(
    timeSeconds: number,
    motionKey: string | null,
    motionAge: number
  ) {
    if (currentSourceIsVideo || !activeFallbackAnimation) {
      return;
    }

    const ageSeconds =
      motionKey !== null
        ? Math.max(motionAge, 0)
        : getFallbackAnimationElapsedSeconds(timeSeconds);
    const transform = sampleFallbackAnimation(
      activeFallbackAnimation,
      ageSeconds,
      isCurrentPlaybackLooping()
    );

    group.position.x +=
      transform.translateXPercent * options.width + transform.translateXPx;
    group.position.y +=
      transform.translateYPercent * options.height + transform.translateYPx;
    group.scale.set(transform.scaleX, transform.scaleY, 1);
    group.rotation.z = transform.rotationZ;
    material.uniforms.opacityMultiplier.value = transform.opacity;
  }

  function getFallbackAnimationElapsedSeconds(timeSeconds: number) {
    if (fallbackAnimationStartedAtSeconds === null) {
      fallbackAnimationStartedAtSeconds = timeSeconds;
    }

    return Math.max(timeSeconds - fallbackAnimationStartedAtSeconds, 0);
  }

  function getCurrentPlaybackDurationMs() {
    return currentPlaybackDurationMs ?? activeFallbackAnimation?.durationMs ?? null;
  }

  function isCurrentPlaybackLooping() {
    if (currentSourceIsVideo) {
      return video.loop;
    }

    return currentPlaybackLoop && (activeFallbackAnimation?.loopable ?? true);
  }
}

function createChromaKeyMaterial(
  texture: THREE.Texture,
  chromaKeyColor: "green" | "blue"
): THREE.ShaderMaterial {
  const keyColor =
    chromaKeyColor === "blue"
      ? new THREE.Vector3(0, 0.28, 1)
      : new THREE.Vector3(0, 1, 0);

  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      keyColor: { value: keyColor },
      similarity: { value: chromaKeyColor === "blue" ? 0.3 : 0.32 },
      smoothness: { value: 0.18 },
      spill: { value: chromaKeyColor === "blue" ? 0.94 : 0.98 },
      opacityMultiplier: { value: 1 }
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 keyColor;
      uniform float similarity;
      uniform float smoothness;
      uniform float spill;
      uniform float opacityMultiplier;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(map, vUv);
        float keyChannel = keyColor.g > keyColor.b ? color.g : color.b;
        float redBlueMax = keyColor.g > keyColor.b ? max(color.r, color.b) : max(color.r, color.g);
        float redBlueMin = keyColor.g > keyColor.b ? min(color.r, color.b) : min(color.r, color.g);
        float channelDominance = max(keyChannel - redBlueMax, 0.0);
        float saturation = keyChannel - min(redBlueMin, keyChannel);
        float distanceToKey = distance(color.rgb, keyColor);
        float distanceAlpha = smoothstep(similarity, similarity + smoothness, distanceToKey);
        float screenAlpha = 1.0 - (
          smoothstep(0.018, 0.13, channelDominance) *
          smoothstep(0.045, 0.19, saturation)
        );
        float rawAlpha = color.a * min(distanceAlpha, screenAlpha);
        float alpha = smoothstep(0.035, 0.42, rawAlpha) * opacityMultiplier;
        float spillAmount = max(
          smoothstep(0.004, 0.18, channelDominance),
          1.0 - alpha
        ) * spill;
        vec3 neutralized = color.rgb;
        float edgeSoftness = 1.0 - smoothstep(0.18, 0.88, alpha);

        if (keyColor.g > keyColor.b) {
          neutralized.g = min(
            neutralized.g,
            mix(redBlueMax + 0.012, (color.r + color.b) * 0.5, edgeSoftness)
          );
        } else {
          neutralized.b = min(
            neutralized.b,
            mix(redBlueMax + 0.012, (color.r + color.g) * 0.5, edgeSoftness)
          );
        }

        color.rgb = mix(color.rgb, neutralized, spillAmount);

        if (alpha < 0.012) {
          discard;
        }

        gl_FragColor = vec4(max(color.rgb, vec3(0.0)), alpha);
      }
    `
  });
}

function isFallbackManifestUrl(url: string): boolean {
  return /\/pet\/fallback\/[^/?]+\.json(?:[?#].*)?$/.test(url);
}

function getRemainingVideoTimeMs(video: HTMLVideoElement): number | null {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return null;
  }

  return Math.max((video.duration - video.currentTime) * 1000, 0);
}

function parseFallbackAnimationManifest(
  manifest: unknown
): FallbackAnimation | null {
  if (!isRecord(manifest)) {
    return null;
  }

  const durationMs =
    typeof manifest.durationMs === "number" && manifest.durationMs > 0
      ? manifest.durationMs
      : 1_800;
  const keyframes = parseFallbackAnimationKeyframes(
    manifest.transformKeyframes
  );

  if (keyframes.length === 0) {
    return null;
  }

  return {
    motionKey:
      typeof manifest.motionKey === "string" ? manifest.motionKey : null,
    durationMs,
    loopable: manifest.loopable === true,
    keyframes
  };
}

function parseFallbackAnimationKeyframes(
  value: unknown
): FallbackAnimationKeyframe[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(parseFallbackAnimationKeyframe)
    .filter((keyframe): keyframe is FallbackAnimationKeyframe => keyframe !== null)
    .sort((left, right) => left.offset - right.offset);
}

function parseFallbackAnimationKeyframe(
  value: unknown
): FallbackAnimationKeyframe | null {
  if (!isRecord(value) || typeof value.transform !== "string") {
    return null;
  }

  const offset =
    typeof value.offset === "number" && Number.isFinite(value.offset)
      ? clamp(value.offset, 0, 1)
      : 0;
  const opacity =
    typeof value.opacity === "number" && Number.isFinite(value.opacity)
      ? clamp(value.opacity, 0, 1)
      : 1;

  return {
    offset,
    transform: {
      ...parseFallbackTransform(value.transform),
      opacity
    }
  };
}

function parseFallbackTransform(transform: string): FallbackTransform {
  const parsed = { ...IDENTITY_FALLBACK_TRANSFORM };
  const transformPattern = /([a-zA-Z]+)\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = transformPattern.exec(transform)) !== null) {
    const fn = match[1]?.toLowerCase();
    const args = splitTransformArgs(match[2] ?? "");

    switch (fn) {
      case "translate":
        applyTranslateArg(parsed, "x", args[0]);
        applyTranslateArg(parsed, "y", args[1]);
        break;
      case "translatex":
        applyTranslateArg(parsed, "x", args[0]);
        break;
      case "translatey":
        applyTranslateArg(parsed, "y", args[0]);
        break;
      case "scale": {
        const scaleX = parseFiniteNumber(args[0]);
        const scaleY = parseFiniteNumber(args[1]) ?? scaleX;

        if (scaleX !== null) {
          parsed.scaleX = scaleX;
        }

        if (scaleY !== null) {
          parsed.scaleY = scaleY;
        }
        break;
      }
      case "scalex": {
        const scale = parseFiniteNumber(args[0]);

        if (scale !== null) {
          parsed.scaleX = scale;
        }
        break;
      }
      case "scaley": {
        const scale = parseFiniteNumber(args[0]);

        if (scale !== null) {
          parsed.scaleY = scale;
        }
        break;
      }
      case "rotate": {
        const rotation = parseRotationRadians(args[0]);

        if (rotation !== null) {
          parsed.rotationZ = rotation;
        }
        break;
      }
    }
  }

  return parsed;
}

function applyTranslateArg(
  transform: FallbackTransform,
  axis: "x" | "y",
  value: string | undefined
) {
  if (!value) {
    return;
  }

  const parsed = parseLength(value);

  if (!parsed) {
    return;
  }

  const direction = axis === "y" ? -1 : 1;

  if (axis === "x") {
    if (parsed.unit === "%") {
      transform.translateXPercent = parsed.value / 100;
    } else {
      transform.translateXPx = parsed.value;
    }
    return;
  }

  if (parsed.unit === "%") {
    transform.translateYPercent = (parsed.value / 100) * direction;
  } else {
    transform.translateYPx = parsed.value * direction;
  }
}

function sampleFallbackAnimation(
  animation: FallbackAnimation,
  ageSeconds: number,
  loop: boolean
): FallbackTransform {
  const durationSeconds = Math.max(animation.durationMs / 1000, 0.25);
  const progress = loop
    ? (ageSeconds % durationSeconds) / durationSeconds
    : clamp(ageSeconds / durationSeconds, 0, 1);
  const keyframes = animation.keyframes;
  const first = keyframes[0];
  const last = keyframes.at(-1);

  if (!first || !last) {
    return IDENTITY_FALLBACK_TRANSFORM;
  }

  if (progress <= first.offset) {
    return first.transform;
  }

  if (progress >= last.offset) {
    return last.transform;
  }

  const nextIndex = keyframes.findIndex((keyframe) => keyframe.offset >= progress);
  const next = keyframes[nextIndex] ?? last;
  const previous = keyframes[Math.max(nextIndex - 1, 0)] ?? first;
  const span = Math.max(next.offset - previous.offset, 0.0001);
  const amount = clamp((progress - previous.offset) / span, 0, 1);

  return interpolateFallbackTransform(previous.transform, next.transform, amount);
}

function interpolateFallbackTransform(
  from: FallbackTransform,
  to: FallbackTransform,
  amount: number
): FallbackTransform {
  return {
    translateXPercent: lerp(from.translateXPercent, to.translateXPercent, amount),
    translateYPercent: lerp(from.translateYPercent, to.translateYPercent, amount),
    translateXPx: lerp(from.translateXPx, to.translateXPx, amount),
    translateYPx: lerp(from.translateYPx, to.translateYPx, amount),
    scaleX: lerp(from.scaleX, to.scaleX, amount),
    scaleY: lerp(from.scaleY, to.scaleY, amount),
    rotationZ: lerp(from.rotationZ, to.rotationZ, amount),
    opacity: lerp(from.opacity, to.opacity, amount)
  };
}

function splitTransformArgs(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLength(value: string): { value: number; unit: "%" | "px" } | null {
  const trimmed = value.trim();

  if (trimmed.endsWith("%")) {
    const number = parseFiniteNumber(trimmed.slice(0, -1));
    return number === null ? null : { value: number, unit: "%" };
  }

  if (trimmed.endsWith("px")) {
    const number = parseFiniteNumber(trimmed.slice(0, -2));
    return number === null ? null : { value: number, unit: "px" };
  }

  const number = parseFiniteNumber(trimmed);
  return number === null ? null : { value: number, unit: "px" };
}

function parseRotationRadians(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.endsWith("deg")) {
    const degrees = parseFiniteNumber(trimmed.slice(0, -3));
    return degrees === null ? null : THREE.MathUtils.degToRad(degrees);
  }

  if (trimmed.endsWith("rad")) {
    return parseFiniteNumber(trimmed.slice(0, -3));
  }

  return parseFiniteNumber(trimmed);
}

function parseFiniteNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createContactShadow(
  width: number,
  depth: number
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(128, 64, 8, 128, 64, 112);
    gradient.addColorStop(0, "rgba(19,21,23,0.26)");
    gradient.addColorStop(0.62, "rgba(19,21,23,0.1)");
    gradient.addColorStop(1, "rgba(19,21,23,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 10;

  return shadow;
}
