"use client";

import { Suspense, useEffect, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  getProceduralTexture,
  type TexturePreset,
} from "@/lib/three/procedural-textures";

interface ModelViewerProps {
  url: string;
  wallColor?: number;
  floorColor?: number;
  wallTexture?: TexturePreset;
  floorTexture?: TexturePreset;
  showCeiling?: boolean;
  onModelLoaded?: (boundingBox: import("three").Box3) => void;
}

function ModelContent({
  url,
  wallColor,
  floorColor,
  wallTexture,
  floorTexture,
  showCeiling = true,
  onModelLoaded,
}: ModelViewerProps) {
  const { scene } = useGLTF(url);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!scene) return;

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (!mat.color) return;

        const brightness = (mat.color.r + mat.color.g + mat.color.b) / 3;
        const r = mat.color.r;
        const g = mat.color.g;
        const b = mat.color.b;

        // Wall meshes: high brightness (white/cream/gray walls)
        if (brightness > 0.8) {
          if (wallColor !== undefined) {
            mat.color.setHex(wallColor);
          }
          if (wallTexture && wallTexture !== "none") {
            const tex = getProceduralTexture(wallTexture);
            if (tex) {
              mat.map = tex;
              mat.needsUpdate = true;
            }
          } else if (!wallTexture || wallTexture === "none") {
            if (mat.map) {
              mat.map = null;
              mat.needsUpdate = true;
            }
          }
        }

        // Floor meshes: warm tones (r > 0.6, g > 0.4, b < 0.4)
        if (r > 0.6 && g > 0.4 && b < 0.4) {
          if (floorColor !== undefined) {
            mat.color.setHex(floorColor);
          }
          if (floorTexture && floorTexture !== "none") {
            const tex = getProceduralTexture(floorTexture);
            if (tex) {
              mat.map = tex;
              mat.needsUpdate = true;
            }
          } else if (!floorTexture || floorTexture === "none") {
            if (mat.map) {
              mat.map = null;
              mat.needsUpdate = true;
            }
          }
        }

        // Ceiling meshes
        if (child.name === "ceiling") {
          child.visible = showCeiling;
        }
      }
    });

    appliedRef.current = true;

    // Compute bounding box and notify
    if (onModelLoaded) {
      const boundingBox = new THREE.Box3().setFromObject(scene);
      onModelLoaded(boundingBox);
    }
  }, [scene, wallColor, floorColor, wallTexture, floorTexture, showCeiling, onModelLoaded]);

  return <primitive object={scene} />;
}

export function ModelViewer(props: ModelViewerProps) {
  return (
    <Suspense fallback={null}>
      <ModelContent {...props} />
    </Suspense>
  );
}
