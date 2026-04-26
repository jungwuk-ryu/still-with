import path from "node:path";

export const DEFAULT_SQLITE_PATH = "./data/still-with.sqlite";
export const DEFAULT_LOCAL_STORAGE_DIR = "./data/uploads";

export function resolveFromProjectRoot(value: string): string {
  return path.isAbsolute(value)
    ? value
    : path.join(/*turbopackIgnore: true*/ process.cwd(), value);
}
