"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";

interface FirstPersonControlsProps {
  moveSpeed?: number;
  enabled?: boolean;
}

export function FirstPersonControls({
  moveSpeed = 0.1,
  enabled = true,
}: FirstPersonControlsProps) {
  const controlsRef = useRef<React.ElementRef<typeof PointerLockControls>>(null);
  const [isLocked, setIsLocked] = useState(false);
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());
  const keys = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isLocked) return;
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          keys.current.forward = true;
          break;
        case "KeyS":
        case "ArrowDown":
          keys.current.backward = true;
          break;
        case "KeyA":
        case "ArrowLeft":
          keys.current.left = true;
          break;
        case "KeyD":
        case "ArrowRight":
          keys.current.right = true;
          break;
      }
    },
    [isLocked]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!isLocked) return;
      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          keys.current.forward = false;
          break;
        case "KeyS":
        case "ArrowDown":
          keys.current.backward = false;
          break;
        case "KeyA":
        case "ArrowLeft":
          keys.current.left = false;
          break;
        case "KeyD":
        case "ArrowRight":
          keys.current.right = false;
          break;
      }
    },
    [isLocked]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, handleKeyDown, handleKeyUp]);

  useEffect(() => {
    if (!isLocked) return;

    let animationId: number;
    const animate = () => {
      const controls = controlsRef.current;
      if (!controls) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      direction.current.set(0, 0, 0);

      if (keys.current.forward) direction.current.z -= 1;
      if (keys.current.backward) direction.current.z += 1;
      if (keys.current.left) direction.current.x -= 1;
      if (keys.current.right) direction.current.x += 1;

      direction.current.normalize();

      // Get camera direction
      const camera = controls.getObject();
      const euler = new THREE.Euler();
      euler.setFromQuaternion(camera.quaternion);

      // Move in camera direction
      velocity.current.x = -direction.current.x * moveSpeed;
      velocity.current.z = -direction.current.z * moveSpeed;

      // Apply rotation to movement
      const moveX =
        velocity.current.x * Math.cos(euler.y) -
        velocity.current.z * Math.sin(euler.y);
      const moveZ =
        velocity.current.x * Math.sin(euler.y) +
        velocity.current.z * Math.cos(euler.y);

      camera.position.x += moveX;
      camera.position.z += moveZ;

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isLocked, moveSpeed]);

  if (!enabled) return null;

  return (
    <>
      <PointerLockControls
        ref={controlsRef}
        onLock={() => setIsLocked(true)}
        onUnlock={() => setIsLocked(false)}
      />
      {isLocked && (
        <mesh position={[0, 0, -2]}>
          <ringGeometry args={[0.05, 0.07, 32]} />
          <meshBasicMaterial color="white" transparent opacity={0.8} />
        </mesh>
      )}
    </>
  );
}

// Walkthrough mode toggle button component
export function WalkthroughToggle({
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
      title={enabled ? "Exit walkthrough mode (Esc)" : "Enter walkthrough mode (WASD to move)"}
    >
      {enabled ? "Exit Walk" : "Walk"}
    </button>
  );
}
