import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectRecord, openDatabase, type DatabaseClient } from "@/server/db";
import { createLocalStorageDriver } from "@/server/storage";
import type { StorageDriver } from "@/server/storage";
import {
  createSceneClusterRecord,
  getWorldAssetRecord,
  persistWorldAssetManifest
} from "./repository";

let db: DatabaseClient | null = null;
let tmpDir: string | null = null;

afterEach(async () => {
  db?.close();
  db = null;

  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("world asset manifest repository", () => {
  it("persists the WorldAsset row and local manifest JSON", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet living room empty of pets, people, and all other animals."
      },
      db
    );

    const result = await persistWorldAssetManifest(
      {
        id: "world-asset-world-1",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-1",
        spzUrl100k: "https://cdn.example.com/100k.spz",
        spzUrl500k: "https://cdn.example.com/500k.spz",
        spzUrlFullRes: "https://cdn.example.com/full.spz",
        colliderMeshUrl: "https://cdn.example.com/collider.glb",
        panoUrl: "https://cdn.example.com/pano.jpg",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        groundPlaneOffset: -0.08,
        initialCameraPose: null
      },
      {
        db,
        storage,
        generatedAt: "2026-04-26T00:00:00.000Z"
      }
    );

    expect(getWorldAssetRecord("world-asset-world-1", db)).toMatchObject({
      worldId: "world-1",
      spzUrl500k: "https://cdn.example.com/500k.spz",
      colliderMeshUrl: "https://cdn.example.com/collider.glb",
      panoUrl: "https://cdn.example.com/pano.jpg",
      thumbnailUrl: "https://cdn.example.com/thumb.jpg"
    });
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      renderMode: "spz",
      spz: {
        preferredTier: "500k"
      },
      collider: {
        meshUrl: "https://cdn.example.com/collider.glb",
        format: "glb"
      },
      panorama: {
        url: "https://cdn.example.com/pano.jpg"
      },
      thumbnail: {
        url: "https://cdn.example.com/thumb.jpg"
      },
      fallback: {
        kind: "none",
        reason: null
      }
    });

    const manifestObject = await storage.getObject(result.manifestKey);
    expect(JSON.parse(manifestObject.body.toString("utf8"))).toMatchObject({
      id: "world-asset-world-1",
      projectId: project.id,
      worldId: "world-1",
      renderMode: "spz"
    });
  });

  it("marks panorama fallback when no SPZ tier is available", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Favorite corner",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet favorite corner empty of pets, people, and all other animals."
      },
      db
    );

    const result = await persistWorldAssetManifest(
      {
        id: "world-asset-world-2",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-2",
        spzUrl100k: null,
        spzUrl500k: null,
        spzUrlFullRes: null,
        colliderMeshUrl: "https://cdn.example.com/collider.glb",
        panoUrl: "https://cdn.example.com/pano.jpg",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        groundPlaneOffset: 0,
        initialCameraPose: null
      },
      {
        db,
        storage
      }
    );

    expect(result.manifest).toMatchObject({
      renderMode: "panorama",
      fallback: {
        kind: "panorama"
      },
      spz: {
        preferredTier: null
      }
    });
  });

  it("prefers full resolution when it is the only SPZ tier", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Hallway",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet hallway empty of pets, people, and all other animals."
      },
      db
    );

    const result = await persistWorldAssetManifest(
      {
        id: "world-asset-world-3",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-3",
        spzUrl100k: null,
        spzUrl500k: null,
        spzUrlFullRes: "https://cdn.example.com/full.spz",
        colliderMeshUrl: "https://cdn.example.com/collider.glb",
        panoUrl: "https://cdn.example.com/pano.jpg",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        groundPlaneOffset: 0,
        initialCameraPose: null
      },
      {
        db,
        storage
      }
    );

    expect(result.manifest).toMatchObject({
      renderMode: "spz",
      spz: {
        preferredTier: "full_res"
      },
      collider: {
        meshUrl: "https://cdn.example.com/collider.glb",
        format: "glb"
      }
    });
  });

  it("falls back when SPZ tiers are present without a collider", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Hallway",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet hallway empty of pets, people, and all other animals."
      },
      db
    );

    const result = await persistWorldAssetManifest(
      {
        id: "world-asset-world-7",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-7",
        spzUrl100k: null,
        spzUrl500k: "https://cdn.example.com/500k.spz",
        spzUrlFullRes: null,
        colliderMeshUrl: null,
        panoUrl: "https://cdn.example.com/pano.jpg",
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        groundPlaneOffset: 0,
        initialCameraPose: null
      },
      {
        db,
        storage
      }
    );

    expect(result.manifest).toMatchObject({
      renderMode: "panorama",
      spz: {
        preferredTier: null,
        tiers: {
          "500k": "https://cdn.example.com/500k.spz"
        }
      },
      collider: {
        meshUrl: null,
        format: null
      },
      fallback: {
        kind: "panorama",
        reason: "World Labs did not return a complete SPZ and collider asset."
      }
    });
  });

  it("marks thumbnail fallback when only a thumbnail is available", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Favorite corner",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet favorite corner empty of pets, people, and all other animals."
      },
      db
    );

    const result = await persistWorldAssetManifest(
      {
        id: "world-asset-world-4",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-4",
        spzUrl100k: null,
        spzUrl500k: null,
        spzUrlFullRes: null,
        colliderMeshUrl: null,
        panoUrl: null,
        thumbnailUrl: "https://cdn.example.com/thumb.jpg",
        groundPlaneOffset: 0,
        initialCameraPose: null
      },
      {
        db,
        storage
      }
    );

    expect(result.manifest).toMatchObject({
      renderMode: "thumbnail",
      fallback: {
        kind: "thumbnail"
      }
    });
  });

  it("upserts an existing world asset manifest row", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const storage = createLocalStorageDriver(path.join(tmpDir, "uploads"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet living room empty of pets, people, and all other animals."
      },
      db
    );

    await persistWorldAssetManifest(
      {
        id: "world-asset-world-5",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-5",
        spzUrl100k: "https://cdn.example.com/old-100k.spz",
        spzUrl500k: "https://cdn.example.com/old-500k.spz",
        spzUrlFullRes: null,
        colliderMeshUrl: "https://cdn.example.com/old-collider.glb",
        panoUrl: "https://cdn.example.com/old-pano.jpg",
        thumbnailUrl: "https://cdn.example.com/old-thumb.jpg",
        groundPlaneOffset: 0,
        initialCameraPose: null
      },
      {
        db,
        storage
      }
    );
    const result = await persistWorldAssetManifest(
      {
        id: "world-asset-world-5",
        projectId: project.id,
        sceneClusterId: sceneCluster.id,
        worldId: "world-5",
        spzUrl100k: "https://cdn.example.com/new-100k.spz",
        spzUrl500k: "https://cdn.example.com/new-500k.spz",
        spzUrlFullRes: null,
        colliderMeshUrl: "https://cdn.example.com/new-collider.glb",
        panoUrl: "https://cdn.example.com/new-pano.jpg",
        thumbnailUrl: "https://cdn.example.com/new-thumb.jpg",
        groundPlaneOffset: -0.2,
        initialCameraPose: null
      },
      {
        db,
        storage
      }
    );

    expect(getWorldAssetRecord("world-asset-world-5", db)).toMatchObject({
      spzUrl500k: "https://cdn.example.com/new-500k.spz",
      colliderMeshUrl: "https://cdn.example.com/new-collider.glb",
      panoUrl: "https://cdn.example.com/new-pano.jpg",
      thumbnailUrl: "https://cdn.example.com/new-thumb.jpg",
      groundPlaneOffset: -0.2
    });
    expect(result.manifest.spz.tiers["500k"]).toBe(
      "https://cdn.example.com/new-500k.spz"
    );
  });

  it("sanitizes manifest storage write errors", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "still-with-world-assets-"));
    db = openDatabase(path.join(tmpDir, "test.sqlite"));
    const project = createProjectRecord({}, db);
    const sceneCluster = createSceneClusterRecord(
      {
        projectId: project.id,
        label: "Living room",
        sourceImageIds: ["image-1"],
        representativeImageIds: ["image-1"],
        spatialPrompt:
          "A quiet living room empty of pets, people, and all other animals."
      },
      db
    );

    await expect(
      persistWorldAssetManifest(
        {
          id: "world-asset-world-6",
          projectId: project.id,
          sceneClusterId: sceneCluster.id,
          worldId: "world-6",
          spzUrl100k: "https://cdn.example.com/100k.spz",
          spzUrl500k: "https://cdn.example.com/500k.spz",
          spzUrlFullRes: null,
          colliderMeshUrl: "https://cdn.example.com/collider.glb",
          panoUrl: "https://cdn.example.com/pano.jpg",
          thumbnailUrl: "https://cdn.example.com/thumb.jpg",
          groundPlaneOffset: 0,
          initialCameraPose: null
        },
        {
          db,
          storage: createThrowingStorage("/tmp/still-with-secret/manifest.json")
        }
      )
    ).rejects.toThrow("WorldAsset manifest could not be stored.");
  });
});

function createThrowingStorage(pathInError: string): StorageDriver {
  return {
    async putObject() {
      throw new Error(`EACCES: permission denied, open '${pathInError}'`);
    },
    async getObject() {
      throw new Error("not used");
    },
    async deleteObject() {},
    getObjectUrl(key: string) {
      return `/api/storage/${key}`;
    }
  };
}
