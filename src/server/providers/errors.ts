export class ProviderNotImplementedError extends Error {
  constructor(providerName: string, methodName: string) {
    super(`${providerName}.${methodName} is not implemented yet.`);
    this.name = "ProviderNotImplementedError";
  }
}
