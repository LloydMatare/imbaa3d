"use client";

import { useState } from "react";

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  priceLabel: string;
  badge?: string;
}

export function PricingCard({ pkg }: { pkg: CreditPackage }) {
  const [loading, setLoading] = useState(false);
  const isPopular = pkg.id === "pro";

  async function handleBuy() {
    setLoading(true);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id }),
      });

      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      } else {
        const data = await res.json();
        if (data.error === "Unauthorized") {
          window.location.href = "/login";
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`relative rounded-xl border p-6 flex flex-col ${
        isPopular
          ? "border-blue-500 bg-gray-900"
          : "border-gray-800 bg-gray-900/50"
      }`}
    >
      {isPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white text-xs font-medium">
          Most Popular
        </span>
      )}

      <h3 className="text-lg font-semibold text-white">{pkg.name}</h3>
      <p className="text-3xl font-bold text-white mt-2">{pkg.priceLabel}</p>
      <p className="text-sm text-gray-500 mt-1">
        {pkg.credits} credits
        {pkg.badge && (
          <span className="ml-2 text-xs text-green-400">({pkg.badge})</span>
        )}
      </p>

      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <p>≈ {Math.floor(pkg.credits / 3)} AI conversions</p>
        <p>≈ {pkg.credits} HD renders</p>
      </div>

      <button
        onClick={handleBuy}
        disabled={loading}
        className={`mt-6 w-full py-2.5 rounded-lg font-medium text-sm transition disabled:opacity-50 ${
          isPopular
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
        }`}
      >
        {loading ? "Redirecting..." : `Buy ${pkg.credits} Credits`}
      </button>
    </div>
  );
}
