import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

/**
 * Opslag voor uploads (R25).
 * - Op Azure: Blob Storage, met de eigen identiteit van de App Service (geen sleutels in de configuratie).
 * - Lokaal: een map op schijf (UPLOAD_DIR, standaard .local-uploads).
 */
interface Storage {
  put(data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function azureStorage(account: string, containerName: string): Storage {
  let container: ContainerClient | null = null;
  const c = () =>
    (container ??= new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential()).getContainerClient(
      containerName,
    ));
  return {
    async put(data, contentType) {
      const key = randomUUID();
      await c().getBlockBlobClient(key).uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
      return key;
    },
    async get(key) {
      return c().getBlockBlobClient(key).downloadToBuffer();
    },
    async remove(key) {
      await c().getBlockBlobClient(key).deleteIfExists();
    },
  };
}

function diskStorage(dir: string): Storage {
  const file = (key: string) => {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Ongeldige bestandssleutel");
    return path.join(dir, key);
  };
  return {
    async put(data) {
      await fs.mkdir(dir, { recursive: true });
      const key = randomUUID();
      await fs.writeFile(file(key), data);
      return key;
    },
    get: (key) => fs.readFile(file(key)),
    async remove(key) {
      await fs.rm(file(key), { force: true });
    },
  };
}

export const storage: Storage = process.env.AZURE_STORAGE_ACCOUNT
  ? azureStorage(process.env.AZURE_STORAGE_ACCOUNT, process.env.AZURE_STORAGE_CONTAINER ?? "uploads")
  : diskStorage(path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.UPLOAD_DIR ?? ".local-uploads"));

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
