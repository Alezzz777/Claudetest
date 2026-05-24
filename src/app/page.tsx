"use client";
import { useEffect, useState } from "react";
import TieCard from "@/components/TieCard";

type Tie = {
  id: string;
  name: string;
  brand: string | null;
  pattern: string | null;
  colors: string[];
  photos: { id: string }[];
};

export default function HomePage() {
  const [ties, setTies] = useState<Tie[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(query = "") {
    setLoading(true);
    const r = await fetch(`/api/ties${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    const d = await r.json();
    setTies(d.ties);
    setLoading(false);
  }
  useEffect(() => { load(""); }, []);

  return (
    <div className="p-4 space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Картотека</h1>
        <p className="text-sm text-slate-500">{ties.length} галстук(ов)</p>
      </header>
      <input
        className="input"
        placeholder="Поиск по названию, бренду…"
        value={q}
        onChange={(e) => { setQ(e.target.value); load(e.target.value); }}
      />
      {loading && <div className="text-center text-slate-400 py-8">Загрузка…</div>}
      {!loading && ties.length === 0 && (
        <div className="card p-8 text-center text-slate-500">
          Пока пусто. Нажмите «Добавить» и сфотографируйте первый галстук.
        </div>
      )}
      <div className="space-y-3">
        {ties.map((t) => <TieCard key={t.id} tie={t} />)}
      </div>
    </div>
  );
}
