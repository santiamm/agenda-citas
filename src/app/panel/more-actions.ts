"use server";

// Acciones del panel para cita manual, clientes, quién hace qué, mensualidades,
// lista de espera, avisos y limpieza. Igual que actions.ts: las reglas RLS deciden.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, zonedToUtc } from "@/lib/format";
import type { ActionState } from "./actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0);

function done(slug: string, page = "", ok = "Guardado"): ActionState {
  revalidatePath(`/panel/${slug}${page}`);
  return { ok };
}

// ------------------------------------------------------------------ cita manual

export async function ownerBookingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const date = str(form, "date");
  const time = str(form, "time");
  if (!date || !time) return { error: "Elige el día y la hora." };
  const { error } = await supabase.rpc("owner_create_booking", {
    p_business_id: str(form, "business_id"),
    p_service_id: str(form, "service_id"),
    p_resource_id: str(form, "resource_id"),
    p_starts_at: zonedToUtc(date, time, str(form, "timezone")).toISOString(),
    p_customer_name: str(form, "name"),
    p_customer_phone: str(form, "phone") || null,
    p_notes: str(form, "notes") || null,
  });
  if (error) return { error: friendlyError(error.message) };
  redirect(`/panel/${slug}?d=${date}`);
}

// ------------------------------------------------------------------ clientes

export async function saveCustomerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const id = str(form, "id");
  const phone = str(form, "phone").replace(/\D/g, "");
  const row = { name: str(form, "name"), phone, notes: str(form, "notes") || null };
  if (row.name.length < 2) return { error: "Escribe el nombre." };
  if (phone.length < 7 || phone.length > 15) return { error: friendlyError("INVALID_PHONE") };
  const dup = "Ya existe un cliente con ese teléfono.";
  if (id) {
    const { error } = await supabase.from("customers").update(row).eq("id", id);
    if (error) return { error: error.code === "23505" ? dup : friendlyError(error.message) };
    return done(slug, `/clientes/${id}`);
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...row, business_id: str(form, "business_id") })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? dup : friendlyError(error.message) };
  redirect(`/panel/${slug}/clientes/${data.id}`);
}

// ------------------------------------------------------------------ quién hace qué

export async function saveServiceResourcesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const serviceId = str(form, "service_id");
  const businessId = str(form, "business_id");
  const chosen = form.getAll("resource_ids").map(String);
  const all = form.getAll("all_resource_ids").map(String);
  if (!chosen.length) return { error: "Marca al menos una persona." };
  await supabase.from("resource_services").delete().eq("service_id", serviceId);
  // Si marcó a todos no se guarda nada: equivale a "lo hacen todos" e incluye a los que agregue después.
  if (chosen.length < all.length) {
    const { error } = await supabase
      .from("resource_services")
      .insert(chosen.map((r) => ({ business_id: businessId, resource_id: r, service_id: serviceId })));
    if (error) return { error: friendlyError(error.message) };
  }
  return done(slug, "/servicios");
}

// ------------------------------------------------------------------ mensualidades

export async function savePlanAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const businessId = str(form, "business_id");
  const id = str(form, "id");
  const visits = num(form, "visits_per_period");
  const row = {
    business_id: businessId,
    name: str(form, "name"),
    description: str(form, "description") || null,
    price: num(form, "price"),
    visits_per_period: visits > 0 ? visits : null,
    is_active: id ? form.get("is_active") === "on" : true,
  };
  if (row.name.length < 2) return { error: "Escribe el nombre del plan." };
  const res = id
    ? await supabase.from("plans").update(row).eq("id", id).select("id").single()
    : await supabase.from("plans").insert(row).select("id").single();
  if (res.error) return { error: friendlyError(res.error.message) };
  const planId = res.data.id;
  const services = form.getAll("service_ids").map(String);
  await supabase.from("plan_services").delete().eq("plan_id", planId);
  if (services.length) {
    const ins = await supabase
      .from("plan_services")
      .insert(services.map((s) => ({ plan_id: planId, service_id: s, business_id: businessId })));
    if (ins.error) return { error: friendlyError(ins.error.message) };
  }
  return done(slug, "/mensualidades", id ? "Plan actualizado" : "Plan creado");
}

