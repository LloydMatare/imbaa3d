"use client";

import { useCallback, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Line, Html } from "@react-three/drei";

interface MeasurementPoint {
  position: THREE.Vector3;
}

interface MeasureToolProps {
  enabled: boolean;
  onComplete?: (distance: number) => void;
}

export function MeasureTool({ enabled, onComplete }: MeasureToolProps) {
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [previewPoint, setPreviewPoint] = useState<THREE.Vector3 | null>(null);
  const { camera, raycaster, scene, gl } = useThree();

  const handleClick = useCallback(
    (event: THREE.Event) => {
      if (!enabled) return;

      const mouseEvent = event as unknown as MouseEvent;
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((mouseEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((mouseEvent.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const point = intersects[0]!.point.clone();

        if (points.length === 0) {
          setPoints([{ position: point }]);
        } else if (points.length === 1) {
          const newPoints = [points[0]!, { position: point }];
          setPoints(newPoints);

          // Calculate distance
          const distance = newPoints[0]!.position.distanceTo(
            newPoints[1]!.position
          );
          if (onComplete) {
            onComplete(distance);
          }

          // Reset for next measurement
          setTimeout(() => setPoints([]), 2000);
        }
      }
    },
    [enabled, points, camera, raycaster, scene, gl, onComplete]
  );

  const handleMouseMove = useCallback(
    (event: THREE.Event) => {
      if (!enabled || points.length !== 1) {
        setPreviewPoint(null);
        return;
      }

      const mouseEvent = event as unknown as MouseEvent;
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((mouseEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((mouseEvent.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        setPreviewPoint(intersects[0]!.point.clone());
      } else {
        setPreviewPoint(null);
      }
    },
    [enabled, points, camera, raycaster, scene, gl]
  );

  if (!enabled) return null;

  return (
    <group>
      {/* Measurement points */}
      {points.map((p, i) => (
        <mesh key={i} position={p.position}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      ))}

      {/* Measurement line */}
      {points.length === 2 && (
        <>
          <Line
            points={[points[0]!.position, points[1]!.position]}
            color="#22c55e"
            lineWidth={2}
            dashed={false}
          />
          <Html
            position={[
              (points[0]!.position.x + points[1]!.position.x) / 2,
              Math.max(points[0]!.position.y, points[1]!.position.y) + 0.2,
              (points[0]!.position.z + points[1]!.position.z) / 2,
            ]}
            center
          >
            <div className="bg-gray-950/90 border border-emerald-700/60 text-emerald-200 text-xs px-2 py-1 rounded-md whitespace-nowrap">
              {points[0]!.position
                .distanceTo(points[1]!.position)
                .toFixed(2)}{" "}
              m
            </div>
          </Html>
        </>
      )}

      {/* Preview line while measuring */}
      {points.length === 1 && previewPoint && (
        <>
          <Line
            points={[points[0]!.position, previewPoint]}
            color="#22c55e"
            lineWidth={1}
            dashed
            dashSize={0.05}
            gapSize={0.03}
          />
          <Html
            position={[
              (points[0]!.position.x + previewPoint.x) / 2,
              Math.max(points[0]!.position.y, previewPoint.y) + 0.2,
              (points[0]!.position.z + previewPoint.z) / 2,
            ]}
            center
          >
            <div className="bg-gray-950/90 border border-gray-700 text-gray-300 text-xs px-2 py-1 rounded-md whitespace-nowrap">
              {points[0]!.position.distanceTo(previewPoint).toFixed(2)} m
            </div>
          </Html>
        </>
      )}

      {/* Click handler - invisible plane to capture clicks */}
      {enabled && (
        <mesh
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={handleClick}
          onPointerMove={handleMouseMove}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}

// Toggle button component
export function MeasureToggle({
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
          ? "border-emerald-700 bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30"
          : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
      ].join(" ")}
      title={enabled ? "Exit measure mode" : "Enter measure mode (click two points)"}
    >
      {enabled ? "Measuring..." : "Measure"}
    </button>
  );
}
