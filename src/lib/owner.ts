import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import type { Business } from "@/lib/types";

/** Negocio del usuario logueado por slug. Si no es suyo, 404 (no revelamos que existe). */
export const getOwnerBusiness = cache(async (slug: string) => {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/entrar?siguiente=/panel/${slug}`);
  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .eq("owner_id", user.id)
    .maybeSingle<Business>();
  if (!business) notFound();
  return { supabase, user, business };
});
