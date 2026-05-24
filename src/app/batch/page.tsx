"use client";
import { useState } from "react";
import PhotoPicker from "@/components/PhotoPicker";

type Item = {
  index: number;
  location: string;
  candidates: { name: string; confidence: number }[];
  pattern: string;
  colors: string[];
  notes: string;
};

export default function BatchPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPicked(dataUrl: string) {
    setBusy(true);
    setErr(null);
    setItems([]);
    try {
      const r = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setItems(d.ties ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Пакетная обработка</h1>
        <p className="text-sm text-slate-500">Фото с несколькими галстуками — AI выделит и предложит названия</p>
      </header>
      <PhotoPicker onPicked={onPicked} label="Снять фото с галстуками" />
      {busy && <div className="text-center text-slate-500 py-4">AI распознаёт…</div>}
      {err && <div className="card p-3 bg-red-50 text-red-700 text-sm">{err}</div>}
      {items.map((it) => (
        <div key={it.index} className="card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">#{it.index} · {it.location}</div>
            <div className="text-xs text-slate-500">{it.pattern}</div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {it.colors?.map((c) => (
              <span key={c} className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full">{c}</span>
            ))}
          </div>
          <ul className="space-y-1">
            {it.candidates?.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span className="text-xs text-slate-500">{Math.round(c.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
          {it.notes && <div className="text-xs text-slate-500">{it.notes}</div>}
        </div>
      ))}
    </div>
  );
}
