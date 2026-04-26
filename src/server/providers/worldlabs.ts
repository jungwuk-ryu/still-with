import { requireWorldLabsApiKey } from "@/lib/env";
import { ProviderNotImplementedError } from "./errors";
import type {
  ProviderOptions,
  WorldLabsOperation,
  WorldLabsProvider
} from "./types";
import type { WorldAsset } from "@/types";

export function createWorldLabsProvider(
  options: ProviderOptions = {}
): WorldLabsProvider {
  return new WorldLabsProviderStub(options);
}

class WorldLabsProviderStub implements WorldLabsProvider {
  constructor(private readonly options: ProviderOptions) {}

  async createWorld(): Promise<WorldLabsOperation> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("WorldLabsProvider", "createWorld");
  }

  async getOperation(): Promise<WorldLabsOperation> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("WorldLabsProvider", "getOperation");
  }

  async getWorldAssets(): Promise<WorldAsset> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("WorldLabsProvider", "getWorldAssets");
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireWorldLabsApiKey();
  }
}
