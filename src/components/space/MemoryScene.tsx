"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { PetRuntimeState } from "@/types";
import type {
  ExperienceManifest,
  PlannedMotion
} from "@/server/conversation/types";
import { useMemoryCamera } from "@/hooks/useMemoryCamera";
import { loadSparkSpz } from "@/lib/spark/load-spz";
import {
  getClientPerformanceProfile,
  getRendererPixelRatio,
  selectWorldAssetUrl
} from "@/lib/three/quality";
import {
  createContactShadow,
  createPetBillboard,
  type PetBillboard
} from "@/lib/three/pet-billboard";
import { MemoryDebugOverlay } from "./MemoryDebugOverlay";

interface MemorySceneProps {
  manifest: ExperienceManifest;
  activeMotion: PlannedMotion | null;
  petState: PetRuntimeState;
}

interface SceneRuntime {
  billboard: PetBillboard;
  setVideoUrl: (url: string | null, loop?: boolean) => void;
}

export function MemoryScene({
  manifest,
  activeMotion,
  petState
}: MemorySceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const motionRef = useRef<PlannedMotion | null>(activeMotion);
  const motionStartedAtRef = useRef(0);
  const cameraControls = useMemoryCamera();
  const [assetStatus, setAssetStatus] = useState("Preparing the room");
  const [assetTier, setAssetTier] = useState(manifest.world.tierHint);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [fps, setFps] = useState(0);
  const [debugVisible, setDebugVisible] = useState(false);

  useEffect(() => {
    motionRef.current = activeMotion;
    runtimeRef.current?.setVideoUrl(
      activeMotion?.videoUrl ?? manifest.pet.idleVideoUrl,
      activeMotion?.loopable ?? true
    );
  }, [activeMotion, manifest.pet.idleVideoUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === "d") {
        setDebugVisible((visible) => !visible);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const sceneContainer = container;
    let disposed = false;
    let sparkDispose: (() => void) | null = null;
    let panoDispose: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const clock = new THREE.Clock();
    const lookAtTarget = new THREE.Vector3();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      manifest.world.initialCameraPose.fov ?? 48,
      1,
      0.05,
      80
    );
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance"
    });
    const profile = getClientPerformanceProfile();
    const selectedAsset = selectWorldAssetUrl(
      manifest.world.asset,
      profile,
      manifest.world.spzUrl
    );
    const frameStats = {
      frames: 0,
      lastSample: performance.now()
    };
    let lastMotionSignature = "";

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(getRendererPixelRatio(profile.devicePixelRatio));
    renderer.setClearColor(0xf5f9ff, 1);

    scene.fog = new THREE.Fog(0xf5f9ff, 4.5, 18);
    queueMicrotask(() => {
      if (!disposed) {
        setAssetTier(selectedAsset.tier);
        setAssetStatus(
          selectedAsset.url ? "Loading the room" : "Preparing the room"
        );
      }
    });

    const cleanupObjects = createMemoryEnvironment(
      scene,
      manifest.world.groundPlaneOffset
    );
    const billboard = createPetBillboard({
      ...manifest.pet.placement,
      videoUrl: manifest.pet.idleVideoUrl,
      posterUrl: manifest.pet.posterUrl
    });
    const contactShadow = createContactShadow(
      manifest.pet.placement.width * 1.1,
      0.58
    );
    contactShadow.position.set(
      manifest.pet.placement.position[0],
      manifest.world.groundPlaneOffset + 0.012,
      manifest.pet.placement.position[2] + 0.02
    );
    scene.add(contactShadow);
    scene.add(billboard.group);

    runtimeRef.current = {
      billboard,
      setVideoUrl: billboard.setVideoUrl
    };

    function resize() {
      const rect = sceneContainer.getBoundingClientRect();
      const width = Math.max(Math.floor(rect.width), 1);
      const height = Math.max(Math.floor(rect.height), 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(sceneContainer);
    resize();

    if (selectedAsset.url && selectedAsset.tier === "pano") {
      panoDispose = loadPanoBackdrop(scene, selectedAsset.url, () => {
        if (!disposed) {
          setAssetStatus("Room ready");
        }
      });
    } else if (selectedAsset.url) {
      void loadSparkSpz(renderer, scene, selectedAsset.url, setLoadProgress)
        .then((loaded) => {
          if (disposed) {
            loaded.dispose();
            return;
          }

          sparkDispose = loaded.dispose;
          loaded.mesh.position.set(0, manifest.world.groundPlaneOffset, -1.15);
          loaded.mesh.scale.setScalar(manifest.world.source === "demo-stub" ? 0.48 : 1);
          setAssetStatus("Room ready");
        })
        .catch(() => {
          const fallbackPanoUrl =
            manifest.world.panoUrl ?? manifest.world.thumbnailUrl;

          if (fallbackPanoUrl) {
            panoDispose = loadPanoBackdrop(scene, fallbackPanoUrl, () => {
              if (!disposed) {
                setAssetTier("pano");
                setAssetStatus("Room ready");
              }
            });
          } else {
            setAssetStatus("Using a soft preview");
          }

          setLoadProgress(null);
        });
    } else {
      queueMicrotask(() => {
        if (!disposed) {
          setAssetStatus("Using a soft preview");
        }
      });
    }

    renderer.setAnimationLoop(() => {
      if (disposed) {
        return;
      }

      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      const active = motionRef.current;
      const motionSignature = active
        ? active.sequenceId
        : "idle";

      if (motionSignature !== lastMotionSignature) {
        lastMotionSignature = motionSignature;
        motionStartedAtRef.current = elapsed;
      }

      const motionAge = elapsed - motionStartedAtRef.current;
      cameraControls.updateCamera(
        camera,
        lookAtTarget,
        manifest.world.initialCameraPose,
        delta
      );
      billboard.update(elapsed, active?.key ?? null, Math.max(motionAge, 0));
      renderer.render(scene, camera);

      frameStats.frames += 1;
      const now = performance.now();
      if (now - frameStats.lastSample > 500) {
        setFps((frameStats.frames * 1000) / (now - frameStats.lastSample));
        frameStats.frames = 0;
        frameStats.lastSample = now;
      }
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver?.disconnect();
      sparkDispose?.();
      panoDispose?.();
      runtimeRef.current = null;
      scene.remove(contactShadow);
      scene.remove(billboard.group);
      billboard.dispose();
      contactShadow.geometry.dispose();
      contactShadow.material.map?.dispose();
      contactShadow.material.dispose();
      cleanupObjects();
      renderer.dispose();
    };
  }, [cameraControls, manifest]);

  return (
    <section
      ref={containerRef}
      className="memory-scene"
      aria-label="3D memory space"
      {...cameraControls.bind}
    >
      <canvas ref={canvasRef} className="memory-scene-canvas" />
      <div className="space-loading-state" aria-live="polite">
        <span>{assetStatus}</span>
        {loadProgress !== null ? (
          <span>{Math.round(loadProgress * 100)}%</span>
        ) : null}
      </div>
      <MemoryDebugOverlay
        visible={debugVisible}
        fps={fps}
        assetTier={assetTier}
        assetStatus={assetStatus}
        petState={petState}
      />
    </section>
  );
}

