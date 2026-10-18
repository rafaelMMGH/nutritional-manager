import { ArrowRight, FileUp } from "lucide-react";
import "./upload-plan-button.css";

// The "Subir plan nuevo" action: a clear secondary button shared by Hoy and Recetario.
export function UploadPlanButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="upload-plan-btn" onClick={onClick}>
      <span className="upload-plan-icon" aria-hidden>
        <FileUp size={20} />
      </span>
      <span className="upload-plan-text">
        <b>Subir plan nuevo</b>
        <small>PDF de tu nutriólogo</small>
      </span>
      <ArrowRight size={16} className="upload-plan-arrow" aria-hidden />
    </button>
  );
}
