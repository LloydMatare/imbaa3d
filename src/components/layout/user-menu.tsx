"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { logoutUser } from "@/app/actions/auth";
import { useCreditsStore } from "@/lib/store/use-credits-store";

interface UserMenuProps {
  name: string;
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const { credits, setCredits } = useCreditsStore();

  useEffect(() => {
    fetch("/api/credits/balance")
      .then((r) => r.json())
      .then((data) => setCredits(data.credits ?? 0))
      .catch(() => {});
  }, [setCredits]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 text-sm"
      >
        <span className="px-2.5 py-1 rounded-full bg-blue-600/20 text-blue-400 text-xs font-medium">
          {credits} credits
        </span>
        <span className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white font-medium text-sm">
          {name.charAt(0).toUpperCase()}
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 rounded-lg bg-gray-900 border border-gray-800 shadow-xl z-50">
            <div className="p-3 border-b border-gray-800">
              <p className="text-sm font-medium text-white truncate">{name}</p>
              <p className="text-xs text-gray-500 truncate">{email}</p>
            </div>
            <div className="p-1.5">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/pricing"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 transition"
              >
                Buy Credits
              </Link>
              <form action={logoutUser}>
                <button
                  type="submit"
                  className="w-full text-left px-3 py-2 rounded-md text-sm text-red-400 hover:bg-gray-800 transition"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
