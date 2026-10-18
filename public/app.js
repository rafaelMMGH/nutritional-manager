const state = {
  user: null,
  view: "dashboard",
  data: {},
  uploadWizard: null,
  chat: []
};

const nav = [
  ["dashboard", "⌂", "Dashboard"],
  ["plans", "▣", "Meal Plans"],
  ["recipes", "◫", "Recipes"],
  ["planning", "◷", "Planificacion"],
  ["lists", "☑", "Listas"],
  ["templates", "▤", "Plantillas"],
  ["settings", "⚙", "Configuracion"],
  ["trash", "⌫", "Papelera"]
];

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body instanceof Blob ? options.headers : { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  const type = res.headers.get("content-type") || "";
  return type.includes("application/json") ? res.json() : res.text();
}

function html(strings, ...values) {
  return strings.map((part, i) => part + (values[i] ?? "")).join("");
}

function escape(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function qty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? n : Number(n.toFixed(2));
}

function toast(message, { description = "", type = "default", duration = 4200, actions = [] } = {}) {
  let region = $("#toastRegion");
  if (!region) {
    region = document.createElement("div");
    region.id = "toastRegion";
    region.className = "toast-region";
    document.body.appendChild(region);
  }
  const item = document.createElement("div");
  item.className = `legacy-toast ${type}`;
  item.innerHTML = html`
    <strong>${escape(message)}</strong>
    ${description ? `<p>${escape(description)}</p>` : ""}
    ${actions.length ? `<div class="toast-actions"></div>` : ""}
  `;
  const close = () => item.remove();
  const actionsNode = item.querySelector(".toast-actions");
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.textContent = action.label;
    button.className = action.kind === "primary" ? "primary" : "";
    button.addEventListener("click", () => {
      action.onClick?.();
      close();
    });
    actionsNode?.appendChild(button);
  });
  region.appendChild(item);
  if (duration !== Infinity) setTimeout(close, duration);
  return close;
}

function confirmDialog(message, description, confirmLabel = "Confirmar") {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "legacy-dialog-backdrop";
    backdrop.innerHTML = html`
      <section class="legacy-dialog" role="dialog" aria-modal="true" aria-labelledby="legacyDialogTitle">
        <h2 id="legacyDialogTitle">${escape(message)}</h2>
        <p>${escape(description)}</p>
        <div class="toast-actions">
          <button data-dialog-cancel>Cancelar</button>
          <button class="primary" data-dialog-confirm>${escape(confirmLabel)}</button>
        </div>
      </section>
    `;
    const close = (confirmed) => {
      backdrop.remove();
      resolve(confirmed);
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(false);
    });
    backdrop.querySelector("[data-dialog-cancel]").addEventListener("click", () => close(false));
    backdrop.querySelector("[data-dialog-confirm]").addEventListener("click", () => close(true));
    document.body.appendChild(backdrop);
  });
}

async function loadAll() {
  const [dashboard, plans, recipes, cart, lists, templates, trash, settings] = await Promise.all([
    api("/api/dashboard"),
    api("/api/plans"),
    api("/api/recipes"),
    api("/api/cart"),
    api("/api/shopping-lists"),
    api("/api/templates"),
    api("/api/trash"),
    api("/api/settings")
  ]);
  state.data = { dashboard, plans, recipes, cart, lists, templates, trash, settings };
}

async function boot() {
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
    await loadAll();
    render();
  } catch {
    renderLogin();
  }
}

function renderLogin() {
  $("#app").innerHTML = html`
    <section class="login">
      <form id="loginForm">
        <div class="brand"><span class="mark">N</span><span>Nutritional Manager</span></div>
        <h1>Tu sistema nutricional privado</h1>
        <p class="muted">Inicia sesion para administrar planes, recetas, carrito, listas y consultas.</p>
        <div class="stack">
          <label>Email<input name="email" type="email" value="demo@nutritional.local" required /></label>
          <label>Nombre<input name="name" value="Rafael" required /></label>
          <button class="primary">Entrar</button>
        </div>
      </form>
    </section>`;
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { user } = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    state.user = user;
    await loadAll();
    render();
  });
}

