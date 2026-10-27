import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/entrar">) {
  const { modo, siguiente, error } = await searchParams;
  const next = typeof siguiente === "string" && siguiente.startsWith("/panel") ? siguiente : "/panel";
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 py-8">
      <Logo />
      <div className="mt-8">
        <AuthForm initialMode={modo === "registro" ? "signup" : "login"} next={next} linkError={error === "enlace"} />
      </div>
    </div>
  );
}
