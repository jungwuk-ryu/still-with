import { requireOpenAIApiKey } from "@/lib/env";
import { ProviderNotImplementedError } from "./errors";
import type {
  ImageSeedResult,
  OpenAIProvider,
  PetIdentityAnalysisResult,
  ProviderOptions,
  RealtimeClientSecretResult
} from "./types";

export function createOpenAIProvider(
  options: ProviderOptions = {}
): OpenAIProvider {
  return new OpenAIProviderStub(options);
}

class OpenAIProviderStub implements OpenAIProvider {
  constructor(private readonly options: ProviderOptions) {}

  async analyzePetIdentity(): Promise<PetIdentityAnalysisResult> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("OpenAIProvider", "analyzePetIdentity");
  }

  async generateImageSeed(): Promise<ImageSeedResult> {
    this.requireApiKey();
    throw new ProviderNotImplementedError("OpenAIProvider", "generateImageSeed");
  }

  async createRealtimeClientSecret(): Promise<RealtimeClientSecretResult> {
    this.requireApiKey();
    throw new ProviderNotImplementedError(
      "OpenAIProvider",
      "createRealtimeClientSecret"
    );
  }

  private requireApiKey(): string {
    return this.options.apiKey ?? requireOpenAIApiKey();
  }
}
