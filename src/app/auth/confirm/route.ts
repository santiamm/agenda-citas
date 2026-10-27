import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino de los enlaces que manda Supabase por correo (activar cuenta, recuperar contraseña).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const siguiente = searchParams.get("siguiente") ?? "/panel";
  const next = siguiente.startsWith("/panel") ? siguiente : "/panel";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("sin código") };

  if (error) return NextResponse.redirect(`${origin}/entrar?error=enlace`);
  const recovering = searchParams.get("recuperar") || type === "recovery";
  return NextResponse.redirect(`${origin}${recovering ? "/panel/cuenta?recuperar=1" : next}`);
}
