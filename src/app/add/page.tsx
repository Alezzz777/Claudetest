"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoPicker from "@/components/PhotoPicker";

type Analyzed = {
  name: string;
  brand: string | null;
  pattern: string;
  colors: string[];
  material: string | null;
  widthCm: number | null;
  lengthCm: number | null;
  estPriceMin: number | null;
  estPriceMax: number | null;
  currency: string;
  condition: string | null;
  notes: string;
  summary: string;
};

export default function AddPage() {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<Analyzed | null>(null);
  const [matched, setMatched] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<"idle" | "analyzing" | "saving">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function onPhoto(dataUrl: string) {
    setPhoto(dataUrl);
    setAnalyzed(null);
    setMatched(null);
    setErr(null);
    setBusy("analyzing");
    try {
      const r = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка анализа");
      setAnalyzed(d.analyzed);
      setMatched(d.matched);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
    }
  }

  function patch<K extends keyof Analyzed>(k: K, v: Analyzed[K]) {
    if (!analyzed) return;
    setAnalyzed({ ...analyzed, [k]: v });
  }

  async function save() {
    if (!analyzed || !photo) return;
    setBusy("saving");
    try {
      const r = await fetch("/api/ties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...analyzed, aiSummary: analyzed.summary, photo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ошибка сохранения");
      router.push(`/tie/${d.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy("idle");
    }
  }

  return (
    <div className="p-4 space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Новый галстук</h1>
        <p className="text-sm text-slate-500">Сфотографируйте — AI заполнит карточку</p>
      </header>

      <PhotoPicker onPicked={onPhoto} />

      {busy === "analyzing" && <div className="text-center text-slate-500 py-4">AI анализирует фото…</div>}
      {err && <div className="card p-3 bg-red-50 text-red-700 text-sm">{err}</div>}

      {matched && (
        <div className="card p-3 bg-amber-50 border-amber-200 text-sm">
          Похоже на уже сохранённый: <a className="font-medium underline" href={`/tie/${matched.id}`}>{matched.name}</a>
        </div>
      )}

      {analyzed && (
        <div className="card p-4 space-y-3">
          <Field label="Название" value={analyzed.name} onChange={(v) => patch("name", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Бренд" value={analyzed.brand ?? ""} onChange={(v) => patch("brand", v || null)} />
            <Field label="Узор" value={analyzed.pattern} onChange={(v) => patch("pattern", v)} />
          </div>
          <Field
            label="Цвета (через запятую)"
            value={analyzed.colors.join(", ")}
            onChange={(v) => patch("colors", v.split(",").map((s) => s.trim()).filter(Boolean))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Материал" value={analyzed.material ?? ""} onChange={(v) => patch("material", v || null)} />
            <Field label="Состояние" value={analyzed.condition ?? ""} onChange={(v) => patch("condition", v || null)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Ширина, см" value={analyzed.widthCm} onChange={(v) => patch("widthCm", v)} />
            <NumField label="Длина, см" value={analyzed.lengthCm} onChange={(v) => patch("lengthCm", v)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Цена от" value={analyzed.estPriceMin} onChange={(v) => patch("estPriceMin", v)} />
            <NumField label="Цена до" value={analyzed.estPriceMax} onChange={(v) => patch("estPriceMax", v)} />
            <Field label="Валюта" value={analyzed.currency} onChange={(v) => patch("currency", v)} />
          </div>
          <div>
            <div className="label mb-1">Примечание</div>
            <textarea className="input min-h-[80px]" value={analyzed.notes} onChange={(e) => patch("notes", e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy === "saving"} onClick={save}>
            {busy === "saving" ? "Сохраняем…" : "Сохранить в картотеку"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="label mb-1">{label}</div>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <div className="label mb-1">{label}</div>
      <input
        className="input"
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}
