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
  onMotionComplete?: (sequenceId: string) => void;
}

interface SceneRuntime {
  billboard: PetBillboard;
  setVideoUrl: PetBillboard["setVideoUrl"];
}

export function MemoryScene({
  manifest,
  activeMotion,
  petState,
  onMotionComplete
}: MemorySceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const motionRef = useRef<PlannedMotion | null>(activeMotion);
  const motionStartedAtRef = useRef(0);
  const cameraControls = useMemoryCamera();
  const [assetStatus, setAssetStatus] = useState("Preparing the room");
  const [assetTier, setAssetTier] = useState(manifest.world.tierHint);
  const [, setLoadProgress] = useState<number | null>(null);
  const [isRoomReady, setIsRoomReady] = useState(false);
  const [fps, setFps] = useState(0);
  const [debugVisible, setDebugVisible] = useState(false);

  useEffect(() => {
    motionRef.current = activeMotion;
    const runtime = runtimeRef.current;

    if (!runtime) {
      return;
    }

    if (!activeMotion) {
      runtime.setVideoUrl(getIdleVideoUrlForPose(manifest, petState.currentPose), true);
      return;
    }

    runtime.setVideoUrl(
      activeMotion.videoUrl ?? getIdleVideoUrlForPose(manifest, activeMotion.toState),
      activeMotion.loopable,
      {
        durationMs: activeMotion.durationMs,
        waitForLoopBoundary: true,
        onEnded: activeMotion.loopable
          ? undefined
          : () => onMotionComplete?.(activeMotion.sequenceId)
      }
    );
  }, [activeMotion, manifest, onMotionComplete, petState.currentPose]);

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
    const petScene = new THREE.Scene();
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
    const revealRoom = (status = "Room ready") => {
      if (!disposed) {
        setAssetStatus(status);
        setLoadProgress(null);
        setIsRoomReady(true);
      }
    };
    const frameStats = {
      frames: 0,
      lastSample: performance.now()
    };
    let lastMotionSignature = "";

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
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

    setIsRoomReady(false);

    const cleanupObjects = createMemoryEnvironment(scene, {
      groundPlaneOffset: manifest.world.groundPlaneOffset,
      showDemoGround: manifest.world.source === "demo-stub"
    });
    const billboard = createPetBillboard({
      ...manifest.pet.placement,
      videoUrl: getIdleVideoUrlForPose(manifest, petState.currentPose),
      chromaKeyColor: manifest.pet.chromaKeyColor,
      posterUrl: manifest.pet.posterUrl
    });
    const contactShadow = createContactShadow(
      manifest.pet.placement.width * 1.1,
      0.58
    );
    contactShadow.position.set(
      manifest.pet.placement.position[0],
      manifest.pet.placement.position[1] + 0.012,
      manifest.pet.placement.position[2] + 0.02
    );
    petScene.add(contactShadow);
    petScene.add(billboard.group);

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
      panoDispose = loadPanoBackdrop(scene, selectedAsset.url, () =>
        revealRoom()
      );
    } else if (selectedAsset.url) {
      void loadSparkSpz(renderer, scene, selectedAsset.url, setLoadProgress)
        .then((loaded) => {
          if (disposed) {
            loaded.dispose();
            return;
          }

          sparkDispose = loaded.dispose;
          loaded.mesh.quaternion.set(1, 0, 0, 0);
          loaded.mesh.position.set(0, manifest.world.groundPlaneOffset, -0.58);
          loaded.mesh.scale.setScalar(
            manifest.world.source === "demo-stub" ? 0.48 : 1.04
          );
          revealRoom();
        })
        .catch(() => {
          const fallbackPanoUrl =
            manifest.world.panoUrl ?? manifest.world.thumbnailUrl;

          if (fallbackPanoUrl) {
            panoDispose = loadPanoBackdrop(scene, fallbackPanoUrl, () => {
              if (!disposed) {
                setAssetTier("pano");
                revealRoom();
              }
            });
          } else {
            revealRoom("Using a soft preview");
          }

          setLoadProgress(null);
        });
    } else {
      queueMicrotask(() => {
        if (!disposed) {
          revealRoom("Using a soft preview");
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
        manifest.pet.placement,
        delta
      );
      billboard.update(elapsed, active?.key ?? null, Math.max(motionAge, 0));
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(petScene, camera);

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
      petScene.remove(contactShadow);
      petScene.remove(billboard.group);
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
      className={`memory-scene${isRoomReady ? " memory-scene-ready" : ""}`}
      aria-label="3D memory space"
      {...cameraControls.bind}
    >
      <canvas ref={canvasRef} className="memory-scene-canvas" />
      {!isRoomReady ? (
        <div className="space-loading-state" aria-live="polite">
          <span>Opening the memory space</span>
          <small>{assetStatus}</small>
        </div>
      ) : null}
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
  options: { groundPlaneOffset: number; showDemoGround: boolean }
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

  if (options.showDemoGround) {
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7efe5,
      roughness: 0.82,
      metalness: 0.0
    });
    const groundGeometry = new THREE.CircleGeometry(10, 64);
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = options.groundPlaneOffset;
    scene.add(ground);
    objects.push(ground);
    materials.push(groundMaterial);
    geometries.push(groundGeometry);
  }

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

function getIdleVideoUrlForPose(
  manifest: ExperienceManifest,
  pose: string | null | undefined
): string | null {
  const motionKey = pose === "sit" ? "sit" : "stand_idle";
  const idleClip =
    manifest.pet.motionClips.find(
      (clip) => clip.status === "ready" && clip.motionKey === motionKey
    ) ??
    manifest.pet.motionClips.find(
      (clip) => clip.status === "ready" && clip.motionKey === "stand_idle"
    );

  return (
    idleClip?.processedVideoUrl ??
    idleClip?.alphaVideoUrl ??
    idleClip?.rawVideoUrl ??
    manifest.pet.idleVideoUrl
  );
}
