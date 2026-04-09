"use client";

import { Suspense } from "react";
import { Scene } from "@/components/three/scene";
import { ModelViewer } from "@/components/three/model-viewer";
import type { TexturePreset } from "@/lib/three/procedural-textures";

interface EmbedViewerProps {
  projectId: string;
  url: string;
  title: string;
  floorPlanData?: unknown;
  showControls?: boolean;
  showBranding?: boolean;
  showTitle?: boolean;
  showGrid?: boolean;
  wallColor?: number;
  floorColor?: number;
  wallTexture?: TexturePreset;
  floorTexture?: TexturePreset;
  initialCamera?: [number, number, number];
  initialTarget?: [number, number, number];
  token?: string;
}

export function EmbedViewer({
  projectId,
  url,
  title,
  showControls = true,
  showBranding = true,
  showTitle = true,
  showGrid = true,
  wallColor,
  floorColor,
  wallTexture,
  floorTexture,
  initialCamera,
  initialTarget,
  token,
}: EmbedViewerProps) {
  return (
    <div className="relative w-full h-full">
      <Scene
        className="w-full h-full"
        showGrid={showGrid}
        initialCamera={initialCamera}
        initialTarget={initialTarget}
      >
        <Suspense fallback={null}>
          <ModelViewer
            url={url}
            wallColor={wallColor}
            floorColor={floorColor}
            wallTexture={wallTexture}
            floorTexture={floorTexture}
          />
        </Suspense>
      </Scene>

      {showControls && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
          <div className="text-xs text-gray-400 truncate">
            {showTitle ? title : null}
          </div>
          {showBranding && (
            <a
              href={
                token
                  ? `/view/${projectId}?token=${encodeURIComponent(token)}`
                  : `/view/${projectId}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-gray-500 hover:text-gray-300 transition"
            >
              Powered by Imbaa3D
            </a>
          )}
        </div>
      )}
      {!showControls && showBranding && (
        <div className="absolute bottom-3 right-3 pointer-events-auto">
          <a
            href={
              token
                ? `/view/${projectId}?token=${encodeURIComponent(token)}`
                : `/view/${projectId}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-500 hover:text-gray-300 transition"
          >
            Powered by Imbaa3D
          </a>
        </div>
      )}
    </div>
  );
}