function render() {
  $("#app").innerHTML = html`
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><span class="mark">N</span><span>Nutritional Manager</span></div>
        <nav class="nav">
          ${nav.map(([key, icon, label]) => `<button class="${state.view === key ? "active" : ""}" data-view="${key}" title="${label}"><span>${icon}</span><span>${label}</span></button>`).join("")}
        </nav>
      </aside>
      <main class="content">
        ${renderView()}
      </main>
      ${renderGlobalPanel()}
    </div>
    ${state.uploadWizard ? renderWizard() : ""}`;
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", async () => {
    state.view = button.dataset.view;
    await loadAll();
    render();
  }));
  bindView();
  bindGlobalPanel();
  bindWizard();
}

function page(title, subtitle, actions, body) {
  return html`
    <div class="topbar">
      <div><h1>${title}</h1><p class="muted">${subtitle}</p></div>
      <div class="toolbar">${actions || ""}</div>
    </div>
    ${body}`;
}

function renderView() {
  const map = {
    dashboard: renderDashboard,
    plans: renderPlans,
    recipes: renderRecipes,
    planning: renderPlanning,
    lists: renderLists,
    templates: renderTemplates,
    settings: renderSettings,
    trash: renderTrash
  };
  return map[state.view]();
}

function renderDashboard() {
  const d = state.data.dashboard;
  return page("Dashboard", "Resumen operativo del sistema.", `<button class="primary" id="openUpload">Subir PDF</button>`, html`
    <section class="grid cols-3">
      ${metric("Plan activo", d.activePlan?.name || "Sin plan", d.activePlan ? d.activePlan.objective : "Sube un PDF para comenzar")}
      ${metric("Carrito", d.cartCount, `${d.cartIngredients} ingredientes consolidados`)}
      ${metric("Ultima lista", d.lastList?.name || "Sin listas", d.lastList ? new Date(d.lastList.created_at).toLocaleString("es-MX") : "Genera una desde el carrito")}
      ${metric("Listas generadas", d.listsCount, "Historial disponible")}
      ${metric("Recetas", d.recipesCount, "Extraidas de planes")}
      ${metric("Dias planificados", d.plannedDays, "Acumulado en carrito")}
    </section>
    <section class="panel" style="margin-top:14px">
      <h2>Flujo rapido</h2>
      <div class="toolbar">
        <button data-jump="plans">Revisar planes</button>
        <button data-jump="planning">Planificar periodo</button>
        <button data-jump="lists">Ver listas</button>
      </div>
    </section>`);
}

function metric(label, value, note) {
  return `<article class="panel metric"><span class="muted">${label}</span><strong>${escape(value)}</strong><small class="muted">${escape(note)}</small></article>`;
}

function renderPlans() {
  const plans = state.data.plans.plans;
  return page("Planes", "Sube PDFs, revisa extracciones, activa o archiva planes.", `<button class="primary" id="openUpload">Subir PDF</button>`, html`
    <section class="list">
      ${plans.length ? plans.map((plan) => `
        <article class="item">
          <div class="row between">
            <div>
              <h3>${escape(plan.name)}</h3>
              <div class="row">
                <span class="badge ${plan.status === "active" ? "ok" : ""}">${plan.status}</span>
                <span class="badge ${plan.processing_status === "confirmed" ? "ok" : "warn"}">${plan.processing_status}</span>
                <span class="badge">v${plan.current_version?.version_number || 1}</span>
              </div>
            </div>
            <div class="toolbar">
              ${plan.status !== "active" ? `<button data-activate="${plan.id}">Activar</button>` : ""}
              <button data-confirm="${plan.id}">Confirmar</button>
              <button class="danger" data-delete-plan="${plan.id}">Eliminar</button>
            </div>
          </div>
          <p class="muted">${escape(plan.objective || "")}</p>
        </article>`).join("") : `<div class="empty">No hay planes todavia.</div>`}
    </section>`);
}

