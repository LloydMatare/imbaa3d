import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ClerkProvider } from '@clerk/nextjs'
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Imbaa3D — Turn Floor Plans into Stunning 3D",
  description:
    "Draw 2D floor plans, upload blueprints, and let AI transform them into interactive 3D models. Credit-based SaaS platform.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={cn("h-full", "antialiased")}
      >
        <body className="min-h-full flex flex-col">{children}
        <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
