"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  ["", "Home"],
  ["/plays", "Playbook"],
  ["/uploads", "Upload"],
  ["/concepts", "Concepts"],
  ["/sets", "Study sets"],
  ["/roster", "Roster"],
  ["/results", "Results"],
  ["/settings", "Settings"],
] as const;

export function TeamNav({ teamId }: { teamId: string }) {
  const path = usePathname();
  const base = `/t/${teamId}`;
  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
      {ITEMS.map(([href, label]) => {
        const full = base + href;
        const active = href === "" ? path === base : path.startsWith(full);
        return (
          <Link
            key={href}
            href={full}
            className={`shrink-0 rounded-md px-3 py-1.5 ${active ? "bg-white/15 font-semibold" : "opacity-80 hover:opacity-100"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
