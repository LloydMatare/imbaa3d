type AiConvertPayload = {
  floorPlan?: unknown;
  imageDataUrl?: string;
};

export type AiConvertResult = {
  ok: boolean;
  geometry: Record<string, unknown>;
};

export async function callAiConvert(payload: AiConvertPayload): Promise<AiConvertResult> {
  const aiUrl = process.env.AI_SERVICE_URL;
  if (!aiUrl) {
    throw new Error("AI service is not configured (set AI_SERVICE_URL)");
  }

  const res = await fetch(new URL("/api/convert", aiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const detail = json ?? text;
    const msg =
      typeof detail === "string"
        ? detail
        : (detail as { detail?: string })?.detail || "AI service error";
    throw new Error(msg);
  }

  if (!json || typeof json !== "object") {
    throw new Error("AI service returned invalid response");
  }

  return json as AiConvertResult;
}
