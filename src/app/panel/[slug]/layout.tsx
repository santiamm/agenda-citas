import Link from "next/link";
import { getOwnerBusiness } from "@/lib/owner";
import { PanelNav } from "./panel-nav";

export default async function BusinessPanelLayout({ children, params }: LayoutProps<"/panel/[slug]">) {
  const { slug } = await params;
  const { business } = await getOwnerBusiness(slug);
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/panel?nuevo=1" className="min-w-0">
            <span className="block truncate font-semibold">{business.name}</span>
          </Link>
          <Link href={`/b/${business.slug}`} target="_blank" className="btn-ghost min-h-9 shrink-0 px-3 text-sm">
            Ver mi página ↗
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28">{children}</main>
      <PanelNav slug={slug} />
    </div>
  );
}
