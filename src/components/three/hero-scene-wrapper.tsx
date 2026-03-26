"use client";

import dynamic from "next/dynamic";

const HeroScene = dynamic(
  () => import("./hero-scene").then((mod) => mod.HeroScene),
  {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-950" />,
  }
);

export function HeroSceneWrapper() {
  return <HeroScene />;
}