function createMemoryEnvironment(
  scene: THREE.Scene,
  groundPlaneOffset: number
): () => void {
  const objects: THREE.Object3D[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd6bca0, 2.2);
  const key = new THREE.DirectionalLight(0xfff2dc, 1.35);
  key.position.set(2.8, 4.5, 3.2);
  const fill = new THREE.DirectionalLight(0xbdd8ff, 0.85);
  fill.position.set(-4, 2.2, -2);
  scene.add(hemi, key, fill);
  objects.push(hemi, key, fill);

  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7efe5,
    roughness: 0.82,
    metalness: 0.0
  });
  const groundGeometry = new THREE.CircleGeometry(10, 64);
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundPlaneOffset;
  scene.add(ground);
  objects.push(ground);
  materials.push(groundMaterial);
  geometries.push(groundGeometry);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  const ringGeometry = new THREE.TorusGeometry(1.9, 0.012, 8, 96, Math.PI * 1.15);

  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(-0.32 + index * 0.36, 1.52 + index * 0.16, -2.8);
    ring.rotation.set(Math.PI * 0.58, 0.12 - index * 0.12, Math.PI * 0.08);
    scene.add(ring);
    objects.push(ring);
  }

  materials.push(ringMaterial);
  geometries.push(ringGeometry);

  const pearlMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff8ea,
    transparent: true,
    opacity: 0.62
  });
  const pearlGeometry = new THREE.SphereGeometry(0.04, 12, 12);

  for (let index = 0; index < 18; index += 1) {
    const pearl = new THREE.Mesh(pearlGeometry, pearlMaterial);
    const angle = index * 0.88;
    pearl.position.set(
      Math.sin(angle) * (1.6 + (index % 4) * 0.18),
      0.48 + ((index * 37) % 120) / 100,
      -2.2 + Math.cos(angle) * 1.1
    );
    scene.add(pearl);
    objects.push(pearl);
  }

  materials.push(pearlMaterial);
  geometries.push(pearlGeometry);

  return () => {
    objects.forEach((object) => scene.remove(object));
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  };
}

function loadPanoBackdrop(
  scene: THREE.Scene,
  url: string,
  onLoad: () => void
): () => void {
  const loader = new THREE.TextureLoader();
  let texture: THREE.Texture | null = null;
  let disposed = false;

  loader.load(
    url,
    (loadedTexture) => {
      if (disposed) {
        loadedTexture.dispose();
        return;
      }

      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.mapping = THREE.EquirectangularReflectionMapping;
      texture = loadedTexture;
      scene.background = loadedTexture;
      onLoad();
    },
    undefined,
    () => onLoad()
  );

  return () => {
    disposed = true;

    if (scene.background === texture) {
      scene.background = null;
    }

    texture?.dispose();
  };
}
