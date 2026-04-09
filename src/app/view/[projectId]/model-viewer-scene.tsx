"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGLTF, useProgress } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Scene } from "@/components/three/scene";
import { ModelViewer } from "@/components/three/model-viewer";
import {
  FirstPersonControls,
  WalkthroughToggle,
} from "@/components/three/first-person-controls";
import { MeasureTool, MeasureToggle } from "@/components/three/measure-tool";
import {
  PostProcessing,
  PostProcessingToggle,
} from "@/components/three/post-processing";
import {
  DimensionLabels,
  DimensionToggle,
} from "@/components/three/dimension-labels";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FloorPlanDocV3 } from "@/lib/floorplan/types";
import {
  TEXTURE_DEFS,
  type TexturePreset,
} from "@/lib/three/procedural-textures";
import { furnitureModels } from "@/lib/furniture-models";
import { toast } from "sonner";
import { Mesh, MeshStandardMaterial, Vector3, Box3 } from "three";
import * as THREE from "three";

type RenderRefs = {
  gl: import("three").WebGLRenderer;
  scene: import("three").Scene;
  camera: import("three").Camera;
};

function CaptureBridge({ onReady }: { onReady: (refs: RenderRefs) => void }) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    onReady({ gl, scene, camera });
  }, [gl, scene, camera, onReady]);

  return null;
}

function LoadingOverlay() {
  const { active, progress, item, errors } = useProgress();
  if (!active && (!errors || errors.length === 0)) return null;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="rounded-xl border border-gray-800 bg-gray-950/80 backdrop-blur-sm px-4 py-3">
        <div className="text-xs text-gray-200">
          {errors && errors.length > 0 ? "Failed to load model" : "Loading 3D model"}
        </div>
        {errors && errors.length > 0 ? (
          <div className="mt-1 text-[11px] text-gray-500 max-w-[320px]">
            {String(errors[0]).slice(0, 160)}
          </div>
        ) : (
          <>
            <div className="mt-1 text-[11px] text-gray-500 max-w-[320px] truncate">
              {item ? String(item) : "Fetching assets..."}
            </div>
            <div className="mt-2 h-1.5 w-[240px] rounded-full bg-gray-900 overflow-hidden">
              <div
                className="h-full bg-blue-600"
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-gray-600">{Math.round(progress)}%</div>
          </>
        )}
      </div>
    </div>
  );
}

