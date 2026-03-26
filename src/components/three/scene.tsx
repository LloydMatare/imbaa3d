"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Grid } from "@react-three/drei";

interface SceneProps {
  children?: React.ReactNode;
  className?: string;
}

export function Scene({ children, className }: SceneProps) {
  return (
    <Canvas
      className={className}
      camera={{ position: [5, 5, 5], fov: 50 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <Environment preset="city" />
        {children}
        <Grid
          infiniteGrid
          cellSize={1}
          sectionSize={5}
          fadeDistance={30}
          cellColor="#1a1a2e"
          sectionColor="#2a2a4e"
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={2}
          maxDistance={50}
        />
      </Suspense>
    </Canvas>
  );
}
