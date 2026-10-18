"use client";

import { useDeferredValue, useMemo, useState, type CSSProperties } from "react";
import { CircleCheck, Leaf, Search, X } from "lucide-react";
import { normalize } from "@/components/dashboard/food";
import { useShell } from "@/components/app/AppShell";
import { UploadPlanButton } from "@/components/shared/UploadPlanButton";
import { RecipeCard } from "./RecipeCard";
import { useRecipeActions } from "./useRecipeActions";
import { MEAL_CATEGORIES, recipeMeta, RecipeMeta } from "./recipe-meta";
import "./recipes.css";

type Props = { recipes: any[] };

type Entry = { recipe: any; meta: RecipeMeta; haystack: string };

export function RecipesView({ recipes }: Props) {
  const { openUpload } = useShell();
  const { addRecipe } = useRecipeActions();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const search = normalize(useDeferredValue(query));

  // Only dishes from the plans: a single-ingredient option ("Plátano", "Mango picado") is an ingredient, not a meal.
  const entries: Entry[] = useMemo(
    () =>
      recipes
        .map((recipe) => ({ recipe, meta: recipeMeta(recipe), haystack: normalize([recipe.name, ...(recipe.ingredients ?? []).map((item: any) => item.name)].join(" ")) }))
        .filter((entry) => entry.meta.ingredientCount > 1),
    [recipes]
  );

  const matching = search ? entries.filter((entry) => entry.haystack.includes(search)) : entries;
  // Chip counts follow the search, so a chip never promises recipes the search hides.
  const chips = MEAL_CATEGORIES.map((item) => ({ ...item, count: matching.filter((entry) => entry.meta.category.key === item.key).length })).filter((item) => item.count > 0 || item.key === category);
  const visible = category ? matching.filter((entry) => entry.meta.category.key === category) : matching;
  const inPlan = visible.filter((entry) => entry.meta.active);
  const others = visible.filter((entry) => !entry.meta.active);
  const activeTotal = entries.filter((entry) => entry.meta.active).length;

  function grid(title: string, Icon: any, list: Entry[], offset: number) {
    if (!list.length) return null;
    return (
      <section className="rx-section" aria-label={title}>
        <h2>
          <Icon size={18} /> {title} <small>{list.length}</small>
        </h2>
        <div className="rx-grid">
          {list.map(({ recipe, meta }, index) => (
            <RecipeCard key={recipe.id} recipe={recipe} meta={meta} style={{ "--i": Math.min(offset + index, 12) } as CSSProperties} onAdd={() => addRecipe(recipe)} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="rx-page">
      <header className="rx-head rx-rise">
        <div>
          <h1>Recetario</h1>
          <p>
            {entries.length ? (
              <>
                {entries.length} {entries.length === 1 ? "receta" : "recetas"} · <b>{activeTotal} en tu plan activo</b>
              </>
            ) : (
              "Las recetas de tus planes aparecerán aquí."
            )}
          </p>
        </div>
        <UploadPlanButton onClick={openUpload} />
      </header>

      {entries.length > 0 && (
        <div className="rx-toolbar rx-rise" style={{ "--i": 1 } as CSSProperties}>
          <label className="rx-search">
            <Search size={18} aria-hidden />
            <input type="search" value={query} placeholder="Buscar receta o ingrediente" aria-label="Buscar receta o ingrediente" onChange={(event) => setQuery(event.target.value)} />
            {query && (
              <button type="button" className="rx-search-clear" aria-label="Borrar búsqueda" onClick={() => setQuery("")}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="rx-chips" role="group" aria-label="Tipo de comida">
            <button type="button" className={`rx-chip${category ? "" : " is-on"}`} aria-pressed={!category} onClick={() => setCategory(null)}>
              Todas <small>{matching.length}</small>
            </button>
            {chips.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`rx-chip${category === item.key ? " is-on" : ""}`}
                aria-pressed={category === item.key}
                onClick={() => setCategory(category === item.key ? null : item.key)}
              >
                {item.label} <small>{item.count}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {grid("En tu plan activo", CircleCheck, inPlan, 0)}
      {grid("Otras recetas", Leaf, others, inPlan.length)}

      {!entries.length ? (
        <div className="rx-empty rx-rise">
          <img src="/food/pot-food.png" alt="" width={88} height={88} />
          <h2>Tu recetario está vacío</h2>
          <p>Sube el PDF de tu nutriólogo y cada opción de comida se guardará aquí como receta, con sus ingredientes.</p>
          <UploadPlanButton onClick={openUpload} />
        </div>
      ) : (
        !visible.length && (
          <div className="rx-empty">
            <img src="/food/bowl-spoon.png" alt="" width={72} height={72} />
            <h2>{query ? `Nada con “${query}”` : "No hay recetas de este tipo"}</h2>
            <p>Prueba con otro ingrediente o quita los filtros.</p>
            <button
              type="button"
              className="rx-btn is-quiet"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
            >
              Quitar filtros
            </button>
          </div>
        )
      )}
    </div>
  );
}
