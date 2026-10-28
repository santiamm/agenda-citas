"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn-primary mt-3" onClick={() => window.print()}>
      Imprimir / guardar PDF
    </button>
  );
}
