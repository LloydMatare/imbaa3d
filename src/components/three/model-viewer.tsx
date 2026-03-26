"use client";

import { useGLTF } from "@react-three/drei";

interface ModelViewerProps {
  url: string;
}

export function ModelViewer({ url }: ModelViewerProps) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}
