import {
  DEFAULT_LOCAL_STORAGE_DIR,
  DEFAULT_SQLITE_PATH,
  resolveFromProjectRoot
} from "./paths";

export class MissingEnvironmentVariableError extends Error {
  constructor(variableName: string, message?: string) {
    super(message ?? `${variableName} is required for this operation.`);
    this.name = "MissingEnvironmentVariableError";
  }
}

export interface ServerEnv {
  appUrl: string;
  sqlitePath: string;
  localStorageDir: string;
}

export function getServerEnv(): ServerEnv {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
    sqlitePath: resolveFromProjectRoot(
      process.env.SQLITE_PATH?.trim() || DEFAULT_SQLITE_PATH
    ),
    localStorageDir: resolveFromProjectRoot(
      process.env.LOCAL_STORAGE_DIR?.trim() || DEFAULT_LOCAL_STORAGE_DIR
    )
  };
}

export function getSqlitePath(): string {
  return getServerEnv().sqlitePath;
}

export function getLocalStorageDir(): string {
  return getServerEnv().localStorageDir;
}

export function requireOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new MissingEnvironmentVariableError(
      "OPENAI_API_KEY",
      "OPENAI_API_KEY is required when calling the OpenAI provider."
    );
  }

  return apiKey;
}

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

export function requireGeminiApiKey(): string {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new MissingEnvironmentVariableError(
      "GEMINI_API_KEY",
      "GEMINI_API_KEY is required when calling the Gemini provider."
    );
  }

  return apiKey;
}

export function requireWorldLabsApiKey(): string {
  const apiKey = process.env.WORLDLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new MissingEnvironmentVariableError(
      "WORLDLABS_API_KEY",
      "WORLDLABS_API_KEY is required when calling the World Labs provider."
    );
  }

  return apiKey;
}

export function getElevenLabsApiKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

export function requireElevenLabsApiKey(): string {
  const apiKey = getElevenLabsApiKey();

  if (!apiKey) {
    throw new MissingEnvironmentVariableError(
      "ELEVENLABS_API_KEY",
      "ELEVENLABS_API_KEY is required when calling the ElevenLabs provider."
    );
  }

  return apiKey;
}

export function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

export function getResendFromEmail(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Still With <notifications@stillwith.local>"
  );
}