function renderRecipes() {
  const recipes = state.data.recipes.recipes;
  return page("Recetario", "Recetas reutilizables extraidas de todos los planes.", "", html`
    <section class="list">
      ${recipes.length ? recipes.map((recipe) => `
        <article class="item ${recipe.appearances.some((a) => a.plan_status === "archived") ? "warning" : ""}">
          <div class="row between">
            <div>
              <h3>${escape(recipe.name)}</h3>
              <p class="muted">${recipe.ingredients.map((item) => `${escape(item.name)} ${qty(item.quantity)} ${escape(item.unit)}`).join(" · ")}</p>
              <div class="row">${recipe.appearances.map((app) => `<span class="badge">${escape(app.meal_type || "Comida")} · ${escape(app.plan_status || "")}</span>`).join("")}</div>
            </div>
            <div class="toolbar">
              <button data-add-recipe="${recipe.id}">Agregar</button>
              <button class="danger" data-delete-recipe="${recipe.id}">Eliminar</button>
            </div>
          </div>
        </article>`).join("") : `<div class="empty">El recetario se llenara al procesar tu primer PDF.</div>`}
    </section>`);
}

function renderPlanning() {
  const active = state.data.dashboard.activePlan;
  const recipes = state.data.recipes.recipes;
  return page("Planificacion", "Selecciona comidas para un periodo y envialas al carrito global.", "", html`
    <section class="split">
      <form class="panel stack" id="planningForm">
        <h2>Periodo</h2>
        <label>Modo
          <select name="mode"><option value="simple">Dia 1, Dia 2...</option><option value="calendar">Calendario</option></select>
        </label>
        <div class="grid cols-3">
          <button type="button" data-days="5">5 dias</button>
          <button type="button" data-days="7">1 semana</button>
          <button type="button" data-days="14">1 quincena</button>
        </div>
        <div class="grid cols-2">
          <label>Inicio<input name="start" type="date" /></label>
          <label>Fin<input name="end" type="date" /></label>
        </div>
        <label>Total dias<input name="days" type="number" min="1" value="7" /></label>
        <label>Dias de entrenamiento<input name="training_days" type="number" min="0" value="0" /></label>
        <label>Recetas
          <select name="recipes" multiple size="8">
            ${recipes.map((recipe) => `<option value="${recipe.id}">${escape(recipe.name)}</option>`).join("")}
          </select>
        </label>
        <label><input name="include_add_ons" type="checkbox" checked style="width:auto" /> Incluir add-ons obligatorios</label>
        <button class="primary" ${recipes.length ? "" : "disabled"}>Agregar seleccion al carrito</button>
      </form>
      <aside class="panel">
        <h2>Plan activo</h2>
        ${active ? `<p><strong>${escape(active.name)}</strong></p><p class="muted">${escape(active.objective)}</p>` : `<div class="empty">No hay plan activo.</div>`}
        <p class="muted">Una sola receta se repite por todo el periodo. Varias recetas se rotan automaticamente al consolidar cantidades.</p>
      </aside>
    </section>`);
}

