import type { ActionState } from "@/app/panel/actions";

export function FormStatus({ state }: { state: ActionState }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand">
        ✓ {state.ok}
      </p>
    );
  return null;
}
