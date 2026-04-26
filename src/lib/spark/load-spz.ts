import type * as THREE from "three";

export interface SparkSplatLoadResult {
  mesh: THREE.Object3D;
  dispose: () => void;
}

export async function loadSparkSpz(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  url: string,
  onProgress?: (progress: number | null) => void
): Promise<SparkSplatLoadResult> {
  const sparkModule = (await import("@sparkjsdev/spark")) as {
    SparkRenderer: new (options: {
      renderer: THREE.WebGLRenderer;
    }) => THREE.Object3D & { dispose?: () => void };
    SplatMesh: new (options: {
      url: string;
      lod?: boolean | number;
      enableLod?: boolean;
      lodScale?: number;
      onProgress?: (event: ProgressEvent) => void;
      onLoad?: () => void;
    }) => THREE.Object3D & {
      initialized?: Promise<THREE.Object3D>;
      dispose?: () => void;
      opacity?: number;
    };
  };

  let sparkRenderer:
    | (THREE.Object3D & {
        dispose?: () => void;
      })
    | null = null;
  let splatMesh:
    | (THREE.Object3D & {
        initialized?: Promise<THREE.Object3D>;
        dispose?: () => void;
        opacity?: number;
      })
    | null = null;

  try {
    sparkRenderer = new sparkModule.SparkRenderer({ renderer });
    splatMesh = new sparkModule.SplatMesh({
      url,
      lod: true,
      enableLod: true,
      lodScale: 0.8,
      onProgress: (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(event.loaded / event.total);
        } else {
          onProgress?.(null);
        }
      },
      onLoad: () => onProgress?.(1)
    });

    scene.add(sparkRenderer);
    scene.add(splatMesh);

    if (splatMesh.initialized) {
      await splatMesh.initialized;
    }

    return {
      mesh: splatMesh,
      dispose: () => {
        if (splatMesh) {
          scene.remove(splatMesh);
          splatMesh.dispose?.();
        }

        if (sparkRenderer) {
          scene.remove(sparkRenderer);
          sparkRenderer.dispose?.();
        }
      }
    };
  } catch (error) {
    if (splatMesh) {
      scene.remove(splatMesh);
      splatMesh.dispose?.();
    }

    if (sparkRenderer) {
      scene.remove(sparkRenderer);
      sparkRenderer.dispose?.();
    }

    throw error;
  }
}
