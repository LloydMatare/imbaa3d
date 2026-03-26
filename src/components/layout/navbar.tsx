import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCredits } from "@/lib/credits";
import { UserMenu } from "./user-menu";

export async function Navbar() {
  const session = await auth();

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
              {session?.user && (
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
            {session?.user ? (
              <UserMenu
                name={session.user.name || "User"}
                email={session.user.email || ""}
                userId={session.user.id}
              />
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm text-gray-300 hover:text-white transition"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
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
