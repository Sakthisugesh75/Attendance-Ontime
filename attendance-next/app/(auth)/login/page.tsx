import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, never an absolute URL.
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return <LoginForm next={safeNext} />;
}
