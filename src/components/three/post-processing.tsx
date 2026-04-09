"use client";

import { Suspense } from "react";
import * as THREE from "three";
import {
  EffectComposer,
  SSAO,
  SMAA,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

interface PostProcessingProps {
  enabled?: boolean;
}

export function PostProcessing({ enabled = true }: PostProcessingProps) {
  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <EffectComposer multisampling={0} enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={16}
          radius={0.05}
          intensity={25}
          luminanceInfluence={0.6}
          color={new THREE.Color(0x000000)}
        />
        <SMAA />
      </EffectComposer>
    </Suspense>
  );
}

// Toggle button component
export function PostProcessingToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={[
        "px-2.5 py-1 rounded-md text-[11px] border transition",
        enabled
          ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
          : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
      ].join(" ")}
      title={enabled ? "Disable post-processing" : "Enable post-processing"}
    >
      FX
    </button>
  );
}