function renderLists() {
  const lists = state.data.lists.lists;
  return page("Listas de compras", "Snapshots congelados generados desde el carrito.", `<button class="primary" id="generateList">Generar desde carrito</button>`, html`
    <section class="list">
      ${lists.length ? lists.map((list) => `
        <article class="item">
          <div class="row between">
            <div><h3>${escape(list.name)}</h3><p class="muted">${list.items.length} ingredientes · ${new Date(list.created_at).toLocaleString("es-MX")}</p></div>
            <div class="toolbar">
              <button data-export="${list.id}" data-format="markdown">MD</button>
              <button data-export="${list.id}" data-format="json">JSON</button>
              <button data-template="${list.id}">Plantilla</button>
              <button class="danger" data-delete-list="${list.id}">Eliminar</button>
            </div>
          </div>
          <table class="table">
            <thead><tr><th>Estado</th><th>Ingrediente</th><th>Cantidad</th><th>Categoria</th></tr></thead>
            <tbody>${list.items.map((item) => `
              <tr>
                <td><select data-list-item="${list.id}:${item.id}"><option ${item.status === "Pendiente" ? "selected" : ""}>Pendiente</option><option ${item.status === "Comprado" ? "selected" : ""}>Comprado</option><option ${item.status === "No encontrado" ? "selected" : ""}>No encontrado</option><option ${item.status === "Omitido" ? "selected" : ""}>Omitido</option><option ${item.status === "Sustituido manualmente" ? "selected" : ""}>Sustituido manualmente</option></select></td>
                <td>${escape(item.name_snapshot)}</td><td>${qty(item.quantity_snapshot)} ${escape(item.unit_snapshot)}</td><td>${escape(item.category_snapshot)}</td>
              </tr>`).join("")}</tbody>
          </table>
        </article>`).join("") : `<div class="empty">Aun no hay listas generadas.</div>`}
    </section>`);
}

function renderTemplates() {
  const templates = state.data.templates.templates;
  return page("Plantillas", "Creadas a partir de listas generadas.", "", html`
    <section class="list">
      ${templates.length ? templates.map((template) => `
        <article class="item">
          <div class="row between">
            <div><h3>${escape(template.name)}</h3><p class="muted">${escape(template.description || "Sin descripcion")}</p></div>
            <div class="toolbar">
              <button data-load-template="${template.id}" data-mode="replace">Reemplazar carrito</button>
              <button data-load-template="${template.id}" data-mode="append">Agregar</button>
            </div>
          </div>
        </article>`).join("") : `<div class="empty">Guarda una lista como plantilla para verla aqui.</div>`}
    </section>`);
}

function renderSettings() {
  const { ingredients, settings } = state.data.settings;
  return page("Configuracion", "Catalogo maestro, categorias y defaults.", "", html`
    <section class="grid cols-2">
      <article class="panel">
        <h2>Ingredientes</h2>
        <table class="table"><thead><tr><th>Nombre</th><th>Categoria</th><th>Unidad</th></tr></thead>
        <tbody>${ingredients.map((item) => `<tr><td>${escape(item.canonical_name)}</td><td>${escape(item.category)}</td><td>${escape(item.primary_unit)}</td></tr>`).join("")}</tbody></table>
      </article>
      <article class="panel">
        <h2>Al gusto</h2>
        <p class="muted">Excluidos: ${settings.excludedAlGusto.join(", ")}</p>
        <table class="table"><thead><tr><th>Ingrediente</th><th>Default</th></tr></thead>
        <tbody>${Object.entries(settings.alGustoDefaults).map(([name, data]) => `<tr><td>${escape(name)}</td><td>${qty(data.quantity)} ${escape(data.unit)}</td></tr>`).join("")}</tbody></table>
      </article>
    </section>`);
}

function renderTrash() {
  const items = state.data.trash.items;
  return page("Papelera", "Eliminacion logica con restauracion.", "", html`
    <section class="list">
      ${items.length ? items.map((item) => `
        <article class="item">
          <div class="row between">
            <div><h3>${escape(item.name)}</h3><p class="muted">${escape(item.type)} · ${new Date(item.deleted_at).toLocaleString("es-MX")}</p></div>
            <button data-restore="${item.type}:${item.id}">Restaurar</button>
          </div>
        </article>`).join("") : `<div class="empty">La papelera esta vacia.</div>`}
    </section>`);
}

