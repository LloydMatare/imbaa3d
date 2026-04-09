/**
 * File storage abstraction for 3D models.
 * Supports S3 (production) and local filesystem (development).
 */

import path from "node:path";
import { promises as fs } from "node:fs";

const STORAGE_TYPE =
  process.env.STORAGE_TYPE ||
  (process.env.NODE_ENV === "development" ? "fs" : "memory");
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const FS_DIR =
  process.env.STORAGE_FS_DIR || path.join(process.cwd(), ".data", "storage");

export interface StorageProvider {
  upload(key: string, data: Buffer | string): Promise<string>;
  download(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  getUrl(key: string): string;
}

// In-memory storage for development (doesn't persist across restarts)
const memoryStore = new Map<string, string>();

class MemoryStorage implements StorageProvider {
  async upload(key: string, data: Buffer | string): Promise<string> {
    const base64 = typeof data === "string" ? data : data.toString("base64");
    memoryStore.set(key, base64);
    return this.getUrl(key);
  }

  async download(key: string): Promise<Buffer | null> {
    const data = memoryStore.get(key);
    if (!data) return null;
    return Buffer.from(data, "base64");
  }

  async delete(key: string): Promise<boolean> {
    return memoryStore.delete(key);
  }

  getUrl(key: string): string {
    // key is just the projectId — route handles auth via DB lookup
    return `/api/models/${key}`;
  }
}

function safeFileNameForKey(key: string) {
  // Avoid path traversal or filesystem constraints by encoding the key.
  return Buffer.from(key, "utf8").toString("base64url");
}

class FsStorage implements StorageProvider {
  private async ensureDir() {
    await fs.mkdir(FS_DIR, { recursive: true });
  }

  private filePath(key: string) {
    return path.join(FS_DIR, safeFileNameForKey(key));
  }

  async upload(key: string, data: Buffer | string): Promise<string> {
    await this.ensureDir();
    const fp = this.filePath(key);
    const tmp = `${fp}.tmp-${crypto.randomUUID()}`;

    const buf = typeof data === "string" ? Buffer.from(data, "base64") : data;
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, fp);
    return this.getUrl(key);
  }

  async download(key: string): Promise<Buffer | null> {
    const fp = this.filePath(key);
    try {
      return await fs.readFile(fp);
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<boolean> {
    const fp = this.filePath(key);
    try {
      await fs.unlink(fp);
      return true;
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "ENOENT") return false;
      throw err;
    }
  }

  getUrl(key: string): string {
    // Models are served via /api/models/:projectId. Other keys are currently used internally.
    return `/api/models/${key}`;
  }
}

// S3 storage implementation (placeholder - requires AWS SDK)
class S3Storage implements StorageProvider {
  async upload(key: string, data: Buffer | string): Promise<string> {
    void key;
    void data;
    throw new Error("S3 storage not configured. Set AWS credentials and S3_BUCKET.");
  }

  async download(key: string): Promise<Buffer | null> {
    void key;
    throw new Error("S3 storage not configured. Set AWS credentials and S3_BUCKET.");
  }

  async delete(key: string): Promise<boolean> {
    void key;
    throw new Error("S3 storage not configured. Set AWS credentials and S3_BUCKET.");
  }

  getUrl(key: string): string {
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  }
}

// Factory function to get the appropriate storage provider
export function getStorageProvider(): StorageProvider {
  switch (STORAGE_TYPE) {
    case "s3":
      if (!S3_BUCKET) {
        console.warn("S3_BUCKET not set, falling back to memory storage");
        return new MemoryStorage();
      }
      return new S3Storage();
    case "fs":
      return new FsStorage();
    case "memory":
    default:
      return new MemoryStorage();
  }
}

export const storage = getStorageProvider();

// Helper functions — key is just the projectId since the API route
// already resolves userId from the project record in the DB.

export async function uploadModel(
  _userId: string,
  projectId: string,
  modelData: Buffer | string
): Promise<string> {
  return storage.upload(projectId, modelData);
}

export async function downloadModel(
  _userId: string,
  projectId: string
): Promise<Buffer | null> {
  return storage.download(projectId);
}

export async function deleteModel(
  _userId: string,
  projectId: string
): Promise<boolean> {
  return storage.delete(projectId);
}

export function getModelUrl(_userId: string, projectId: string): string {
  return storage.getUrl(projectId);
}
