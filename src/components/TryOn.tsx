"use client";

export default function TryOn({
  tiePhotoUrl,
  shirtHex,
}: {
  tiePhotoUrl: string;
  shirtHex: string;
}) {
  // Композиция-заглушка: силуэт + цветная рубашка + фото галстука сверху.
  return (
    <div className="card overflow-hidden">
      <div className="relative w-full bg-gradient-to-b from-slate-100 to-slate-200" style={{ aspectRatio: "3 / 4" }}>
        <svg viewBox="0 0 300 400" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="skin" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#f4d4b6" />
              <stop offset="1" stopColor="#e3b894" />
            </linearGradient>
          </defs>
          {/* голова */}
          <ellipse cx="150" cy="60" rx="38" ry="46" fill="url(#skin)" />
          {/* шея */}
          <rect x="135" y="100" width="30" height="30" fill="url(#skin)" />
          {/* плечи / рубашка */}
          <path d="M40,400 C 60,210 110,150 150,150 C 190,150 240,210 260,400 Z" fill={shirtHex} />
          {/* воротник */}
          <path d="M120,140 L150,200 L180,140 L172,135 L150,175 L128,135 Z" fill="white" stroke="#cbd5e1" strokeWidth="1" />
        </svg>
        {/* галстук поверх */}
        <div
          className="absolute"
          style={{
            top: "47%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "12%",
            height: "44%",
          }}
        >
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url(${tiePhotoUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              clipPath: "polygon(30% 0, 70% 0, 100% 14%, 80% 100%, 50% 110%, 20% 100%, 0 14%)",
              boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
            }}
          />
        </div>
      </div>
      <div className="p-3 text-xs text-slate-500">
        Визуализация — упрощённая композиция. Цвет рубашки: <span className="font-mono">{shirtHex}</span>
      </div>
    </div>
  );
}
