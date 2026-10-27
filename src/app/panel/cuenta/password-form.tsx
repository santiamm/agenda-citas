"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { changePasswordAction } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="mt-4 space-y-4">
      <div>
        <label htmlFor="password" className="label">
          Contraseña nueva
        </label>
        <input id="password" name="password" type="password" className="input" minLength={6} autoComplete="new-password" required />
      </div>
      <FormStatus state={state} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
