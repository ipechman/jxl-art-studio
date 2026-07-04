/** Renders a recipe's parameter definitions as form controls. */
import type { ParamDef, ParamValues, Recipe } from "../recipes/types.ts";

export function renderControls(
  container: HTMLElement,
  recipe: Recipe,
  values: ParamValues,
  onChange: (id: string, value: string | number | boolean) => void,
) {
  container.innerHTML = "";
  for (const p of recipe.params) {
    container.appendChild(buildControl(p, values[p.id], onChange));
  }
}

function buildControl(
  p: ParamDef,
  value: string | number | boolean | undefined,
  onChange: (id: string, value: string | number | boolean) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "control";
  const name = document.createElement("span");
  name.className = "control-label";
  name.textContent = p.label;
  row.appendChild(name);

  switch (p.kind) {
    case "color": {
      const input = document.createElement("input");
      input.type = "color";
      input.value = String(value ?? p.default);
      input.addEventListener("input", () => onChange(p.id, input.value));
      row.appendChild(input);
      break;
    }
    case "range": {
      const wrap = document.createElement("span");
      wrap.className = "range-wrap";
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step ?? 1);
      input.value = String(value ?? p.default);
      const out = document.createElement("output");
      out.textContent = input.value;
      input.addEventListener("input", () => {
        out.textContent = input.value;
        onChange(p.id, Number(input.value));
      });
      wrap.append(input, out);
      row.appendChild(wrap);
      break;
    }
    case "select": {
      const select = document.createElement("select");
      for (const opt of p.options) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        select.appendChild(o);
      }
      select.value = String(value ?? p.default);
      select.addEventListener("change", () => onChange(p.id, select.value));
      row.appendChild(select);
      break;
    }
    case "toggle": {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(value ?? p.default);
      input.addEventListener("change", () => onChange(p.id, input.checked));
      row.appendChild(input);
      break;
    }
  }
  return row;
}