function renderGlobalPanel() {
  const cart = state.data.cart;
  return html`
    <aside class="cart-chat">
      <section class="drawer">
        <div class="row between"><h2>Carrito global</h2><button class="icon" id="clearCart" title="Vaciar carrito">×</button></div>
        <form class="row" id="manualIngredient">
          <input name="name" placeholder="Ingrediente manual" required />
          <input name="quantity" type="number" min="0.1" step="0.1" value="1" style="max-width:84px" />
          <input name="unit" placeholder="unidad" style="max-width:100px" />
          <button>Agregar</button>
        </form>
        <div class="list" style="margin-top:12px">
          ${cart.ingredients.length ? cart.ingredients.map((item) => `<div class="item"><strong>${escape(item.name)}</strong><br><span class="muted">${qty(item.quantity)} ${escape(item.unit)} · ${escape(item.category)}</span></div>`).join("") : `<div class="empty">El carrito esta vacio.</div>`}
        </div>
      </section>
      <section class="drawer">
        <h2>Chat RAG</h2>
        <select id="chatScope">
          ${["Automático", "Plan activo", "Carrito actual", "Recetario", "Historial de listas", "Plantillas", "Planes archivados", "Todo el sistema"].map((scope) => `<option>${scope}</option>`).join("")}
        </select>
        <div class="chat-log" style="margin-top:10px">
          ${state.chat.map((msg) => `<div class="bubble ${msg.role === "user" ? "user" : ""}">${escape(msg.text)}</div>`).join("") || `<div class="empty">Pregunta por tu plan, carrito, recetas o listas.</div>`}
        </div>
        <form id="chatForm" class="row">
          <input name="message" placeholder="Ej. Que ingredientes necesito comprar?" required />
          <button class="primary">Enviar</button>
        </form>
      </section>
    </aside>`;
}

function renderWizard() {
  const wizard = state.uploadWizard;
  const steps = ["Subir", "Procesar", "Datos", "Comidas", "Ingredientes", "Suplementos", "Duplicados", "Confirmar"];
  const data = wizard.data?.structured_data;
  return html`
    <div class="modal-backdrop">
      <section class="modal">
        <header>
          <div class="row between"><h2>Creación de Plan Nutricional</h2><button class="icon modal-close" id="closeWizard" title="Cerrar" aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
          <div class="steps">${steps.map((_, index) => `<span class="step ${index <= wizard.step ? "done" : ""}"></span>`).join("")}</div>
          <span class="badge">${steps[wizard.step]}</span>
        </header>
        <main>${renderWizardStep(data, wizard.step)}</main>
        <footer class="row between">
          <button id="prevStep" ${wizard.step === 0 ? "disabled" : ""}>Anterior</button>
          <div class="toolbar">
            ${data ? `<button id="nextStep" ${wizard.step === 7 ? "disabled" : ""}>${wizard.step === 7 ? "Guardar revision" : "Siguiente"}</button>` : ""}
            ${wizard.step === 7 ? `<button class="primary" id="confirmPlan">Confirmar plan</button>` : ""}
          </div>
        </footer>
      </section>
    </div>`;
}

function renderWizardStep(data, step) {
  if (!data) {
    return html`<form id="uploadForm" class="stack">
      <p class="muted">Sube el PDF privado del plan. El MVP guarda el archivo localmente y extrae estructura inicial cuando el texto esta disponible.</p>
      <input name="pdf" type="file" accept="application/pdf" required />
      <button class="primary">Procesar PDF</button>
    </form>`;
  }
  if (step === 1) return `<div class="panel review-card"><div><h3>Procesamiento completado</h3><p class="review-status"><strong>Estado:</strong> Revisión necesaria.</p></div><p class="review-note">Revisa campos con baja confianza antes de confirmar.</p></div>`;
  if (step === 2) return `<div class="grid cols-2"><label>Nombre<input value="${escape(data.name)}"></label></div>`;
  if (step === 3) return `<div class="list">${data.meals.map((meal) => `<div class="item"><h3>${escape(meal.name)}</h3><p class="muted">${meal.options.length} opcion(es)</p></div>`).join("")}</div>`;
  if (step === 4) return `<div class="list">${data.meals.flatMap((meal) => meal.options.map((option) => `<div class="item ${option.requires_review ? "warning" : ""}"><h3>${escape(option.recipe.name)}</h3><p>${option.recipe.ingredients.map((item) => `${escape(item.name)} ${qty(item.quantity)} ${escape(item.unit)}`).join(" · ")}</p><span class="badge ${option.requires_review ? "warn" : "ok"}">confianza ${Math.round(option.confidence_score * 100)}%</span></div>`)).join("")}</div>`;
  if (step === 5) return `<div class="grid cols-2"><div class="panel"><h3>Suplementos</h3><p>${(data.supplements || []).map((item) => escape(item.name)).join(", ") || "Sin suplementos detectados"}</p></div><div class="panel"><h3>Recomendaciones</h3><p class="muted">${escape(data.recommendations)}</p></div></div>`;
  if (step === 6) return `<div class="panel"><h3>Duplicados</h3><p class="muted">El backend reutiliza recetas con el mismo hash canonico de ingredientes, cantidades y unidades.</p></div>`;
  return `<div class="panel"><h3>Listo para confirmar</h3><p class="muted">Confirmar cambia el estado del plan a confirmed y lo deja utilizable.</p></div>`;
}

