"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/format";

type Mode = "login" | "signup" | "reset";

export function AuthForm({ initialMode, next, linkError }: { initialMode: Mode; next: string; linkError: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "El enlace venció o ya se usó. Intenta de nuevo." : null);
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/confirm?siguiente=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(friendlyError(error.message));
        setLoading(false);
        return;
      }
      router.replace(next);
      router.refresh();
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      setLoading(false);
      if (error) return setError(friendlyError(error.message));
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
      setInfo("Te enviamos un correo. Abre el enlace para activar tu cuenta y luego vuelve aquí.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirectTo()}&recuperar=1` });
    setLoading(false);
    if (error) return setError(friendlyError(error.message));
    setInfo("Si ese correo tiene cuenta, te llegará un enlace para entrar y cambiar la contraseña.");
  }

  const titles: Record<Mode, [string, string]> = {
    login: ["Entra a tu panel", "Para ver y gestionar las citas de tu negocio."],
    signup: ["Crea tu cuenta", "Gratis. Después configuras tu negocio en dos minutos."],
    reset: ["Recuperar contraseña", "Te enviamos un enlace a tu correo."],
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{titles[mode][0]}</h1>
      <p className="mt-1 text-muted">{titles[mode][1]}</p>
      <p className="mt-2 text-sm text-muted">
        ¿Eres cliente? No necesitas cuenta: reserva desde el enlace del negocio.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Correo
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        {mode !== "reset" && (
          <div>
            <label htmlFor="password" className="label">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
            {error}
          </p>
        )}
        {info && <p className="rounded-xl bg-brand-soft px-3 py-2 text-ink">{info}</p>}
        <button type="submit" className="btn-primary w-full text-base" disabled={loading}>
          {loading ? "Un momento…" : mode === "login" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Enviar enlace"}
        </button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        {mode === "login" ? (
          <>
            <p>
              ¿No tienes cuenta?{" "}
              <button className="font-medium text-brand underline underline-offset-4" onClick={() => setMode("signup")}>
                Créala aquí
              </button>
            </p>
            <button className="text-muted underline underline-offset-4" onClick={() => setMode("reset")}>
              Olvidé mi contraseña
            </button>
          </>
        ) : (
          <p>
            ¿Ya tienes cuenta?{" "}
            <button className="font-medium text-brand underline underline-offset-4" onClick={() => setMode("login")}>
              Entra aquí
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