function DropHandler({ onDrop }: { onDrop: (type: FurnitureType, position: Vector3) => void }) {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const handleDrop = useCallback((e: Event) => {
    const de = e as DragEvent;
    de.preventDefault();
    if (!de.dataTransfer) return;
    const type = de.dataTransfer.getData('text/plain') as FurnitureType;
    if (!FURNITURE_PRESETS[type]) return;

    const rect = gl.domElement.getBoundingClientRect();
    const x = ((de.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((de.clientY - rect.top) / rect.height) * 2 + 1;

    const mouse = new THREE.Vector2(x, y);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    const floorIntersect = intersects.find(i => i.object.userData.isFloor);
    if (floorIntersect) {
      onDrop(type, floorIntersect.point);
    }
  }, [camera, scene, gl, raycaster, onDrop]);

  const handleDragOver = useCallback((e: Event) => {
    (e as DragEvent).preventDefault();
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('drop', handleDrop);
    canvas.addEventListener('dragover', handleDragOver);
    return () => {
      canvas.removeEventListener('drop', handleDrop);
      canvas.removeEventListener('dragover', handleDragOver);
    };
  }, [gl, handleDrop, handleDragOver]);

  return null;
}

type CameraPreset = "perspective" | "top" | "front" | "side";

const PRESETS: { key: CameraPreset; label: string; position: [number, number, number]; target: [number, number, number] }[] = [
  { key: "perspective", label: "Perspective", position: [5, 5, 5], target: [0, 0, 0] },
  { key: "top", label: "Top", position: [0, 10, 0.001], target: [0, 0, 0] },
  { key: "front", label: "Front", position: [0, 2, 10], target: [0, 0, 0] },
  { key: "side", label: "Side", position: [10, 2, 0], target: [0, 0, 0] },
];

const WALL_COLORS = [
  { label: "White", hex: 0xffffff },
  { label: "Cream", hex: 0xf5f5dc },
  { label: "Gray", hex: 0x808080 },
  { label: "Blue", hex: 0x4a90d9 },
  { label: "Green", hex: 0x5cb85c },
];

const FLOOR_COLORS = [
  { label: "Oak", hex: 0xc8a87e },
  { label: "Walnut", hex: 0x5c4033 },
  { label: "Maple", hex: 0xd4a76a },
  { label: "Gray", hex: 0x888888 },
  { label: "White", hex: 0xf0f0f0 },
];

const STAGING_COLORS = [
  "#8b7355",
  "#6b8e6b",
  "#4b6b8b",
  "#b38a5d",
  "#8b5d5d",
  "#cccccc",
  "#2e2e2e",
  "#f3f4f6",
];

export function ModelViewerScene({
  url,
  floorPlanData,
  sceneConfig,
  projectId,
  canSaveThumbnail,
  canExportImage,
  canEditStaging,
}: {
  url: string;
  floorPlanData?: FloorPlanDocV3 | null;
  sceneConfig?: unknown;
  projectId?: string;
  canSaveThumbnail?: boolean;
  canExportImage?: boolean;
  canEditStaging?: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPreset>("perspective");
  const [showGrid, setShowGrid] = useState(true);
  const [wallColor, setWallColor] = useState<number | undefined>(undefined);
  const [floorColor, setFloorColor] = useState<number | undefined>(undefined);
  const [wallTexture, setWallTexture] = useState<TexturePreset>("none");
  const [floorTexture, setFloorTexture] = useState<TexturePreset>("none");
  const [showMaterials, setShowMaterials] = useState(false);
  const [showCeiling, setShowCeiling] = useState(true);
  const [walkthroughMode, setWalkthroughMode] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [lastMeasurement, setLastMeasurement] = useState<number | null>(null);
  const [postProcessing, setPostProcessing] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [savingThumb, setSavingThumb] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);
  const [stagingOpen, setStagingOpen] = useState(false);
  const [stagingDirty, setStagingDirty] = useState(false);
  const [savingStaging, setSavingStaging] = useState(false);
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [collisionId, setCollisionId] = useState<string | null>(null);
  const [arMode, setArMode] = useState(false);
  const { active } = useProgress();
  const renderRef = useRef<RenderRefs | null>(null);
  const lastValidPosition = useRef<Record<string, StagedItem["position"]>>({});

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const startPos = ctrl.object.position.clone();
    const endPos = { x: preset.position[0], y: preset.position[1], z: preset.position[2] };
    const startTarget = ctrl.target.clone();
    const endTarget = { x: preset.target[0], y: preset.target[1], z: preset.target[2] };

    const duration = 500;
    const startTime = performance.now();
    const camera = ctrl.object;
    const target = ctrl.target;

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      camera.position.set(
        startPos.x + (endPos.x - startPos.x) * ease,
        startPos.y + (endPos.y - startPos.y) * ease,
        startPos.z + (endPos.z - startPos.z) * ease,
      );
      target.set(
        startTarget.x + (endTarget.x - startTarget.x) * ease,
        startTarget.y + (endTarget.y - startTarget.y) * ease,
        startTarget.z + (endTarget.z - startTarget.z) * ease,
      );

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
    setActivePreset(preset.key);
  }, []);

  const handleSaveThumbnail = useCallback(async () => {
    if (!projectId) return;
    if (active) {
      toast.error("Wait for the model to finish loading.");
      return;
    }
    if (!renderRef.current) {
      toast.error("Viewer not ready yet.");
      return;
    }
    setSavingThumb(true);
    try {
      const renderer = renderRef.current.gl;
      const prevPixelRatio = renderer.getPixelRatio();
      renderer.setPixelRatio(2);
      renderer.render(
        renderRef.current.scene,
        renderRef.current.camera
      );
      const dataUrl = renderer.domElement.toDataURL("image/png");
      renderer.setPixelRatio(prevPixelRatio);
      const res = await fetch(`/api/projects/${projectId}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save thumbnail");
      }
      toast.success("Thumbnail saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save thumbnail";
      toast.error(msg);
    } finally {
      setSavingThumb(false);
    }
  }, [projectId, active]);

  const handleExportImage = useCallback(async (highRes = false) => {
    if (active) {
      toast.error("Wait for the model to finish loading.");
      return;
    }
    if (!renderRef.current) {
      toast.error("Viewer not ready yet.");
      return;
    }
    setExportingImage(true);
    try {
      const renderer = renderRef.current.gl;
      const prevPixelRatio = renderer.getPixelRatio();
      renderer.setPixelRatio(highRes ? 4 : 2);
      renderer.render(renderRef.current.scene, renderRef.current.camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      renderer.setPixelRatio(prevPixelRatio);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `scene-export${highRes ? '-highres' : ''}-${Date.now()}.png`;
      a.click();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to export image";
      toast.error(msg);
    } finally {
      setExportingImage(false);
    }
  }, [active]);

  useEffect(() => {
    const parsed = parseSceneConfig(sceneConfig);
    if (parsed) {
      setStagedItems(parsed.furniture);
    }
  }, [sceneConfig]);

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.enabled = !(draggingId || placingId);
  }, [draggingId, placingId]);

  const handleAddStaging = useCallback((type: FurnitureType, position?: { x: number; y: number; z: number }) => {
    const def = FURNITURE_PRESETS[type];
    if (!def) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `stg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const next: StagedItem = {
      id,
      type,
      position: position ?? { x: 0, y: def.size[1] / 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      color: def.color,
      scale: def.scale ?? 1,
    };
    lastValidPosition.current[id] = next.position;
    setStagedItems((items) => [...items, next]);
    setSelectedItemId(id);
    if (!position) {
      setPlacingId(id);
    }
    setStagingDirty(true);
    setStagingOpen(true);
  }, []);

  const handleDrop = useCallback((type: FurnitureType, point: Vector3) => {
    const def = FURNITURE_PRESETS[type];
    const position = { x: point.x, y: def.size[1] / 2, z: point.z };
    handleAddStaging(type, position);
  }, [handleAddStaging]);

  const handleSaveStaging = useCallback(async () => {
    if (!projectId) return;
    setSavingStaging(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneConfig: { furniture: stagedItems } }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error || "Failed to save layout");
      setStagingDirty(false);
      toast.success("Staging layout saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save layout";
      toast.error(msg);
    } finally {
      setSavingStaging(false);
    }
  }, [projectId, stagedItems]);

  const selectedItem = stagedItems.find((i) => i.id === selectedItemId) ?? null;

  const resolveItemDef = (item: StagedItem) => FURNITURE_PRESETS[item.type];

  const checkCollision = useCallback(
    (id: string, position: StagedItem["position"]) => {
      const moving = stagedItems.find((it) => it.id === id);
      if (!moving) return false;
      const movingDef = resolveItemDef(moving);
      if (!movingDef) return false;
      const sizeA = movingDef.size;
      return stagedItems.some((it) => {
        if (it.id === id) return false;
        const def = resolveItemDef(it);
        if (!def) return false;
        const sizeB = def.size;
        const dx = Math.abs(position.x - it.position.x);
        const dz = Math.abs(position.z - it.position.z);
        const dy = Math.abs(position.y - it.position.y);
        return (
          dx < (sizeA[0] + sizeB[0]) / 2 &&
          dz < (sizeA[2] + sizeB[2]) / 2 &&
          dy < (sizeA[1] + sizeB[1]) / 2
        );
      });
    },
    [stagedItems]
  );

  const tryUpdateItemPosition = useCallback(
    (id: string, position: StagedItem["position"], snapToFloor = true) => {
      const item = stagedItems.find((it) => it.id === id);
      if (!item) return false;
      const def = resolveItemDef(item);
      if (!def) return false;
      const next: StagedItem["position"] = {
        x: position.x,
        y: snapToFloor ? def.size[1] / 2 : position.y,
        z: position.z,
      };
      if (checkCollision(id, next)) {
        setCollisionId(id);
        return false;
      }
      setCollisionId(null);
      setStagedItems((items) =>
        items.map((it) => (it.id === id ? { ...it, position: next } : it))
      );
      lastValidPosition.current[id] = next;
      setStagingDirty(true);
      return true;
    },
    [checkCollision, stagedItems]
  );

  const updateSelected = (patch: Partial<StagedItem>) => {
    if (!selectedItem) return;
    setStagedItems((items) =>
      items.map((it) => (it.id === selectedItem.id ? { ...it, ...patch } : it))
    );
    setStagingDirty(true);
  };

  const updateSelectedPosition = (patch: Partial<StagedItem["position"]>) => {
    if (!selectedItem) return;
    const next = { ...selectedItem.position, ...patch };
    tryUpdateItemPosition(selectedItem.id, next, false);
  };

  const updateSelectedRotation = (patch: Partial<StagedItem["rotation"]>) => {
    if (!selectedItem) return;
    setStagedItems((items) =>
      items.map((it) =>
        it.id === selectedItem.id
          ? { ...it, rotation: { ...it.rotation, ...patch } }
          : it
      )
    );
    setStagingDirty(true);
  };

  const handleDeleteSelected = () => {
    if (!selectedItem) return;
    delete lastValidPosition.current[selectedItem.id];
    setStagedItems((items) => items.filter((it) => it.id !== selectedItem.id));
    setSelectedItemId(null);
    setStagingDirty(true);
  };

  useEffect(() => {
    if (!draggingId && !placingId) return;
    const handleUp = () => {
      setDraggingId(null);
      if (placingId) {
        setPlacingId(null);
      }
    };
    window.addEventListener("pointerup", handleUp);
    return () => window.removeEventListener("pointerup", handleUp);
  }, [draggingId, placingId]);

  return (
    <div className="relative w-full h-full">
      <Scene
        className="w-full h-full"
        controlsRef={controlsRef}
        showGrid={showGrid}
        onReady={({ gl }) => {
          if (renderRef.current) {
            renderRef.current = { ...renderRef.current, gl };
          }
        }}
      >
        <CaptureBridge onReady={(refs) => (renderRef.current = refs)} />
        <ModelViewer
          url={url}
          wallColor={wallColor}
          floorColor={floorColor}
          wallTexture={wallTexture}
          floorTexture={floorTexture}
          showCeiling={showCeiling}
          onModelLoaded={(boundingBox: Box3) => {
            if (controlsRef.current) {
              const center = boundingBox.getCenter(new THREE.Vector3());
              controlsRef.current.target.copy(center);
              controlsRef.current.update();
            }
          }}
        />
        <StagingGround
          active={Boolean(draggingId || placingId)}
          onMove={(point) => {
            if (!placingId) return;
            tryUpdateItemPosition(placingId, { x: point.x, y: point.y, z: point.z }, true);
          }}
          onDown={(point) => {
            if (!placingId) return;
            tryUpdateItemPosition(placingId, { x: point.x, y: point.y, z: point.z }, true);
            setPlacingId(null);
          }}
        />
        <StagedFurniture
          items={stagedItems}
          selectedId={selectedItemId}
          collisionId={collisionId}
          draggingId={draggingId}
          onSelect={(id) => setSelectedItemId(id)}
          onDragStart={(id) => {
            setSelectedItemId(id);
            setDraggingId(id);
            setCollisionId(null);
          }}
          onDragMove={(id, point) => {
            tryUpdateItemPosition(id, point, true);
          }}
          onDragEnd={(id) => {
            if (collisionId && lastValidPosition.current[id]) {
              setStagedItems((items) =>
                items.map((it) =>
                  it.id === id
                    ? { ...it, position: lastValidPosition.current[id]! }
                    : it
                )
              );
            }
            setDraggingId(null);
            setCollisionId(null);
          }}
        />
        <DropHandler onDrop={handleDrop} />
        <FirstPersonControls enabled={walkthroughMode} />
        <MeasureTool
          enabled={measureMode}
          onComplete={(d) => setLastMeasurement(d)}
        />
        <PostProcessing enabled={postProcessing} />
        {floorPlanData && (
          <DimensionLabels doc={floorPlanData} show={showDimensions} />
        )}
      </Scene>
      <LoadingOverlay />

      {/* Controls overlay */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-2 pointer-events-auto">
        {/* Camera presets */}
        <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-950/80 backdrop-blur-sm p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              className={[
                "px-2.5 py-1 rounded-md text-[11px] transition",
                activePreset === p.key
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800",
              ].join(" ")}
              title={`Set ${p.label} view`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid((v) => !v)}
          className={[
            "self-start px-2.5 py-1 rounded-md text-[11px] border transition",
            showGrid
              ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
              : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
          ].join(" ")}
          title={showGrid ? "Hide grid" : "Show grid"}
        >
          Grid
        </button>

        {/* Ceiling toggle */}
        <button
          onClick={() => setShowCeiling((v) => !v)}
          className={[
            "self-start px-2.5 py-1 rounded-md text-[11px] border transition",
            showCeiling
              ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
              : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
          ].join(" ")}
          title={showCeiling ? "Hide ceiling" : "Show ceiling"}
        >
          Ceiling
        </button>

        {/* Walkthrough toggle */}
        <WalkthroughToggle
          enabled={walkthroughMode}
          onToggle={() => setWalkthroughMode((v) => !v)}
        />

        {/* Measure toggle */}
        <MeasureToggle
          enabled={measureMode}
          onToggle={() => setMeasureMode((v) => !v)}
        />

        {/* Dimension labels toggle */}
        {floorPlanData && (
          <DimensionToggle
            enabled={showDimensions}
            onToggle={() => setShowDimensions((v) => !v)}
          />
        )}

        {/* AR toggle */}
        <button
          onClick={() => setArMode((v) => !v)}
          className={[
            "self-start px-2.5 py-1 rounded-md text-[11px] border transition",
            arMode
              ? "border-blue-700 bg-blue-800 text-blue-200 hover:bg-blue-700"
              : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
          ].join(" ")}
          title={arMode ? "Exit AR mode" : "Enter AR mode (requires WebXR support)"}
        >
          AR
        </button>

        {/* Last measurement display */}
        {lastMeasurement !== null && !measureMode && (
          <div className="self-start px-2.5 py-1 rounded-md text-[11px] border border-gray-800 bg-gray-950/80 text-gray-300">
            Last: {lastMeasurement.toFixed(2)} m
          </div>
        )}

        {/* Materials toggle */}
        <button
          onClick={() => setShowMaterials((v) => !v)}
          className={[
            "self-start px-2.5 py-1 rounded-md text-[11px] border transition",
            showMaterials
              ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
              : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
          ].join(" ")}
          title={showMaterials ? "Hide materials" : "Show materials"}
        >
          Materials
        </button>

        {/* Post-processing toggle */}
        <PostProcessingToggle
          enabled={postProcessing}
          onToggle={() => setPostProcessing((v) => !v)}
        />

        {canEditStaging && (
          <button
            onClick={() => setStagingOpen((v) => !v)}
            className={[
              "self-start px-2.5 py-1 rounded-md text-[11px] border transition",
              stagingOpen
                ? "border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
                : "border-gray-800 bg-gray-950/80 text-gray-500 hover:text-gray-300 hover:bg-gray-800",
            ].join(" ")}
            title="Virtual staging"
          >
            Staging
          </button>
        )}

        {/* Material panel */}
        {showMaterials && (
          <div className="rounded-lg border border-gray-800 bg-gray-950/90 backdrop-blur-sm p-3 space-y-3 min-w-[160px]">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Wall Color</div>
              <div className="flex gap-1.5">
                {WALL_COLORS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setWallColor(c.hex === wallColor ? undefined : c.hex)}
                    className={[
                      "w-6 h-6 rounded-md border transition",
                      wallColor === c.hex
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : "border-gray-700 hover:border-gray-500",
                    ].join(" ")}
                    style={{ backgroundColor: `#${c.hex.toString(16).padStart(6, "0")}` }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Floor Color</div>
              <div className="flex gap-1.5">
                {FLOOR_COLORS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setFloorColor(c.hex === floorColor ? undefined : c.hex)}
                    className={[
                      "w-6 h-6 rounded-md border transition",
                      floorColor === c.hex
                        ? "border-blue-500 ring-1 ring-blue-500"
                        : "border-gray-700 hover:border-gray-500",
                    ].join(" ")}
                    style={{ backgroundColor: `#${c.hex.toString(16).padStart(6, "0")}` }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Wall Texture</div>
              <div className="flex flex-wrap gap-1">
                {(Object.entries(TEXTURE_DEFS) as [TexturePreset, typeof TEXTURE_DEFS[keyof typeof TEXTURE_DEFS]][])
                  .filter(([, def]) => def.type === "wall" || def.type === "both")
                  .map(([key, def]) => (
                    <button
                      key={key}
                      onClick={() => setWallTexture(wallTexture === key ? "none" : key)}
                      className={[
                        "px-1.5 py-0.5 rounded text-[10px] border transition",
                        wallTexture === key
                          ? "border-blue-500 bg-blue-600/20 text-blue-300"
                          : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500",
                      ].join(" ")}
                      title={def.label}
                    >
                      {def.label}
                    </button>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Floor Texture</div>
              <div className="flex flex-wrap gap-1">
                {(Object.entries(TEXTURE_DEFS) as [TexturePreset, typeof TEXTURE_DEFS[keyof typeof TEXTURE_DEFS]][])
                  .filter(([, def]) => def.type === "floor" || def.type === "both")
                  .map(([key, def]) => (
                    <button
                      key={key}
                      onClick={() => setFloorTexture(floorTexture === key ? "none" : key)}
                      className={[
                        "px-1.5 py-0.5 rounded text-[10px] border transition",
                        floorTexture === key
                          ? "border-blue-500 bg-blue-600/20 text-blue-300"
                          : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500",
                      ].join(" ")}
                      title={def.label}
                    >
                      {def.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {(canSaveThumbnail || canExportImage) && (
        <div className="absolute bottom-4 right-4 pointer-events-auto flex items-center gap-2">
          {canExportImage && (
            <>
              <button
                onClick={() => handleExportImage(false)}
                disabled={exportingImage}
                className={[
                  "px-3 py-1.5 rounded-md text-[11px] border transition",
                  exportingImage
                    ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                    : "border-gray-700/60 bg-gray-900/60 text-gray-200 hover:bg-gray-800",
                ].join(" ")}
                title="Export a PNG snapshot"
              >
                {exportingImage ? "Exporting..." : "Export PNG"}
              </button>
              <button
                onClick={() => handleExportImage(true)}
                disabled={exportingImage}
                className={[
                  "px-3 py-1.5 rounded-md text-[11px] border transition",
                  exportingImage
                    ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                    : "border-gray-700/60 bg-gray-900/60 text-gray-200 hover:bg-gray-800",
                ].join(" ")}
                title="Export a high-resolution PNG snapshot"
              >
                {exportingImage ? "Exporting..." : "Export High-Res"}
              </button>
            </>
          )}
          {canSaveThumbnail && projectId && (
            <button
              onClick={handleSaveThumbnail}
              disabled={savingThumb}
              className={[
                "px-3 py-1.5 rounded-md text-[11px] border transition",
                savingThumb
                  ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                  : "border-emerald-700/60 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25",
              ].join(" ")}
              title="Save a new thumbnail for dashboard and sharing previews"
            >
              {savingThumb ? "Saving..." : "Save thumbnail"}
            </button>
          )}
        </div>
      )}

      {canEditStaging && stagingOpen && (
        <div className="absolute top-4 right-4 w-72 rounded-xl border border-gray-800 bg-gray-950/95 backdrop-blur-sm p-3 z-40 pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-white">Virtual Staging</div>
            <button
              onClick={() => setStagingOpen(false)}
              className="text-[11px] text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] text-gray-400">Add furniture</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(FURNITURE_PRESETS).map(([key, def]) => (
                <button
                  key={key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', key);
                  }}
                  onClick={() => handleAddStaging(key as FurnitureType)}
                  className="px-2 py-1 rounded text-[10px] border border-gray-700 text-gray-300 hover:bg-gray-800 transition"
                >
                  {def.label}
                </button>
              ))}
            </div>
            {selectedItem && (
              <div className="mt-2 rounded-lg border border-gray-800 bg-gray-900/60 p-2 space-y-2">
                <div className="text-[11px] text-gray-300">
                  Selected: {FURNITURE_PRESETS[selectedItem.type]?.label ?? selectedItem.type}
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">Color</div>
                  <div className="flex flex-wrap gap-1">
                    {STAGING_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => updateSelected({ color })}
                        className={[
                          "w-5 h-5 rounded border transition",
                          selectedItem.color === color
                            ? "border-blue-500 ring-1 ring-blue-500"
                            : "border-gray-700 hover:border-gray-500",
                        ].join(" ")}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                    <input
                      type="color"
                      value={selectedItem.color ?? "#ffffff"}
                      onChange={(e) => updateSelected({ color: e.target.value })}
                      className="h-5 w-5 rounded border border-gray-700 bg-transparent"
                      aria-label="Custom color"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-gray-500">
                    X
                    <input
                      type="number"
                      value={selectedItem.position.x}
                      onChange={(e) => updateSelectedPosition({ x: Number(e.target.value) })}
                      step={0.1}
                      className="mt-1 w-full rounded border border-gray-800 bg-gray-950 text-gray-200 text-[11px] px-2 py-1"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500">
                    Z
                    <input
                      type="number"
                      value={selectedItem.position.z}
                      onChange={(e) => updateSelectedPosition({ z: Number(e.target.value) })}
                      step={0.1}
                      className="mt-1 w-full rounded border border-gray-800 bg-gray-950 text-gray-200 text-[11px] px-2 py-1"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500">
                    Y
                    <input
                      type="number"
                      value={selectedItem.position.y}
                      onChange={(e) => updateSelectedPosition({ y: Number(e.target.value) })}
                      step={0.1}
                      className="mt-1 w-full rounded border border-gray-800 bg-gray-950 text-gray-200 text-[11px] px-2 py-1"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500">
                    Rotation (deg)
                    <input
                      type="number"
                      value={selectedItem.rotation.y}
                      onChange={(e) => updateSelectedRotation({ y: Number(e.target.value) })}
                      step={5}
                      className="mt-1 w-full rounded border border-gray-800 bg-gray-950 text-gray-200 text-[11px] px-2 py-1"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const def = FURNITURE_PRESETS[selectedItem.type];
                      if (def) updateSelectedPosition({ y: def.size[1] / 2 });
                    }}
                    className="px-2 py-1 rounded text-[10px] border border-gray-700 text-gray-300 hover:bg-gray-800 transition"
                  >
                    Snap to floor
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    className="px-2 py-1 rounded text-[10px] border border-red-700/60 text-red-300 hover:bg-red-600/10 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[10px] text-gray-500">
                {stagingDirty ? "Unsaved changes" : "Saved"}
              </span>
              <button
                onClick={handleSaveStaging}
                disabled={!stagingDirty || savingStaging}
                className={[
                  "px-2.5 py-1 rounded text-[10px] border transition",
                  !stagingDirty || savingStaging
                    ? "border-gray-800 bg-gray-900 text-gray-500 cursor-not-allowed"
                    : "border-emerald-700/60 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25",
                ].join(" ")}
              >
                {savingStaging ? "Saving..." : "Save layout"}
              </button>
            </div>
            {placingId && (
              <div className="text-[10px] text-amber-300">
                Click on the floor to place the new item.
              </div>
            )}
            {collisionId && (
              <div className="text-[10px] text-red-400">
                Collision detected. Move the item away from other furniture.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FurnitureType =
  | "sofa"
  | "bed"
  | "table"
  | "chair"
  | "desk"
  | "wardrobe"
  | "fridge"
  | "cabinet"
  | "shelf"
  | "lamp"
  | "tv"
  | "plant"
  | "car"
  | "flowerpot";

const FURNITURE_PRESETS: Record<
  FurnitureType,
  {
    label: string;
    size: [number, number, number];
    color: string;
    modelUrl?: string;
    scale?: number;
  }
> = {
  sofa: { label: "Sofa", size: [1.8, 0.8, 0.8], color: "#6b8e6b", modelUrl: furnitureModels.sofa },
  bed: { label: "Bed", size: [2.0, 0.6, 1.5], color: "#8b7355", modelUrl: furnitureModels.bed },
  table: { label: "Table", size: [1.2, 0.75, 0.8], color: "#8b6914", modelUrl: furnitureModels.table },
  chair: { label: "Chair", size: [0.5, 0.8, 0.5], color: "#8b6914", modelUrl: furnitureModels.chair },
  desk: { label: "Desk", size: [1.4, 0.75, 0.7], color: "#8b6914", modelUrl: furnitureModels.desk },
  wardrobe: { label: "Wardrobe", size: [1.2, 2.0, 0.6], color: "#8b6914", modelUrl: furnitureModels.wardrobe },
  fridge: { label: "Fridge", size: [0.9, 1.8, 0.7], color: "#cccccc", modelUrl: furnitureModels.fridge },
  cabinet: { label: "Cabinet", size: [0.8, 1.2, 0.4], color: "#8b6914", modelUrl: furnitureModels.cabinet },
  shelf: { label: "Shelf", size: [1.0, 0.3, 0.3], color: "#8b6914", modelUrl: furnitureModels.shelf },
  lamp: { label: "Lamp", size: [0.3, 1.2, 0.3], color: "#ffff99", modelUrl: furnitureModels.lamp },
  tv: { label: "TV", size: [1.0, 0.6, 0.1], color: "#333333", modelUrl: furnitureModels.tv },
  plant: { label: "Plant", size: [0.5, 1.0, 0.5], color: "#228B22", modelUrl: furnitureModels.plant },
  car: { label: "Car", size: [4.0, 1.8, 1.8], color: "#f87171", modelUrl: furnitureModels.car },
  flowerpot: { label: "Flower Pot", size: [0.3, 0.4, 0.3], color: "#22c55e", modelUrl: furnitureModels.flowerpot },
};

type StagedItem = {
  id: string;
  type: FurnitureType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  color?: string;
  scale?: number;
};

function parseSceneConfig(raw: unknown): { furniture: StagedItem[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { furniture?: unknown };
  if (!Array.isArray(data.furniture)) return { furniture: [] };
  const furniture = data.furniture
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const it = item as StagedItem;
      if (!it.id || typeof it.id !== "string") return null;
      if (!it.type || !(it.type in FURNITURE_PRESETS)) return null;
      const pos = it.position ?? { x: 0, y: 0, z: 0 };
      const rot = it.rotation ?? { x: 0, y: 0, z: 0 };
      const def = FURNITURE_PRESETS[it.type];
      return {
        id: it.id,
        type: it.type,
        position: {
          x: Number(pos.x) || 0,
          y: Number(pos.y) || 0,
          z: Number(pos.z) || 0,
        },
        rotation: {
          x: Number(rot.x) || 0,
          y: Number(rot.y) || 0,
          z: Number(rot.z) || 0,
        },
        color: typeof it.color === "string" ? it.color : def?.color,
        scale: typeof it.scale === "number" ? it.scale : def?.scale ?? 1,
      } as StagedItem;
    })
    .filter(Boolean) as StagedItem[];
  return { furniture };
}

function StagedFurniture({
  items,
  selectedId,
  collisionId,
  draggingId,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  items: StagedItem[];
  selectedId: string | null;
  collisionId: string | null;
  draggingId: string | null;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, point: { x: number; y: number; z: number }) => void;
  onDragEnd: (id: string) => void;
}) {
  return (
    <group>
      {items.map((item) => {
        const def = FURNITURE_PRESETS[item.type];
        if (!def) return null;
        const isSelected = item.id === selectedId;
        const isColliding = item.id === collisionId;
        const color = item.color ?? def.color;
        const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
          if (item.id !== draggingId) return;
          const point = getGroundPoint(e);
          if (!point) return;
          onDragMove(item.id, point);
        };

        return (
          <group
            key={item.id}
            position={[item.position.x, item.position.y, item.position.z]}
            rotation={[
              (item.rotation.x * Math.PI) / 180,
              (item.rotation.y * Math.PI) / 180,
              (item.rotation.z * Math.PI) / 180,
            ]}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(item.id);
              onDragStart(item.id);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => {
              e.stopPropagation();
              onDragEnd(item.id);
            }}
            castShadow
            receiveShadow
          >
            {def.modelUrl ? (
              <FurnitureModel def={def} color={color} scale={item.scale} />
            ) : (
              <mesh castShadow receiveShadow>
                <boxGeometry args={def.size} />
                <meshStandardMaterial
                  color={color}
                  emissive={isSelected ? "#1d4ed8" : isColliding ? "#dc2626" : "#000000"}
                  emissiveIntensity={isSelected || isColliding ? 0.3 : 0}
                />
              </mesh>
            )}
            {(isSelected || isColliding) && (
              <mesh>
                <boxGeometry args={[def.size[0] * 1.02, def.size[1] * 1.02, def.size[2] * 1.02]} />
                <meshBasicMaterial
                  color={isColliding ? "#dc2626" : "#3b82f6"}
                  wireframe
                  transparent
                  opacity={0.5}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function StagingGround({
  active,
  onMove,
  onDown,
}: {
  active: boolean;
  onMove: (point: { x: number; y: number; z: number }) => void;
  onDown: (point: { x: number; y: number; z: number }) => void;
}) {
  if (!active) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        onMove({ x: e.point.x, y: e.point.y, z: e.point.z });
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDown({ x: e.point.x, y: e.point.y, z: e.point.z });
      }}
    >
      <planeGeometry args={[100, 100]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

function FurnitureModel({
  def,
  color,
  scale,
}: {
  def: (typeof FURNITURE_PRESETS)[FurnitureType];
  color: string;
  scale?: number;
}) {
  const { scene } = useGLTF(def.modelUrl ?? "") as { scene: import("three").Object3D };
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat instanceof MeshStandardMaterial) {
              mat.color.set(color);
            }
          });
        } else if (child.material instanceof MeshStandardMaterial) {
          child.material.color.set(color);
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [cloned, color]);

  return <primitive object={cloned} scale={scale ?? def.scale ?? 1} />;
}

const groundPoint = new Vector3();

function getGroundPoint(event: ThreeEvent<PointerEvent>) {
  const dir = event.ray.direction;
  if (Math.abs(dir.y) < 1e-6) return null;
  const t = -event.ray.origin.y / dir.y;
  if (t < 0) return null;
  event.ray.at(t, groundPoint);
  return { x: groundPoint.x, y: groundPoint.y, z: groundPoint.z };
}
