import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/http/auth";

export const metadata: Metadata = { title: "Entrar · Nutritional Manager" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return <LoginForm />;
}
