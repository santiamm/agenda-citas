"use server";

// Todas las escrituras del panel. Usan la sesión del dueño, así que las reglas RLS de
// Supabase son las que deciden: nadie puede tocar un negocio que no es suyo.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { friendlyError, slugify, zonedToUtc } from "@/lib/format";
import type { AppointmentStatus } from "@/lib/types";

export type ActionState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0);

function done(slug: string, page = "", ok = "Guardado"): ActionState {
  revalidatePath(`/panel/${slug}${page}`);
  return { ok };
}

// ------------------------------------------------------------------ negocio

export async function createBusinessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await getUser();
  if (!user) redirect("/entrar");
  const name = str(form, "name");
  const slug = slugify(str(form, "slug") || name);
  if (name.length < 2) return { error: "Escribe el nombre del negocio." };
  if (slug.length < 3) return { error: "El enlace debe tener al menos 3 letras o números." };
  const { error } = await supabase.rpc("create_business", {
    p_name: name,
    p_slug: slug,
    p_category: str(form, "category") || "otro",
    p_resource_name: str(form, "resource_name") || null,
    p_phone: str(form, "phone") || null,
  });
  if (error) return { error: friendlyError(error.message) };
  redirect(`/panel/${slug}?bienvenida=1`);
}

export async function updateBusinessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const id = str(form, "id");
  const oldSlug = str(form, "old_slug");
  const slug = slugify(str(form, "slug"));
  if (slug.length < 3) return { error: "El enlace debe tener al menos 3 letras o números." };
  const { error } = await supabase
    .from("businesses")
    .update({
      name: str(form, "name"),
      slug,
      description: str(form, "description") || null,
      phone: str(form, "phone").replace(/[^\d+]/g, "") || null,
      address: str(form, "address") || null,
      resource_label: str(form, "resource_label") || "Profesional",
      slot_step_minutes: num(form, "slot_step_minutes"),
      min_notice_minutes: num(form, "min_notice_minutes"),
      max_days_ahead: num(form, "max_days_ahead"),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: friendlyError("SLUG_TAKEN") };
    return { error: friendlyError(error.message) };
  }
  if (slug !== oldSlug) redirect(`/panel/${slug}/ajustes`);
  return done(slug, "/ajustes");
}

// ------------------------------------------------------------------ citas

export async function setStatusAction(form: FormData) {
  const supabase = await createClient();
  const status = str(form, "status") as AppointmentStatus;
  const { error } = await supabase.from("appointments").update({ status }).eq("id", str(form, "id"));
  revalidatePath(`/panel/${str(form, "slug")}`);
  if (error) {
    redirect(`/panel/${str(form, "slug")}?d=${str(form, "d")}&error=${encodeURIComponent(friendlyError(error.message))}`);
  }
}

// ------------------------------------------------------------------ servicios

export async function saveServiceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const row = {
    business_id: str(form, "business_id"),
    name: str(form, "name"),
    description: str(form, "description") || null,
    duration_minutes: num(form, "duration_minutes"),
    price: num(form, "price"),
    is_active: form.get("is_active") === "on",
  };
  if (row.name.length < 2) return { error: "Escribe el nombre del servicio." };
  if (!(row.duration_minutes >= 5 && row.duration_minutes <= 480)) return { error: "La duración va de 5 a 480 minutos." };
  const id = str(form, "id");
  const { error } = id
    ? await supabase.from("services").update(row).eq("id", id)
    : await supabase.from("services").insert({ ...row, sort: 100 });
  if (error) return { error: friendlyError(error.message) };
  return done(slug, "/servicios", id ? "Servicio actualizado" : "Servicio creado");
}

export async function deleteServiceAction(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  // Si ya tiene citas no se puede borrar (historial): se desactiva.
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) await supabase.from("services").update({ is_active: false }).eq("id", id);
  revalidatePath(`/panel/${str(form, "slug")}/servicios`);
}

