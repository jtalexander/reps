"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["", "Home"],
  ["/teach", "Teach"],
  ["/plays", "Playbook"],
  ["/uploads", "Upload"],
  ["/sets", "Study sets"],
  ["/roster", "Roster"],
  ["/results", "Results"],
  ["/settings", "Settings"],
] as const;

export function TeamNav({ teamId }: { teamId: string }) {
  const path = usePathname();
  const base = `/t/${teamId}`;
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 font-label text-xs font-bold tracking-widest uppercase">
      {ITEMS.map(([href, label]) => {
        const full = base + href;
        const active = href === "" ? path === base : path.startsWith(full);
        return (
          <Link
            key={href}
            href={full}
            className={`shrink-0 border-b-2 px-3 py-2.5 ${active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
