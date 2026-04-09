import { storage } from "@/lib/storage";

export async function loadReferenceImageDataUrl(projectId: string): Promise<string | null> {
  const imageKey = `ref-${projectId}`;
  const metaKey = `ref-${projectId}-meta`;

  const buf = await storage.download(imageKey);
  if (!buf) return null;

  let contentType = "image/png";
  try {
    const metaBuf = await storage.download(metaKey);
    if (metaBuf) {
      const meta = JSON.parse(metaBuf.toString("utf8")) as { contentType?: unknown };
      if (typeof meta?.contentType === "string" && meta.contentType.startsWith("image/")) {
        contentType = meta.contentType;
      }
    }
  } catch {
    // ignore
  }

  const base64 = buf.toString("base64");
  return `data:${contentType};base64,${base64}`;
}
