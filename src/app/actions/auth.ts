"use server";

import { redirect } from "next/navigation";

/**
 * With Clerk, registration and login are handled entirely by Clerk's hosted
 * UI or embedded <SignIn>/<SignUp> components. These server actions are no
 * longer needed for credentials flow. They are kept as stubs so any existing
 * call-sites compile, but the real auth UI should use Clerk components.
 */

export async function registerUser(
  _prevState: { error: string } | null | undefined,
  _formData: FormData
) {
  // Handled by Clerk's <SignUp> component
  redirect("/sign-up");
}

export async function loginUser(
  _prevState: { error: string } | null | undefined,
  _formData: FormData
) {
  // Handled by Clerk's <SignIn> component
  redirect("/sign-in");
}

export async function loginWithProvider(_provider: "google" | "github") {
  // Handled by Clerk's <SignIn> component with OAuth strategy
  redirect("/sign-in");
}

export async function logoutUser() {
  // Clerk sign-out is handled client-side via useClerk().signOut()
  // or the <SignOutButton> component. Nothing to do server-side.
  redirect("/");
}
