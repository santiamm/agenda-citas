"use client";

import { useEffect, useRef, useState } from "react";
import { simulateBotAction } from "./actions";

type Msg = { from: "client" | "bot"; text: string };

export function BotSimulator({ slug }: { slug: string }) {
  const [phone, setPhone] = useState("3000000001");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [msgs]);

  async function send(value: string) {
    if (!value.trim() || busy) return;
    setMsgs((m) => [...m, { from: "client", text: value }]);
    setText("");
    setBusy(true);
    const replies = await simulateBotAction(slug, phone, value).catch(() => ["Error al contactar el bot."]);
    setMsgs((m) => [...m, ...replies.map((r) => ({ from: "bot" as const, text: r }))]);
    setBusy(false);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-[#075e54] px-4 py-2 text-sm text-white">
        <span>Cliente de prueba:</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-36 rounded bg-white/15 px-2 py-1 text-white outline-none"
          aria-label="Celular de prueba"
          inputMode="tel"
        />
      </div>
      <div className="h-96 space-y-2 overflow-y-auto bg-[#ece5dd] p-3">
        {msgs.length === 0 && <p className="text-center text-sm text-stone-600">Escribe «hola» para empezar.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.from === "client" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm ${
                m.from === "client" ? "bg-[#dcf8c6]" : "bg-white"
              }`}
            >
              {m.text.replace(/\*(.+?)\*/g, "$1")}
            </p>
          </div>
        ))}
        {busy && <p className="text-sm text-stone-600">escribiendo…</p>}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="Escribe un mensaje" aria-label="Mensaje" />
        <button className="btn-primary shrink-0" disabled={busy}>
          Enviar
        </button>
      </form>
      <div className="flex flex-wrap gap-1 px-2 pb-2">
        {["hola", "1", "2", "3", "0"].map((q) => (
          <button key={q} type="button" className="rounded-full border border-line px-3 py-1 text-sm" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
