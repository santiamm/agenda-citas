export type Category = "barberia" | "peluqueria" | "restaurante" | "spa" | "consultorio" | "otro";

export const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: "barberia", label: "Barbería", emoji: "💈" },
  { value: "peluqueria", label: "Peluquería / salón", emoji: "💇" },
  { value: "restaurante", label: "Restaurante", emoji: "🍽️" },
  { value: "spa", label: "Spa / estética", emoji: "💆" },
  { value: "consultorio", label: "Consultorio", emoji: "🩺" },
  { value: "otro", label: "Otro negocio", emoji: "📅" },
];

export type Business = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  category: Category;
  resource_label: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  slot_step_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  is_demo: boolean;
  retention_days: number | null;
  notify_email: boolean;
  notify_push: boolean;
};

export type Resource = { id: string; business_id: string; name: string; is_active: boolean; sort: number };

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  sort: number;
};

export type WorkingHour = {
  id: string;
  resource_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type TimeOff = {
  id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

export type AgendaItem = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  service_name: string;
  resource_name: string;
  cancel_token?: string;
  customer_id?: string | null;
  source?: "web" | "owner" | "bot";
  member?: boolean; // cubierta por una mensualidad al día
};

export type WaitlistItem = {
  id: string;
  service_id: string;
  customer_name: string;
  customer_phone: string;
  desired_date: string;
  status: "waiting" | "contacted" | "booked" | "cancelled";
  notes: string | null;
  created_at: string;
  services?: { name: string } | null;
};

export type MembershipRow = {
  membership_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  plan_id: string;
  plan_name: string;
  price: number;
  visits_limit: number | null;
  status: "active" | "paused" | "cancelled";
  starts_on: string;
  paid_until: string | null;
  is_paid: boolean;
  period_start: string;
  period_end: string;
  visits_used: number;
  notes: string | null;
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Por confirmar",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Atendida",
  no_show: "No vino",
};
