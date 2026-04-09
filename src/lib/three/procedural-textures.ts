import * as THREE from "three";

export type TexturePreset = "none" | "wood" | "wood-dark" | "tile" | "marble" | "brick" | "concrete";

interface TextureDef {
  label: string;
  baseColor: string;
  accentColor: string;
  type: "floor" | "wall" | "both";
}

export const TEXTURE_DEFS: Record<TexturePreset, TextureDef> = {
  none: { label: "None", baseColor: "", accentColor: "", type: "both" },
  wood: { label: "Oak Wood", baseColor: "#c8a87e", accentColor: "#a08050", type: "floor" },
  "wood-dark": { label: "Dark Wood", baseColor: "#5c4033", accentColor: "#3a2820", type: "floor" },
  tile: { label: "Tile", baseColor: "#e0ddd8", accentColor: "#c8c4be", type: "floor" },
  marble: { label: "Marble", baseColor: "#f0eee8", accentColor: "#d8d4cc", type: "wall" },
  brick: { label: "Brick", baseColor: "#b5651d", accentColor: "#8a8a8a", type: "wall" },
  concrete: { label: "Concrete", baseColor: "#a0a0a0", accentColor: "#808080", type: "wall" },
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createWoodTexture(size: number, baseColor: string, accentColor: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(42);

  // Base fill
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Wood grain lines
  ctx.strokeStyle = accentColor;
  const plankWidth = size / 6;
  for (let plank = 0; plank < 6; plank++) {
    const x0 = plank * plankWidth;
    // Plank divider
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, size);
    ctx.stroke();

    // Grain within plank
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 20; i++) {
      const y = rng() * size;
      const amplitude = 2 + rng() * 4;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y);
      for (let x = x0 + 2; x < x0 + plankWidth - 2; x += 4) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + rng() * 2) * amplitude);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Noise overlay
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

function createTileTexture(size: number, baseColor: string, accentColor: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(123);

  const tileSize = size / 4;
  const gap = 2;

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * tileSize + gap;
      const y = row * tileSize + gap;
      const s = tileSize - gap * 2;

      // Slight color variation per tile
      rng(); // advance rng for consistency
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, s, s);

      // Subtle highlight
      ctx.fillStyle = `rgba(255,255,255,${0.02 + rng() * 0.03})`;
      ctx.fillRect(x, y, s, s / 2);
    }
  }

  return canvas;
}

function createMarbleTexture(size: number, baseColor: string, accentColor: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(456);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Veins
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = rng() * size;
    let y = rng() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 30; j++) {
      x += (rng() - 0.5) * 20;
      y += (rng() - 0.3) * 15;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Noise
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * 8;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

function createBrickTexture(size: number, baseColor: string, accentColor: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(789);

  const brickH = size / 8;
  const brickW = size / 4;
  const mortarW = 2;

  // Mortar color
  ctx.fillStyle = accentColor || "#999";
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col < 5; col++) {
      const x = col * brickW + offset + mortarW;
      const y = row * brickH + mortarW;
      const w = brickW - mortarW * 2;
      const h = brickH - mortarW * 2;

      // Color variation
      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);
      const v = (rng() - 0.5) * 25;
      ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r + v))},${Math.max(0, Math.min(255, g + v * 0.7))},${Math.max(0, Math.min(255, b + v * 0.5))})`;
      ctx.fillRect(x, y, w, h);

      // Subtle edge shadow
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.fillRect(x + w - 1, y, 1, h);
    }
  }

  return canvas;
}

function createConcreteTexture(size: number, baseColor: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rng = seededRandom(101);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * 30;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

const textureCache = new Map<TexturePreset, THREE.CanvasTexture>();

export function getProceduralTexture(preset: TexturePreset): THREE.CanvasTexture | null {
  if (preset === "none") return null;

  if (textureCache.has(preset)) {
    return textureCache.get(preset)!;
  }

  const def = TEXTURE_DEFS[preset];
  if (!def) return null;

  let canvas: HTMLCanvasElement;

  switch (preset) {
    case "wood":
      canvas = createWoodTexture(512, def.baseColor, def.accentColor);
      break;
    case "wood-dark":
      canvas = createWoodTexture(512, def.baseColor, def.accentColor);
      break;
    case "tile":
      canvas = createTileTexture(512, def.baseColor, def.accentColor);
      break;
    case "marble":
      canvas = createMarbleTexture(512, def.baseColor, def.accentColor);
      break;
    case "brick":
      canvas = createBrickTexture(512, def.baseColor, def.accentColor);
      break;
    case "concrete":
      canvas = createConcreteTexture(512, def.baseColor);
      break;
    default:
      return null;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  textureCache.set(preset, texture);
  return texture;
}

export function clearTextureCache(): void {
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();
}