// ------------------------------------------------------------------ equipo y horario

export async function saveResourceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const id = str(form, "id");
  const name = str(form, "name");
  if (!name) return { error: "Escribe un nombre." };
  if (id) {
    const { error } = await supabase
      .from("resources")
      .update({ name, is_active: form.get("is_active") === "on" })
      .eq("id", id);
    if (error) return { error: friendlyError(error.message) };
    return done(slug, "/horario");
  }
  const businessId = str(form, "business_id");
  const { data, error } = await supabase
    .from("resources")
    .insert({ business_id: businessId, name, sort: 100 })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error.message) };
  // Copia el horario del primer recurso para no empezar en blanco.
  const copyFrom = str(form, "copy_from");
  if (copyFrom) {
    const { data: hours } = await supabase
      .from("working_hours")
      .select("weekday, start_time, end_time")
      .eq("resource_id", copyFrom);
    if (hours?.length) {
      await supabase
        .from("working_hours")
        .insert(hours.map((h) => ({ ...h, business_id: businessId, resource_id: data.id })));
    }
  }
  return done(slug, "/horario", "Agregado");
}

export async function deleteResourceAction(form: FormData) {
  const supabase = await createClient();
  const id = str(form, "id");
  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) await supabase.from("resources").update({ is_active: false }).eq("id", id);
  revalidatePath(`/panel/${str(form, "slug")}/horario`);
}

/** Reemplaza el horario semanal completo de un recurso. Campos: d{0-6}_on, d{n}_start{i}, d{n}_end{i}. */
export async function saveHoursAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const businessId = str(form, "business_id");
  const resourceId = str(form, "resource_id");
  const rows: { business_id: string; resource_id: string; weekday: number; start_time: string; end_time: string }[] = [];
  for (let d = 0; d < 7; d++) {
    if (form.get(`d${d}_on`) !== "on") continue;
    for (let i = 0; i < 2; i++) {
      const start = str(form, `d${d}_start${i}`);
      const end = str(form, `d${d}_end${i}`);
      if (!start || !end) continue;
      if (end <= start) return { error: "En cada tramo la hora de cierre debe ser después de la de apertura." };
      rows.push({ business_id: businessId, resource_id: resourceId, weekday: d, start_time: start, end_time: end });
    }
  }
  const del = await supabase.from("working_hours").delete().eq("resource_id", resourceId);
  if (del.error) return { error: friendlyError(del.error.message) };
  if (rows.length) {
    const { error } = await supabase.from("working_hours").insert(rows);
    if (error) return { error: friendlyError(error.message) };
  }
  return done(slug, "/horario", "Horario guardado");
}

export async function addTimeOffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const tz = str(form, "timezone");
  const fromDate = str(form, "from_date");
  const toDate = str(form, "to_date") || fromDate;
  const allDay = form.get("all_day") === "on";
  const start = zonedToUtc(fromDate, allDay ? "00:00" : str(form, "from_time") || "00:00", tz);
  const end = allDay
    ? zonedToUtc(toDate, "23:59", tz)
    : zonedToUtc(toDate, str(form, "to_time") || "23:59", tz);
  if (!fromDate || end <= start) return { error: "Revisa las fechas: el final debe ser después del inicio." };
  const { error } = await supabase.from("time_off").insert({
    business_id: str(form, "business_id"),
    resource_id: str(form, "resource_id") || null,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    reason: str(form, "reason") || null,
  });
  if (error) return { error: friendlyError(error.message) };
  return done(slug, "/horario", "Bloqueo agregado");
}

export async function deleteTimeOffAction(form: FormData) {
  const supabase = await createClient();
  await supabase.from("time_off").delete().eq("id", str(form, "id"));
  revalidatePath(`/panel/${str(form, "slug")}/horario`);
}

// ------------------------------------------------------------------ cuenta

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

export async function changePasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const password = str(form, "password");
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendlyError(error.message) };
  return { ok: "Contraseña actualizada" };
}
