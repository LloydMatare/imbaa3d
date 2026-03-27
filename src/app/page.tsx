import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { HeroSceneWrapper } from "@/components/three/hero-scene-wrapper";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
                Turn Floor Plans into
                <span className="text-blue-500"> Stunning 3D</span>
              </h1>
              <p className="mt-6 text-lg text-gray-400 max-w-xl">
                Draw 2D floor plans, upload existing blueprints, and let AI
                transform them into interactive 3D models. All in your browser.
              </p>
              <div className="mt-8 flex gap-4">
                <Link
                  href="/sign-up"
                  className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                >
                  Start Free — 5 Credits
                </Link>
                <Link
                  href="/pricing"
                  className="px-6 py-3 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition"
                >
                  View Pricing
                </Link>
              </div>
            </div>
            <div className="h-[400px] lg:h-[500px]">
              <HeroSceneWrapper />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">
            Everything you need to visualize spaces
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "2D Floor Plan Editor",
                desc: "Draw walls, place furniture, add doors and windows with snap-to-grid precision.",
                icon: "📐",
              },
              {
                title: "AI 2D → 3D Conversion",
                desc: "Upload a floor plan image and our AI generates a full 3D model automatically.",
                icon: "🤖",
              },
              {
                title: "Interactive 3D Viewer",
                desc: "Explore your designs in an interactive 3D environment with orbit, zoom, and walkthrough.",
                icon: "🏠",
              },
              {
                title: "Virtual Staging",
                desc: "Drag and drop furniture into your 3D scenes. Customize materials and colors.",
                icon: "🪑",
              },
              {
                title: "HD Exports & Sharing",
                desc: "Export high-res renders, share public links, or embed viewers on your website.",
                icon: "📤",
              },
              {
                title: "Pay As You Go",
                desc: "No subscriptions required. Buy credit packs and use them when you need.",
                icon: "💳",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-gray-800 bg-gray-900/50"
              >
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h3 className="text-sm font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to bring your floor plans to life?
          </h2>
          <p className="text-gray-400 mb-8">
            Sign up free and get 5 credits to try AI-powered 3D generation.
          </p>
          <Link
            href="/sign-up"
            className="inline-block px-8 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-600">
          © {new Date().getFullYear()} Imbaa3D. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