function bindView() {
  $("#openUpload")?.addEventListener("click", () => {
    state.uploadWizard = { step: 0, data: null };
    render();
  });
  document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.jump;
    render();
  }));
  document.querySelectorAll("[data-activate]").forEach((button) => button.addEventListener("click", async () => {
    if (!await confirmDialog("Activar plan", "Esto archivara el plan activo actual.", "Activar")) return;
    await api(`/api/plans/${button.dataset.activate}/activate`, { method: "POST", body: "{}" });
    toast("Plan activado", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-confirm]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/plans/${button.dataset.confirm}`, { method: "PATCH", body: JSON.stringify({ processing_status: "confirmed" }) });
    toast("Plan confirmado", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-delete-plan]").forEach((button) => button.addEventListener("click", async () => {
    if (!await confirmDialog("Enviar plan a papelera", "Podras restaurarlo desde Papelera.", "Eliminar")) return;
    await api(`/api/plans/${button.dataset.deletePlan}`, { method: "DELETE" });
    toast("Plan enviado a papelera", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-add-recipe]").forEach((button) => button.addEventListener("click", async () => {
    await api("/api/cart/items", { method: "POST", body: JSON.stringify({ source_type: "recipe", source_id: button.dataset.addRecipe, quantity_multiplier: 1 }) });
    toast("Receta agregada al carrito", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-delete-recipe]").forEach((button) => button.addEventListener("click", async () => {
    if (!await confirmDialog("Enviar receta a papelera", "La receta quedara disponible para restaurar.", "Eliminar")) return;
    await api(`/api/recipes/${button.dataset.deleteRecipe}`, { method: "DELETE" });
    toast("Receta enviada a papelera", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => {
    $("[name=days]").value = button.dataset.days;
  }));
  $("#planningForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const days = Number(form.get("days") || 1);
    const ids = Array.from(event.currentTarget.recipes.selectedOptions).map((option) => option.value);
    for (const recipeId of ids) {
      await api("/api/cart/items", { method: "POST", body: JSON.stringify({ source_type: "recipe", source_id: recipeId, period_days: Math.ceil(days / ids.length), training_days: Number(form.get("training_days") || 0), include_add_ons: Boolean(form.get("include_add_ons")) }) });
    }
    await refresh();
  });
  $("#generateList")?.addEventListener("click", async () => {
    const name = prompt("Nombre de la lista", `Lista ${new Date().toLocaleDateString("es-MX")}`);
    if (!name) return;
    await api("/api/cart/generate-list", { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  });
  document.querySelectorAll("[data-list-item]").forEach((select) => select.addEventListener("change", async () => {
    const [listId, itemId] = select.dataset.listItem.split(":");
    await api(`/api/shopping-lists/${listId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
  }));
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", async () => {
    const text = await api(`/api/shopping-lists/${button.dataset.export}/export`, { method: "POST", body: JSON.stringify({ format: button.dataset.format }) });
    const win = window.open("", "_blank");
    win.document.write(`<pre>${escape(text)}</pre>`);
  }));
  document.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", async () => {
    const name = prompt("Nombre de plantilla", "Plantilla de compra");
    if (!name) return;
    await api(`/api/shopping-lists/${button.dataset.template}/save-template`, { method: "POST", body: JSON.stringify({ name }) });
    await refresh();
  }));
  document.querySelectorAll("[data-delete-list]").forEach((button) => button.addEventListener("click", async () => {
    if (!await confirmDialog("Enviar lista a papelera", "La lista quedara disponible para restaurar.", "Eliminar")) return;
    await api(`/api/shopping-lists/${button.dataset.deleteList}`, { method: "DELETE" });
    toast("Lista enviada a papelera", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-load-template]").forEach((button) => button.addEventListener("click", async () => {
    const replace = button.dataset.mode === "replace";
    if (!await confirmDialog(replace ? "Reemplazar carrito" : "Agregar plantilla", replace ? "Esto reemplazara el carrito actual." : "Esto agregara la plantilla al carrito.", replace ? "Reemplazar" : "Agregar")) return;
    const result = await api(`/api/templates/${button.dataset.loadTemplate}/load-to-cart`, { method: "POST", body: JSON.stringify({ mode: button.dataset.mode }) });
    if (result.warning) toast("Aviso", { description: result.warning, type: "warning" });
    toast(replace ? "Carrito reemplazado" : "Plantilla agregada", { type: "success" });
    await refresh();
  }));
  document.querySelectorAll("[data-restore]").forEach((button) => button.addEventListener("click", async () => {
    const [type, id] = button.dataset.restore.split(":");
    await api(`/api/trash/${type}/${id}/restore`, { method: "POST", body: "{}" });
    await refresh();
  }));
}

