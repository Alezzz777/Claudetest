"use client";
import { useRef, useState } from "react";

export default function PhotoPicker({
  onPicked,
  label = "Снять или выбрать фото",
  capture = true,
}: {
  onPicked: (dataUrl: string) => void;
  label?: string;
  capture?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPreview(compressed);
    onPicked(compressed);
  }

  return (
    <div className="space-y-3">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture={capture ? "environment" : undefined}
        className="hidden"
        onChange={onChange}
      />
      <button type="button" className="btn-accent w-full" onClick={() => ref.current?.click()}>
        {label}
      </button>
      {preview && (
        <div className="card overflow-hidden">
          <img src={preview} alt="preview" className="w-full max-h-80 object-contain bg-slate-50" />
        </div>
      )}
    </div>
  );
}

async function compressImage(file: File, maxSide = 1280, quality = 0.85): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
