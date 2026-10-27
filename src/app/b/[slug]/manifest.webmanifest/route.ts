import { getPublicBusiness } from "@/lib/data";

// Manifest propio de cada negocio: si un cliente instala la página, el ícono abre directo a ese negocio.
export async function GET(_req: Request, ctx: RouteContext<"/b/[slug]/manifest.webmanifest">) {
  const { slug } = await ctx.params;
  const data = await getPublicBusiness(slug);
  const name = data?.business.name ?? "Agenda Citas";
  const manifest = {
    name,
    short_name: name.length > 12 ? name.split(" ").slice(-1)[0].slice(0, 12) : name,
    description: `Reserva tu cita en ${name}`,
    id: `/b/${slug}`,
    start_url: `/b/${slug}`,
    scope: `/b/${slug}`,
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#0d6e5f",
    lang: "es-CO",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
