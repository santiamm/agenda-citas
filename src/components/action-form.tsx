"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import type { ActionState } from "@/app/panel/actions";

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submit: string;
  pending?: string;
  hidden?: Record<string, string>;
  className?: string;
  buttonClass?: string;
  resetOnOk?: boolean;
  children: React.ReactNode;
};

/** Formulario que llama a una acción del servidor y muestra "Guardado" o el error. */
export function ActionForm({
  action,
  submit,
  pending: pendingLabel = "Guardando…",
  hidden = {},
  className = "space-y-3",
  buttonClass = "btn-primary w-full",
  resetOnOk,
  children,
}: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} key={resetOnOk ? state?.ok : undefined}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <FormStatus state={state} />
      <button className={buttonClass} disabled={pending}>
        {pending ? pendingLabel : submit}
      </button>
    </form>
  );
}
