import { Navbar } from "@/components/layout/navbar";
import { CREDIT_PACKAGES, CREDIT_COSTS } from "@/lib/credits";
import { PricingCard } from "./pricing-card";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-white mb-3">
            Simple, Credit-Based Pricing
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto">
            Buy credits when you need them. No subscriptions, no hidden fees.
            Every new account starts with 5 free credits.
          </p>
        </div>

        {/* Credit packages */}
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {CREDIT_PACKAGES.map((pkg) => (
            <PricingCard key={pkg.id} pkg={pkg} />
          ))}
        </div>

        {/* Credit costs breakdown */}
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-white mb-4 text-center">
            What do credits cost?
          </h2>
          <div className="space-y-3">
            {[
              {
                label: "AI 2D → 3D Conversion",
                cost: CREDIT_COSTS.AI_CONVERSION,
              },
              { label: "HD Render Export", cost: CREDIT_COSTS.HD_RENDER },
              {
                label: "AI Furniture Suggestion",
                cost: CREDIT_COSTS.AI_FURNITURE,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-2 px-4 rounded-lg bg-gray-900 border border-gray-800"
              >
                <span className="text-sm text-gray-300">{item.label}</span>
                <span className="text-sm font-medium text-blue-400">
                  {item.cost} credit{item.cost !== 1 && "s"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 text-center mt-4">
            2D floor plan editing, basic exports, and project management are
            free and unlimited.
          </p>
        </div>
      </main>
    </div>
  );
}
