import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage({ searchParams }: PageProps<"/panel/cuenta">) {
  const { recuperar } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-sm flex-1 px-4 py-6">
      <Logo href="/panel" />
      <h1 className="mt-8 text-2xl font-semibold">{recuperar ? "Elige una contraseña nueva" : "Cambiar contraseña"}</h1>
      <PasswordForm />
      <Link href="/panel" className="mt-6 inline-block text-sm text-muted underline underline-offset-4">
        Volver al panel
      </Link>
    </div>
  );
}
