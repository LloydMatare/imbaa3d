import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EmbedViewer } from "./embed-viewer";
import type { TexturePreset } from "@/lib/three/procedural-textures";

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    controls?: string;
    grid?: string;
    branding?: string;
    title?: string;
    camera?: string;
    wallColor?: string;
    floorColor?: string;
    wallTexture?: string;
    floorTexture?: string;
    bg?: string;
    token?: string;
  }>;
}) {
  const { projectId } = await params;
  const { controls, grid, branding, title, camera, wallColor, floorColor, wallTexture, floorTexture, bg, token } =
    await searchParams;
  const showControls = controls !== "false";
  const showGrid = grid !== "false";
  const showBranding = branding !== "false";
  const showTitle = title !== "false";

  const wallColorHex = parseHexColor(wallColor);
  const floorColorHex = parseHexColor(floorColor);
  const wallTexturePreset = parseTexturePreset(wallTexture);
  const floorTexturePreset = parseTexturePreset(floorTexture);
  const background = parseCssHex(bg) ?? "#030712";
  const cameraPreset = parseCameraPreset(camera);

  const [project] = token
    ? await db
        .select({
          id: projects.id,
          title: projects.title,
          modelUrl: projects.modelUrl,
          floorPlanData: projects.floorPlanData,
          isPublic: projects.isPublic,
          shareToken: projects.shareToken,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
    : await db
        .select({
          id: projects.id,
          title: projects.title,
          modelUrl: projects.modelUrl,
          floorPlanData: projects.floorPlanData,
          isPublic: projects.isPublic,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

  const allowed =
    Boolean(project?.modelUrl) &&
    (project?.isPublic === true ||
      (token &&
        Boolean(project) &&
        "shareToken" in project &&
        Boolean(project.shareToken) &&
        token === project.shareToken));

  if (!project || !allowed) {
    notFound();
  }

  const version =
    project.updatedAt instanceof Date ? String(project.updatedAt.getTime()) : "";
  const url =
    project.modelUrl?.startsWith("/api/models/")
      ? `${project.modelUrl}${project.modelUrl.includes("?") ? "&" : "?"}${
          token ? `token=${encodeURIComponent(token)}&` : ""
        }v=${encodeURIComponent(version)}`
      : project.modelUrl!;

  return (
    <div style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, background }}>
      <EmbedViewer
        projectId={project.id}
        url={url}
        title={project.title}
        floorPlanData={project.floorPlanData}
        showControls={showControls}
        showBranding={showBranding}
        showTitle={showTitle}
        showGrid={showGrid}
        wallColor={wallColorHex}
        floorColor={floorColorHex}
        wallTexture={wallTexturePreset}
        floorTexture={floorTexturePreset}
        initialCamera={cameraPreset?.position}
        initialTarget={cameraPreset?.target}
        token={token}
      />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [project] = await db
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const canonical = baseUrl ? `${baseUrl}/embed/${projectId}` : undefined;

  return {
    title: project?.title ? `${project.title} — 3D Viewer` : "3D Viewer",
    ...(canonical ? { alternates: { canonical } } : {}),
  };
}

function parseHexColor(value?: string) {
  if (!value) return undefined;
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;
  return parseInt(normalized, 16);
}

function parseCssHex(value?: string) {
  if (!value) return undefined;
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;
  return `#${normalized.toLowerCase()}`;
}

function parseTexturePreset(value?: string): TexturePreset | undefined {
  switch (value) {
    case "none":
    case "wood":
    case "wood-dark":
    case "tile":
    case "marble":
    case "brick":
    case "concrete":
      return value;
    default:
      return undefined;
  }
}

function parseCameraPreset(value?: string) {
  switch (value) {
    case "top":
      return { position: [0, 10, 0.001] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    case "front":
      return { position: [0, 2, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    case "side":
      return { position: [10, 2, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    case "perspective":
      return { position: [5, 5, 5] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    default:
      return undefined;
  }
}
