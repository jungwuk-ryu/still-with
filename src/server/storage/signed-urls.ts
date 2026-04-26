import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getLocalStorageDir } from "@/lib/env";

const LOCAL_STORAGE_URL_SECRET_FILE = ".storage-url-secret";

export function signStorageKey(key: string, rootDir?: string): string {
  return createHmac("sha256", getStorageUrlSecret(rootDir)).update(key).digest("hex");
}

export function verifyStorageKeySignature(
  key: string,
  token: string | null,
  rootDir?: string
): boolean {
  if (!token) {
    return false;
  }

  const expected = Buffer.from(signStorageKey(key, rootDir), "hex");
  const actual = Buffer.from(token, "hex");

  if (expected.byteLength !== actual.byteLength) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

function getStorageUrlSecret(rootDir?: string): string {
  const configuredSecret = process.env.STORAGE_URL_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  return getOrCreateLocalStorageUrlSecret(rootDir);
}

function getOrCreateLocalStorageUrlSecret(rootDir?: string): string {
  const secretPath = path.join(
    rootDir ?? getLocalStorageDir(),
    LOCAL_STORAGE_URL_SECRET_FILE
  );

  try {
    const existingSecret = readLocalStorageUrlSecret(secretPath);

    if (existingSecret) {
      return existingSecret;
    }

    fs.mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(secretPath, `${randomBytes(32).toString("hex")}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });

    const createdSecret = readLocalStorageUrlSecret(secretPath);

    if (createdSecret) {
      return createdSecret;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      let racedSecret: string | null = null;

      try {
        racedSecret = readLocalStorageUrlSecret(secretPath);
      } catch {
        racedSecret = null;
      }

      if (racedSecret) {
        return racedSecret;
      }
    }
  }

  throw new Error(
    "STORAGE_URL_SECRET is required or a local storage signing secret could not be initialized."
  );
}

function readLocalStorageUrlSecret(secretPath: string): string | null {
  if (!fs.existsSync(secretPath)) {
    return null;
  }

  const secret = fs.readFileSync(secretPath, "utf8").trim();
  return secret || null;
}
