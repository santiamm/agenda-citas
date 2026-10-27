"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/lib/format";
import { CATEGORIES } from "@/lib/types";
import { createBusinessAction } from "./actions";

export function CreateBusinessForm() {
  const [state, action, pending] = useActionState(createBusinessAction, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState("barberia");

  return (
    <form action={action} className="mt-4 space-y-4">
      <fieldset>
        <legend className="label">Tipo de negocio</legend>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 ${
                category === c.value ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line bg-white"
              }`}
            >
              <input
                type="radio"
                name="category"
                value={c.value}
                checked={category === c.value}
                onChange={() => setCategory(c.value)}
                className="sr-only"
              />
              <span aria-hidden>{c.emoji}</span>
              <span className="text-sm font-medium">{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="name" className="label">
          Nombre del negocio
        </label>
        <input
          id="name"
          name="name"
          className="input"
          placeholder="Barbería Esparza"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          required
          maxLength={80}
        />
      </div>

      <div>
        <label htmlFor="slug" className="label">
          Tu enlace
        </label>
        <div className="flex items-center rounded-xl border border-line bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <span className="pl-3 text-muted">/b/</span>
          <input
            id="slug"
            name="slug"
            className="min-h-11 w-full rounded-xl bg-transparent pr-3 outline-none"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            required
            minLength={3}
            maxLength={40}
          />
        </div>
        <p className="mt-1 text-xs text-muted">Es lo que vas a compartir. Solo letras, números y guiones.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="resource_name" className="label">
            {category === "restaurante" ? "Nombre de la primera mesa" : "Tu nombre (quien atiende)"}
          </label>
          <input
            id="resource_name"
            name="resource_name"
            className="input"
            placeholder={category === "restaurante" ? "Mesa 1" : "Esparza"}
            maxLength={60}
          />
        </div>
        <div>
          <label htmlFor="phone" className="label">
            WhatsApp del negocio <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input id="phone" name="phone" type="tel" inputMode="tel" className="input" placeholder="300 123 4567" />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full text-base" disabled={pending}>
        {pending ? "Creando…" : "Crear negocio"}
      </button>
    </form>
  );
}
