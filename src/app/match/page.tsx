"use client";
import { useState } from "react";
import PhotoPicker from "@/components/PhotoPicker";
import TryOn from "@/components/TryOn";

type Result = {
  shirt: { color: string; pattern: string; formality: string; hex: string };
  fromCollection: Array<{ id: string; reasoning: string; name?: string; pattern?: string | null; colors?: string[] }>;
  generic: Array<{ color: string; hex: string; pattern: string; reasoning: string }>;
};

export default function MatchPage() {
  const [shirtPhoto, setShirtPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedTieId, setSelectedTieId] = useState<string | null>(null);

  async function onPicked(dataUrl: string) {
    setShirtPhoto(dataUrl);
    setResult(null);
    setSelectedTieId(null);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/match/tie-for-shirt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка");
      setResult(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Подбор галстука</h1>
        <p className="text-sm text-slate-500">Сфотографируйте рубашку — AI подберёт галстуки</p>
      </header>
      <PhotoPicker onPicked={onPicked} label="Снять фото рубашки" />
      {busy && <div className="text-center text-slate-500 py-4">AI подбирает…</div>}
      {err && <div className="card p-3 bg-red-50 text-red-700 text-sm">{err}</div>}
      {result && (
        <>
          <div className="card p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ background: result.shirt.hex }} />
            <div className="text-sm">
              <div className="font-medium">{result.shirt.color} рубашка</div>
              <div className="text-slate-500">{result.shirt.pattern} · {result.shirt.formality}</div>
            </div>
          </div>

          {result.fromCollection.length > 0 && (
            <section>
              <div className="label mb-2">Из вашей коллекции</div>
              <div className="space-y-2">
                {result.fromCollection.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedTieId(r.id)}
                    className={`card p-3 w-full text-left flex items-center gap-3 ${
                      selectedTieId === r.id ? "ring-2 ring-accent" : ""
                    }`}
                  >
                    <img src={`/api/photo/by-tie/${r.id}`} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.name ?? r.id}</div>
                      <div className="text-xs text-slate-500">{r.reasoning}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {result.generic.length > 0 && (
            <section>
              <div className="label mb-2">Общие рекомендации</div>
              <div className="space-y-2">
                {result.generic.map((g, i) => (
                  <div key={i} className="card p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ background: g.hex }} />
                    <div className="text-sm flex-1">
                      <div className="font-medium">{g.color} · {g.pattern}</div>
                      <div className="text-slate-500">{g.reasoning}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedTieId && (
            <div>
              <div className="label mb-2">Примерка</div>
              <TryOn tiePhotoUrl={`/api/photo/by-tie/${selectedTieId}`} shirtHex={result.shirt.hex} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
