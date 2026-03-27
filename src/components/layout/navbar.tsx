import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getCredits } from "@/lib/credits";
import { UserButton } from "@clerk/nextjs";

export async function Navbar() {
  const { userId } = await auth();

  return (
    <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-white">
              Imbaa<span className="text-blue-500">3D</span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link
                href="/pricing"
                className="text-sm text-gray-400 hover:text-white transition"
              >
                Pricing
              </Link>
              {userId && (
                <Link
                  href="/dashboard"
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Dashboard
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {userId ? (
              <div className="flex items-center gap-3">
                <CreditsBadge userId={userId} />
                <UserButton />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/sign-in"
                  className="text-sm text-gray-300 hover:text-white transition"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  Get started
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

async function CreditsBadge({ userId }: { userId: string }) {
  const credits = await getCredits(userId).catch(() => 0);
  return (
    <span className="text-sm text-gray-400">
      <span className="text-white font-medium">{credits}</span> credits
    </span>
  );
}
