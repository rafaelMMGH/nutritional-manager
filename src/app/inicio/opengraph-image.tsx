import { ImageResponse } from "next/og";

export const alt = "Nutritional Manager: sigue tu plan de alimentación sin volver a abrir el PDF";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#f4f4f7", color: "#16171d" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 700 }}>
          <div style={{ width: 64, height: 64, borderRadius: 9999, background: "#43896d", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>N</div>
          Nutritional Manager
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em" }}>Sigue tu plan de alimentación sin volver a abrir el PDF</div>
          <div style={{ fontSize: 32, color: "#6b6e7a" }}>Horarios, recetas y lista de compras desde el plan de tu nutriólogo.</div>
        </div>
      </div>
    ),
    size
  );
}
