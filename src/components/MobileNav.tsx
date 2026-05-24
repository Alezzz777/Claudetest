"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Картотека", icon: "▤" },
  { href: "/add", label: "Добавить", icon: "＋" },
  { href: "/batch", label: "Пакет", icon: "▦" },
  { href: "/match", label: "Подбор", icon: "✦" },
];

export default function MobileNav() {
  const p = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom">
      <div className="mx-auto max-w-md grid grid-cols-4">
        {items.map((it) => {
          const active = p === it.href || (it.href !== "/" && p?.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center py-2 text-xs ${active ? "text-accent" : "text-slate-500"}`}
            >
              <span className="text-lg leading-none">{it.icon}</span>
              <span className="mt-1">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
