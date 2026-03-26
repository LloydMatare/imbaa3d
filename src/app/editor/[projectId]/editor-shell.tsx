"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const Scene = dynamic(
  () => import("@/components/three/scene").then((mod) => mod.Scene),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading 3D scene...</div>
      </div>
    ),
  }
);

interface Project {
  id: string;
  title: string;
  type: string;
  status: string;
  modelUrl: string | null;
}

export function EditorShell({ project }: { project: Project }) {
  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="h-12 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
        <Link
          href="/dashboard"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          ← Back
        </Link>
        <div className="h-4 w-px bg-gray-800" />
        <h1 className="text-sm font-medium text-white truncate">
          {project.title}
        </h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
          {project.status}
        </span>
        <div className="flex-1" />
        <button className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition">
          Save
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex">
        {/* Left sidebar - tools (placeholder for Phase 2) */}
        <div className="w-12 border-r border-gray-800 flex flex-col items-center py-3 gap-3 shrink-0">
          <button
            className="w-8 h-8 rounded-md bg-gray-800 text-gray-400 text-xs flex items-center justify-center hover:bg-gray-700 transition"
            title="Select"
          >
            ↖
          </button>
          <button
            className="w-8 h-8 rounded-md bg-gray-800 text-gray-400 text-xs flex items-center justify-center hover:bg-gray-700 transition"
            title="Draw Wall"
          >
            ⊞
          </button>
          <button
            className="w-8 h-8 rounded-md bg-gray-800 text-gray-400 text-xs flex items-center justify-center hover:bg-gray-700 transition"
            title="Add Furniture"
          >
            🪑
          </button>
        </div>

        {/* 3D Viewport */}
        <div className="flex-1 relative">
          <Scene className="w-full h-full">
            {/* Default demo geometry when no model */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#3b82f6" />
            </mesh>
          </Scene>
        </div>

        {/* Right sidebar - properties (placeholder for later) */}
        <div className="w-64 border-l border-gray-800 p-4 shrink-0 hidden lg:block">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Properties
          </h2>
          <p className="text-xs text-gray-600">
            Select an object to view its properties.
          </p>
        </div>
      </div>
    </div>
  );
}