export async function createMembershipAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const slug = str(form, "slug");
  const businessId = str(form, "business_id");
  const phone = str(form, "phone").replace(/\D/g, "");
  const name = str(form, "name");
  if (!str(form, "plan_id")) return { error: "Primero crea un plan." };
  if (phone.length < 7 || phone.length > 15) return { error: friendlyError("INVALID_PHONE") };

  const found = await supabase
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle();
  let customerId = found.data?.id as string | undefined;
  if (!customerId) {
    if (name.length < 2) return { error: "Escribe el nombre del cliente." };
    const ins = await supabase.from("customers").insert({ business_id: businessId, phone, name }).select("id").single();
    if (ins.error) return { error: friendlyError(ins.error.message) };
    customerId = ins.data.id;
  }

  const { data: m, error } = await supabase
    .from("memberships")
    .insert({
      business_id: businessId,
      plan_id: str(form, "plan_id"),
      customer_id: customerId,
      starts_on: str(form, "starts_on") || undefined,
      notes: str(form, "notes") || null,
    })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error.message) };

  if (form.get("paid_now") === "on") {
    const pay = await supabase.rpc("register_membership_payment", {
      p_membership_id: m.id,
      p_amount: num(form, "amount"),
      p_method: str(form, "method") || "efectivo",
    });
    if (pay.error) return { error: friendlyError(pay.error.message) };
  }
  return done(slug, "/mensualidades", "Cliente inscrito");
}

export async function registerPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_membership_payment", {
    p_membership_id: str(form, "membership_id"),
    p_amount: num(form, "amount"),
    p_method: str(form, "method") || "efectivo",
    p_paid_on: str(form, "paid_on") || null,
    p_notes: str(form, "notes") || null,
  });
  if (error) return { error: friendlyError(error.message) };
  return done(str(form, "slug"), "/mensualidades", `Pago registrado. Al día hasta el ${data}.`);
}

export async function setMembershipStatusAction(form: FormData) {
  const supabase = await createClient();
  await supabase.from("memberships").update({ status: str(form, "status") }).eq("id", str(form, "id"));
  revalidatePath(`/panel/${str(form, "slug")}/mensualidades`);
}

// ------------------------------------------------------------------ lista de espera

export async function setWaitlistStatusAction(form: FormData) {
  const supabase = await createClient();
  const status = str(form, "status");
  if (status === "delete") await supabase.from("waitlist").delete().eq("id", str(form, "id"));
  else await supabase.from("waitlist").update({ status }).eq("id", str(form, "id"));
  revalidatePath(`/panel/${str(form, "slug")}/espera`);
}

// ------------------------------------------------------------------ avisos y limpieza

export async function saveNotifySettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const retention = num(form, "retention_days");
  const { error } = await supabase
    .from("businesses")
    .update({
      notify_email: form.get("notify_email") === "on",
      notify_push: form.get("notify_push") === "on",
      retention_days: retention > 0 ? retention : null,
    })
    .eq("id", str(form, "id"));
  if (error) return { error: friendlyError(error.message) };
  return done(str(form, "slug"), "/ajustes");
}

export async function purgePastAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const before = str(form, "before");
  if (!before) return { error: "Elige una fecha." };
  const until = zonedToUtc(before, "00:00", str(form, "timezone"));
  const limit = new Date(Math.min(until.getTime(), Date.now())).toISOString();
  const { count, error } = await supabase
    .from("appointments")
    .delete({ count: "exact" })
    .eq("business_id", str(form, "business_id"))
    .lt("ends_at", limit);
  if (error) return { error: friendlyError(error.message) };
  return done(str(form, "slug"), "/ajustes", `Se borraron ${count ?? 0} citas pasadas.`);
}
