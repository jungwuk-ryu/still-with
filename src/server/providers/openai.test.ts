import { describe, expect, it } from "vitest";
import { PET_IDENTITY_SCHEMA } from "./openai";

describe("OpenAI provider schemas", () => {
  it("defines items for every array in the pet identity schema", () => {
    expect(findArraysMissingItems(PET_IDENTITY_SCHEMA)).toEqual([]);
  });
});

function findArraysMissingItems(value: unknown, path = "$"): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const missing =
    record.type === "array" && !("items" in record) ? [path] : [];

  return Object.entries(record).reduce<string[]>((paths, [key, child]) => {
    if (key === "items" || key === "properties" || key === "$defs") {
      return paths.concat(findArraysMissingItems(child, `${path}.${key}`));
    }

    if (key === "type") {
      return paths;
    }

    return paths.concat(findArraysMissingItems(child, `${path}.${key}`));
  }, missing);
}
