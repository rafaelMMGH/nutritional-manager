"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { plural } from "@/components/dashboard/food";
import { ViewTransition } from "@/components/shared/ViewTransition";
import type { RecipeMeta } from "./recipe-meta";
import { useAddState } from "./useAddState";

type Props = {
  recipe: any;
  meta: RecipeMeta;
  style?: CSSProperties;
  onAdd: () => Promise<boolean>;
};

// The whole card opens the recipe (its title link stretches over it); the cart button sits above that link.
export function RecipeCard({ recipe, meta, style, onAdd }: Props) {
  const [state, add] = useAddState(onAdd);
  return (
    <article className="rx-card" style={style}>
      <ViewTransition name={`recipe-image-${recipe.id}`} share="morph" default="none">
        <div className={`rx-media tone-${meta.tone}`}>
          <img src={meta.icon} alt="" className="rx-dish" />
          {meta.extras.map((icon, index) => (
            <img key={icon} src={icon} alt="" className={`rx-float f${index}`} />
          ))}
        </div>
      </ViewTransition>
      <div className="rx-body">
        <ViewTransition name={`recipe-title-${recipe.id}`} share="text-morph" default="none">
          <h3 title={recipe.name}>
            <Link href={`/recipes/${recipe.id}`} prefetch className="rx-open">
              {recipe.name}
            </Link>
          </h3>
        </ViewTransition>
        <p className="rx-meta">
          <span className={`rx-tag tone-${meta.tone}`}>{meta.category.label}</span>
          {plural(meta.ingredientCount, "ingrediente", "ingredientes")}
        </p>
        {meta.groups.length > 0 && (
          <p className="rx-groups" aria-label={`Grupos: ${meta.groups.map((group) => group.label).join(", ")}`}>
            {meta.groups.slice(0, 5).map((group) => (
              <i key={group.key} style={{ background: group.color }} title={group.label} />
            ))}
          </p>
        )}
      </div>
      <button
        type="button"
        className="rx-add"
        data-state={state}
        disabled={state !== "idle"}
        aria-label={state === "added" ? `${recipe.name} agregada al carrito` : `Agregar ingredientes de ${recipe.name} al carrito`}
        title="Agregar al carrito"
        onClick={add}
      >
        {state === "added" ? <Check size={18} strokeWidth={2.5} /> : <ShoppingCart size={18} />}
      </button>
    </article>
  );
}
