"use client";

import { FormEvent, KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useShell } from "@/components/app/AppShell";
import { foodIcon, normalize } from "@/components/dashboard/food";
import { api, getErrorMessage } from "@/lib/client/api";

export type KnownIngredient = { name: string; category: string; unit: string };
type Props = { known: KnownIngredient[] };

const MAX_SUGGESTIONS = 8;

// "Add an ingredient by hand" row of the cart, with autocomplete over the ingredients already stored.
// Picking a suggestion also fills its usual unit and keeps its category.
export function ManualAddForm({ known }: Props) {
  const { refresh } = useShell();
  const listId = useId();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const query = normalize(name);
    if (!query) return [];
    const starts: KnownIngredient[] = [];
    const contains: KnownIngredient[] = [];
    for (const item of known) {
      const key = normalize(item.name);
      if (key === query) continue;
      if (key.startsWith(query) || key.split(/\s+/).some((word) => word.startsWith(query))) starts.push(item);
      else if (key.includes(query)) contains.push(item);
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [known, name]);

  const showList = open && suggestions.length > 0;

  function pick(item: KnownIngredient) {
    setName(item.name);
    setUnit(item.unit);
    setCategory(item.category);
    setOpen(false);
    quantityRef.current?.focus();
    quantityRef.current?.select();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(suggestions[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    const match = known.find((item) => normalize(item.name) === normalize(name));
    setBusy(true);
    try {
      await api("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({ source_type: "manual", name: name.trim(), quantity: Number(quantity) || 1, unit: unit.trim(), category: category ?? match?.category })
      });
      setName("");
      setQuantity("1");
      setUnit("");
      setCategory(undefined);
      toast.success("Ingrediente agregado");
      refresh();
    } catch (err) {
      toast.error("No se pudo agregar el ingrediente", { description: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="manual-add" onSubmit={submit}>
      <div className="combo">
        <input
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            // Editing after a pick: drop the picked ingredient's unit and category.
            if (category !== undefined) {
              setUnit("");
              setCategory(undefined);
            }
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Agregar ingrediente manual"
          aria-label="Ingrediente"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${highlight}` : undefined}
          required
        />
        {showList && (
          <ul className="combo-list" id={listId} role="listbox" aria-label="Ingredientes guardados">
            {suggestions.map((item, index) => (
              <li
                key={`${item.name}:${item.unit}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? "on" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(item)}
              >
                <img src={foodIcon(item.name, item.category)} alt="" width={26} height={26} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.category}{item.unit ? ` · ${item.unit}` : ""}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <input ref={quantityRef} name="quantity" type="number" min="0.1" step="0.1" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label="Cantidad" />
      <input name="unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="unidad" aria-label="Unidad" />
      <button type="submit" className="order-cta small" disabled={busy}><Plus size={16} /> Agregar</button>
    </form>
  );
}
