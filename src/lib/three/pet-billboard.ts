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
  setVideoUrl: (url: string | null, loop?: boolean) => void;
  update: (timeSeconds: number, motionKey: string | null, motionAge: number) => void;
  dispose: () => void;
}

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
      const manifest = (await response.json()) as {
        stillImageUrl?: unknown;
      };

      if (version !== loadVersion) {
        return;
      }

      if (typeof manifest.stillImageUrl === "string") {
        loadImageIntoFallback(manifest.stillImageUrl, version);
      } else {
        drawFallback(performance.now() / 1000);
      }
    } catch {
      if (version === loadVersion) {
        drawFallback(performance.now() / 1000);
      }
    }
  }

  function resetVideoTexture() {
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (videoTexture) {
      videoTexture.dispose();
      videoTexture = null;
    }
  }

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

  function setVideoUrl(url: string | null, loop = true) {
    if (currentVideoUrl === url) {
      if (currentSourceIsVideo) {
        video.loop = loop;
        video.currentTime = 0;
        void video.play().catch(() => {
          setTexture(fallbackTexture);
          loadPosterFallback(loadVersion);
        });
      }
      return;
    }

    currentVideoUrl = url;
    currentSourceIsVideo = false;
    loadVersion += 1;
    const version = loadVersion;
    resetVideoTexture();
    setTexture(fallbackTexture);
    loadPosterFallback(version);

    if (!url) {
      return;
    }

    if (isFallbackManifestUrl(url)) {
      void loadFallbackManifest(url, version);
      return;
    }

    currentSourceIsVideo = true;
    video.src = url;
    video.loop = loop;
    videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    setTexture(videoTexture);
    void video.play().catch(() => {
      currentSourceIsVideo = false;
      setTexture(fallbackTexture);
      loadPosterFallback(version);
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

      const sitScale = motionKey === "sit" ? 0.86 : 1;
      const closerOffset =
        motionKey === "come_closer"
          ? Math.min(Math.sin(Math.min(motionAge / 1.8, 1) * Math.PI * 0.5), 1) *
            0.42
          : 0;
      const turn =
        motionKey === "turn_around"
          ? Math.sin(Math.min(motionAge / 1.3, 1) * Math.PI) * Math.PI
          : Math.sin(timeSeconds * 0.55) * 0.05;

      group.rotation.y = turn;
      group.position.z = options.position[2] + closerOffset;
      group.scale.setScalar(sitScale);
    },
    dispose: () => {
      resetVideoTexture();
      fallbackTexture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    }
  };
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
      similarity: { value: chromaKeyColor === "blue" ? 0.32 : 0.34 },
      smoothness: { value: 0.08 },
      spill: { value: chromaKeyColor === "blue" ? 0.66 : 0.78 }
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
          smoothstep(0.035, 0.16, channelDominance) *
          smoothstep(0.08, 0.22, saturation)
        );
        float alpha = color.a * min(distanceAlpha, screenAlpha);
        float spillAmount = smoothstep(0.02, 0.18, channelDominance) * spill;
        vec3 neutralized = color.rgb;

        if (keyColor.g > keyColor.b) {
          neutralized.g = min(neutralized.g, redBlueMax + 0.025);
        } else {
          neutralized.b = min(neutralized.b, redBlueMax + 0.025);
        }

        color.rgb = mix(color.rgb, neutralized, spillAmount);

        if (alpha < 0.025) {
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
