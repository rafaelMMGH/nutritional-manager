import Link from "next/link";

export default function RecipeNotFound() {
  return (
    <div className="empty">
      Esta receta no existe o está en la papelera. <Link href="/recipes">Volver al recetario</Link>
    </div>
  );
}