function bindGlobalPanel() {
  $("#manualIngredient")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/cart/items", { method: "POST", body: JSON.stringify({ source_type: "manual", ...Object.fromEntries(form) }) });
    await refresh();
  });
  $("#clearCart")?.addEventListener("click", async () => {
    if (!await confirmDialog("Vaciar carrito", "Esto eliminara los ingredientes actuales del carrito.", "Vaciar")) return;
    await api("/api/cart/clear", { method: "POST", body: "{}" });
    toast("Carrito vaciado", { type: "success" });
    await refresh();
  });
  $("#chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = form.get("message");
    state.chat.push({ role: "user", text: message });
    const answer = await api("/api/rag/chat", { method: "POST", body: JSON.stringify({ message, scope: $("#chatScope").value }) });
    state.chat.push({ role: "assistant", text: `${answer.answer}\n\nContexto usado: ${answer.context_used}\nFuentes: ${answer.sources.join(", ") || "sin fuentes"}` });
    event.currentTarget.reset();
    render();
  });
}

function bindWizard() {
  $("#closeWizard")?.addEventListener("click", () => {
    state.uploadWizard = null;
    render();
  });
  $("#prevStep")?.addEventListener("click", () => {
    state.uploadWizard.step = Math.max(0, state.uploadWizard.step - 1);
    render();
  });
  $("#nextStep")?.addEventListener("click", async () => {
    if (!state.uploadWizard.data?.structured_data) return;
    if (state.uploadWizard.step === 7) return;
    state.uploadWizard.step += 1;
    render();
  });
  $("#confirmPlan")?.addEventListener("click", async () => {
    await api(`/api/plans/${state.uploadWizard.data.plan.id}`, { method: "PATCH", body: JSON.stringify({ processing_status: "confirmed" }) });
    state.uploadWizard = null;
    await refresh();
  });
  $("#uploadForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = event.currentTarget.pdf.files[0];
    const data = await api("/api/plans/upload", { method: "POST", body: file, headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) } });
    state.uploadWizard = { step: 1, data };
    await loadAll();
    render();
  });
}

async function refresh() {
  await loadAll();
  render();
}

boot();
