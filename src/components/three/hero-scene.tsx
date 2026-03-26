"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment } from "@react-three/drei";
import * as THREE from "three";

function FloatingBuilding() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <group ref={meshRef}>
        {/* Base */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[2, 0.2, 2]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.5} roughness={0.2} />
        </mesh>
        {/* Walls */}
        <mesh position={[-0.9, 0.7, 0]}>
          <boxGeometry args={[0.1, 1.2, 2]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.1} roughness={0.7} />
        </mesh>
        <mesh position={[0.9, 0.7, 0]}>
          <boxGeometry args={[0.1, 1.2, 2]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.1} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.7, -0.9]}>
          <boxGeometry args={[1.8, 1.2, 0.1]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.1} roughness={0.7} />
        </mesh>
        {/* Roof */}
        <mesh position={[0, 1.4, 0]}>
          <boxGeometry args={[2.2, 0.15, 2.2]} />
          <meshStandardMaterial color="#1e40af" metalness={0.3} roughness={0.4} />
        </mesh>
        {/* Floor accent */}
        <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.7, 1.7]} />
          <meshStandardMaterial color="#93c5fd" metalness={0.0} roughness={0.9} />
        </mesh>
      </group>
    </Float>
  );
}

export function HeroScene() {
  return (
    <Canvas
      camera={{ position: [4, 3, 4], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <Environment preset="night" />
      <FloatingBuilding />
    </Canvas>
  );
}
