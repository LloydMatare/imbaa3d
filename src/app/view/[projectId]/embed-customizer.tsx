"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyEmbedButton } from "./copy-embed-button";
import { TEXTURE_DEFS, type TexturePreset } from "@/lib/three/procedural-textures";

type EmbedCustomizerProps = {
  projectId: string;
  isPublic: boolean;
  isOwner: boolean;
  token?: string;
};

const COLOR_PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Warm", value: "#f5f5dc" },
  { label: "Gray", value: "#bdbdbd" },
  { label: "Charcoal", value: "#444444" },
];

const FLOOR_PRESETS = [
  { label: "Oak", value: "#c8a87e" },
  { label: "Walnut", value: "#5c4033" },
  { label: "Stone", value: "#b0b0b0" },
  { label: "Slate", value: "#6b6b6b" },
];

export function EmbedCustomizer({ projectId, isPublic, isOwner, token }: EmbedCustomizerProps) {
  const [wallColor, setWallColor] = useState(COLOR_PRESETS[0]!.value);
  const [floorColor, setFloorColor] = useState(FLOOR_PRESETS[0]!.value);
  const [wallTexture, setWallTexture] = useState<TexturePreset>("none");
  const [floorTexture, setFloorTexture] = useState<TexturePreset>("wood");
  const [showGrid, setShowGrid] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showBranding, setShowBranding] = useState(true);
  const [cameraPreset, setCameraPreset] = useState("perspective");
  const [showModelTitle, setShowModelTitle] = useState(true);
  const [bg, setBg] = useState("#030712");
  const [open, setOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(token ?? null);

  const embedParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("controls", showControls ? "true" : "false");
    params.set("grid", showGrid ? "true" : "false");
    params.set("branding", showBranding ? "true" : "false");
    params.set("title", showModelTitle ? "true" : "false");
    if (cameraPreset) params.set("camera", cameraPreset);
    if (wallColor) params.set("wallColor", wallColor.replace("#", ""));
    if (floorColor) params.set("floorColor", floorColor.replace("#", ""));
    if (wallTexture && wallTexture !== "none") params.set("wallTexture", wallTexture);
    if (floorTexture && floorTexture !== "none") params.set("floorTexture", floorTexture);
    if (bg) params.set("bg", bg.replace("#", ""));
    return params.toString();
  }, [
    showControls,
    showGrid,
    showBranding,
    showModelTitle,
    cameraPreset,
    wallColor,
    floorColor,
    wallTexture,
    floorTexture,
    bg,
  ]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const activeToken = shareToken;
  const src =
    isPublic || !activeToken
      ? `${origin}/embed/${projectId}?${embedParams}`
      : `${origin}/embed/${projectId}?${embedParams}&token=${encodeURIComponent(activeToken)}`;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <CopyEmbedButton
          projectId={projectId}
          isPublic={isPublic}
          isOwner={isOwner}
          token={token}
          overrides={embedParams}
        />
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1.5 rounded-md border border-gray-800 bg-gray-900 text-gray-200 text-xs hover:bg-gray-800 transition"
        >
          Customize
        </button>
      </div>
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-gray-800 bg-gray-950 shadow-xl p-3 z-50">
          <div className="text-xs font-medium text-white mb-2">Embed Settings</div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[11px] text-gray-300">
              <input
                type="checkbox"
                checked={showControls}
                onChange={(e) => setShowControls(e.target.checked)}
                className="h-3 w-3 rounded border-gray-700 bg-gray-900"
              />
              Show controls
            </label>
            <label className="flex items-center gap-2 text-[11px] text-gray-300">
              <input
                type="checkbox"
                checked={showModelTitle}
                onChange={(e) => setShowModelTitle(e.target.checked)}
                className="h-3 w-3 rounded border-gray-700 bg-gray-900"
              />
              Show title
            </label>
            <label className="flex items-center gap-2 text-[11px] text-gray-300">
              <input
                type="checkbox"
                checked={showBranding}
                onChange={(e) => setShowBranding(e.target.checked)}
                className="h-3 w-3 rounded border-gray-700 bg-gray-900"
              />
              Show branding
            </label>
            <label className="flex items-center gap-2 text-[11px] text-gray-300">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="h-3 w-3 rounded border-gray-700 bg-gray-900"
              />
              Show grid
            </label>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Camera preset</div>
              <select
                value={cameraPreset}
                onChange={(e) => setCameraPreset(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2 py-1.5 outline-none"
              >
                <option value="perspective">Perspective</option>
                <option value="top">Top</option>
                <option value="front">Front</option>
                <option value="side">Side</option>
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Wall color</div>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setWallColor(preset.value)}
                    className={[
                      "w-7 h-7 rounded-md border",
                      wallColor === preset.value
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : "border-gray-700 hover:border-gray-500",
                    ].join(" ")}
                    style={{ backgroundColor: preset.value }}
                    title={preset.label}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Floor color</div>
              <div className="flex gap-2 flex-wrap">
                {FLOOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setFloorColor(preset.value)}
                    className={[
                      "w-7 h-7 rounded-md border",
                      floorColor === preset.value
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : "border-gray-700 hover:border-gray-500",
                    ].join(" ")}
                    style={{ backgroundColor: preset.value }}
                    title={preset.label}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Wall texture</div>
              <select
                value={wallTexture}
                onChange={(e) => setWallTexture(e.target.value as TexturePreset)}
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2 py-1.5 outline-none"
              >
                {Object.entries(TEXTURE_DEFS)
                  .filter(([, def]) => def.type === "wall" || def.type === "both")
                  .map(([key, def]) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Floor texture</div>
              <select
                value={floorTexture}
                onChange={(e) => setFloorTexture(e.target.value as TexturePreset)}
                className="w-full bg-gray-900 border border-gray-800 text-gray-200 text-xs rounded-md px-2 py-1.5 outline-none"
              >
                {Object.entries(TEXTURE_DEFS)
                  .filter(([, def]) => def.type === "floor" || def.type === "both")
                  .map(([key, def]) => (
                    <option key={key} value={key}>
                      {def.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Background</div>
              <input
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="w-full h-8 rounded-md border border-gray-800 bg-gray-900"
              />
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-900/60 px-2 py-1.5 text-[10px] text-gray-400 break-all">
              {src}
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-950/60 overflow-hidden">
              <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-800">
                Preview
              </div>
              <iframe
                title="Embed preview"
                src={src}
                className="w-full h-40"
              />
            </div>
            <button
              onClick={async () => {
                try {
                  let localToken = activeToken;
                  if (!isPublic && !localToken) {
                    if (!isOwner) {
                      toast.error("Missing share token");
                      return;
                    }
                    const res = await fetch(`/api/projects/${projectId}/share-token`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                    });
                    if (!res.ok) {
                      const data = (await res.json().catch(() => ({}))) as { error?: string };
                      toast.error(data?.error || "Failed to create share token");
                      return;
                    }
                    const data = (await res.json().catch(() => null)) as
                      | { shareToken?: string }
                      | null;
                    if (!data?.shareToken) {
                      toast.error("Failed to create share token");
                      return;
                    }
                    localToken = data.shareToken;
                    setShareToken(localToken);
                  }
                  const finalSrc =
                    isPublic || !localToken
                      ? `${origin}/embed/${projectId}?${embedParams}`
                      : `${origin}/embed/${projectId}?${embedParams}&token=${encodeURIComponent(
                          localToken
                        )}`;
                  await navigator.clipboard.writeText(
                    `<iframe src="${finalSrc}" width="100%" height="500" frameborder="0" allowfullscreen></iframe>`
                  );
                  toast.success("Embed code copied!");
                } catch {
                  toast.error("Failed to copy embed code");
                }
              }}
              className="w-full px-3 py-2 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              Copy customized embed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
