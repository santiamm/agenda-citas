import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">No encontramos esta página</h1>
      <p className="mt-2 text-muted">Revisa que el enlace esté bien escrito o pídele al negocio que te lo envíe de nuevo.</p>
      <Link href="/" className="btn-primary mt-6">
        Ir al inicio
      </Link>
    </div>
  );
}
