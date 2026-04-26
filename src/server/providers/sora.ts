import { requireOpenAIApiKey } from "@/lib/env";
import { ProviderNotImplementedError } from "./errors";
import type { ProviderOptions, SoraOperation, SoraProvider } from "./types";

export function createSoraProvider(options: ProviderOptions = {}): SoraProvider {
  return new SoraProviderStub(options);
}

class SoraProviderStub implements SoraProvider {
  constructor(private readonly options: ProviderOptions) {}

  async createMotionClip(): Promise<SoraOperation> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("SoraProvider", "createMotionClip");
  }

  async getMotionClip(): Promise<SoraOperation> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("SoraProvider", "getMotionClip");
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireOpenAIApiKey();
  }
}
