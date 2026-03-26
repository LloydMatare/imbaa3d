"use server";

import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function registerUser(_prevState: { error: string } | null | undefined, formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "All fields are required" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Email already registered" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      credits: 5, // signup bonus
      creditTransactions: {
        create: {
          amount: 5,
          reason: "signup_bonus",
          balanceAfter: 5,
        },
      },
    },
  });

  await signIn("credentials", {
    email,
    password,
    redirectTo: "/dashboard",
  });
}

export async function loginUser(_prevState: { error: string } | null | undefined, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error: unknown) {
    // Next.js redirect throws NEXT_REDIRECT, which is not an error
    if (
      error instanceof Error &&
      error.message?.includes("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return { error: "Invalid email or password" };
  }
}

export async function loginWithProvider(provider: "google" | "github") {
  await signIn(provider, { redirectTo: "/dashboard" });
}

export async function logoutUser() {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
}
