import Link from "next/link";

export default function TieCard({
  tie,
}: {
  tie: {
    id: string;
    name: string;
    brand: string | null;
    pattern: string | null;
    colors: string[];
    photos: { id: string }[];
  };
}) {
  const photo = tie.photos?.[0];
  return (
    <Link href={`/tie/${tie.id}`} className="card overflow-hidden flex items-center gap-3 p-3">
      <div className="w-16 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
        {photo ? (
          <img src={`/api/photo/${photo.id}`} alt={tie.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">▦</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{tie.name}</div>
        <div className="text-xs text-slate-500 truncate">
          {[tie.brand, tie.pattern].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="mt-1 flex gap-1 flex-wrap">
          {tie.colors?.slice(0, 4).map((c) => (
            <span key={c} className="text-[10px] px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">{c}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
