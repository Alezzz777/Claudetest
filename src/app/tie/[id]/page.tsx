"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import TryOn from "@/components/TryOn";

type Tie = {
  id: string;
  name: string;
  brand: string | null;
  pattern: string | null;
  colors: string[];
  material: string | null;
  widthCm: number | null;
  lengthCm: number | null;
  estPriceMin: number | null;
  estPriceMax: number | null;
  currency: string;
  condition: string | null;
  notes: string | null;
  aiSummary: string | null;
  photos: { id: string; isPrimary: boolean }[];
};

type ShirtRec = {
  recommendations: Array<{
    occasion: string;
    shirtColor: string;
    hex: string;
    pattern: string;
    reasoning: string;
  }>;
};

export default function TiePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tie, setTie] = useState<Tie | null>(null);
  const [shirts, setShirts] = useState<ShirtRec | null>(null);
  const [shirtBusy, setShirtBusy] = useState(false);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/ties/${id}`);
      const d = await r.json();
      setTie(d.tie);
    })();
  }, [id]);

  async function suggestShirts() {
    setShirtBusy(true);
    try {
      const r = await fetch("/api/match/shirt-for-tie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tieId: id }),
      });
      const d = await r.json();
      setShirts(d);
      if (d.recommendations?.[0]?.hex) setSelectedHex(d.recommendations[0].hex);
    } finally {
      setShirtBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить галстук?")) return;
    await fetch(`/api/ties/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!tie) return <div className="p-4 text-slate-400">Загрузка…</div>;
  const photo = tie.photos?.find((p) => p.isPrimary) ?? tie.photos?.[0];

  return (
    <div className="p-4 space-y-4">
      <header className="pt-2 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tie.name}</h1>
          {tie.aiSummary && <p className="text-sm text-slate-500 mt-1">{tie.aiSummary}</p>}
        </div>
        <button className="text-red-500 text-sm" onClick={remove}>Удалить</button>
      </header>

      {photo && (
        <div className="card overflow-hidden">
          <img src={`/api/photo/${photo.id}`} alt={tie.name} className="w-full max-h-[420px] object-contain bg-slate-50" />
        </div>
      )}

      <div className="card p-4 grid grid-cols-2 gap-3 text-sm">
        <Row label="Бренд" value={tie.brand} />
        <Row label="Узор" value={tie.pattern} />
        <Row label="Материал" value={tie.material} />
        <Row label="Состояние" value={tie.condition} />
        <Row label="Ширина" value={tie.widthCm ? `${tie.widthCm} см` : null} />
        <Row label="Длина" value={tie.lengthCm ? `${tie.lengthCm} см` : null} />
        <Row
          label="Цена"
          value={tie.estPriceMin || tie.estPriceMax
            ? `${tie.estPriceMin ?? "?"}–${tie.estPriceMax ?? "?"} ${tie.currency}`
            : null}
        />
        <Row label="Цвета" value={tie.colors.join(", ") || null} />
        {tie.notes && (
          <div className="col-span-2">
            <div className="label mb-1">Примечание</div>
            <div>{tie.notes}</div>
          </div>
        )}
      </div>

      <button className="btn-accent w-full" disabled={shirtBusy} onClick={suggestShirts}>
        {shirtBusy ? "Подбираем…" : "Подобрать рубашку"}
      </button>

      {shirts && (
        <div className="space-y-3">
          {shirts.recommendations.map((r, i) => (
            <button
              key={i}
              onClick={() => setSelectedHex(r.hex)}
              className={`card p-3 w-full text-left flex items-center gap-3 ${
                selectedHex === r.hex ? "ring-2 ring-accent" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-lg border border-slate-200" style={{ background: r.hex }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{r.shirtColor} · {r.occasion}</div>
                <div className="text-xs text-slate-500">{r.pattern} — {r.reasoning}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {photo && selectedHex && (
        <div>
          <div className="label mb-2">Примерка</div>
          <TryOn tiePhotoUrl={`/api/photo/${photo.id}`} shirtHex={selectedHex} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div>{value}</div>
    </div>
  );
}
