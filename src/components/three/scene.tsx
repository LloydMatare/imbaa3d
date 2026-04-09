"use client";

import { Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MOUSE } from "three";
import type { RefObject } from "react";

interface SceneProps {
  children?: React.ReactNode;
  className?: string;
  controlsRef?: RefObject<OrbitControlsImpl | null>;
  showGrid?: boolean;
  onReady?: (payload: { gl: import("three").WebGLRenderer }) => void;
  initialCamera?: [number, number, number];
  initialTarget?: [number, number, number];
}

function CameraInitializer({
  position,
  target,
  controlsRef,
}: {
  position?: [number, number, number];
  target?: [number, number, number];
  controlsRef?: RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const posKey = position ? position.join(",") : "";
  const targetKey = target ? target.join(",") : "";

  useEffect(() => {
    if (position) {
      camera.position.set(position[0], position[1], position[2]);
    }
    if (target) {
      if (controlsRef?.current) {
        controlsRef.current.target.set(target[0], target[1], target[2]);
        controlsRef.current.update();
      } else {
        camera.lookAt(target[0], target[1], target[2]);
      }
    }
  }, [camera, posKey, targetKey, controlsRef, position, target]);

  return null;
}

export function Scene({
  children,
  className,
  controlsRef,
  showGrid = true,
  onReady,
  initialCamera,
  initialTarget,
}: SceneProps) {
  return (
    <Canvas
      className={className}
      camera={{ position: [5, 5, 5], fov: 50 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => {
        onReady?.({ gl });
      }}
    >
      <Suspense fallback={null}>
        {(initialCamera || initialTarget) && (
          <CameraInitializer
            position={initialCamera}
            target={initialTarget}
            controlsRef={controlsRef}
          />
        )}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Environment preset="city" />
        {children}
        {showGrid && (
          <Grid
            infiniteGrid
            cellSize={1}
            sectionSize={5}
            fadeDistance={30}
            cellColor="#1a1a2e"
            sectionColor="#2a2a4e"
          />
        )}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={2}
          maxDistance={50}
          enablePan={true}
          mouseButtons={{
            LEFT: 2, // PAN
            MIDDLE: 1, // ZOOM
            RIGHT: 0, // ROTATE
          } as any}
        />
      </Suspense>
    </Canvas>
  );
}
