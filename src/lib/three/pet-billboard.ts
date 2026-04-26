import * as THREE from "three";

export interface PetBillboardOptions {
  position: [number, number, number];
  width: number;
  height: number;
  videoUrl: string | null;
  posterUrl: string | null;
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

  const material = new THREE.MeshBasicMaterial({
    map: fallbackTexture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(options.width, options.height),
    material
  );
  mesh.position.y = options.height / 2;
  group.add(mesh);

  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  let videoTexture: THREE.VideoTexture | null = null;
  let currentVideoUrl: string | null = null;

  function drawFallback(timeSeconds: number) {
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
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
      video.loop = loop;
      video.currentTime = 0;
      void video.play().catch(() => {
        material.map = fallbackTexture;
        material.needsUpdate = true;
      });
      return;
    }

    currentVideoUrl = url;
    video.loop = loop;
    video.pause();
    video.removeAttribute("src");
    video.load();

    if (videoTexture) {
      videoTexture.dispose();
      videoTexture = null;
    }

    material.map = fallbackTexture;

    if (!url) {
      material.needsUpdate = true;
      return;
    }

    video.src = url;
    videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    material.map = videoTexture;
    material.needsUpdate = true;
    void video.play().catch(() => {
      material.map = fallbackTexture;
      material.needsUpdate = true;
    });
  }

  setVideoUrl(options.videoUrl, true);

  return {
    group,
    setVideoUrl,
    update: (timeSeconds, motionKey, motionAge) => {
      drawFallback(timeSeconds);

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
      video.pause();
      video.removeAttribute("src");
      video.load();
      fallbackTexture.dispose();
      videoTexture?.dispose();
      material.dispose();
      mesh.geometry.dispose();
    }
  };
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
    depthWrite: false
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  shadow.rotation.x = -Math.PI / 2;

  return shadow;
}
