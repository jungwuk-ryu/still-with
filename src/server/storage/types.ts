export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}

export interface StoredObject {
  key: string;
  absolutePath: string;
  url: string;
  contentType: string;
  size: number;
  body: Buffer;
}

export interface StorageObjectInfo {
  key: string;
  absolutePath: string;
  url: string;
  contentType: string;
  size: number;
}

export interface StorageDriver {
  putObject(input: PutObjectInput): Promise<StorageObjectInfo>;
  getObject(key: string): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  getObjectUrl(key: string): string;
}
