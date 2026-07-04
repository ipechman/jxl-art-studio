/** A user-facing control on a recipe. */
export type ParamDef =
  | { kind: "color"; id: string; label: string; default: string }
  | {
      kind: "range";
      id: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      default: number;
    }
  | {
      kind: "select";
      id: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
    }
  | { kind: "toggle"; id: string; label: string; default: boolean };

export type ParamValues = Record<string, string | number | boolean>;

/** One freehand element drawn on the preview (doodle recipe only). */
export interface Stroke {
  kind: "line" | "dot";
  color: string; // hex
  width: number; // approximate stroke width / blob radius in px
  intensity: number; // 0..200 (%)
  points: [number, number][];
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  /** One-liner shown to non-technical users. */
  blurb: string;
  params: ParamDef[];
  /** Whether this recipe uses drawn strokes (shows draw tools on the preview). */
  usesStrokes?: boolean;
  generate(values: ParamValues, strokes: Stroke[]): string;
  /** Random parameter values for "Surprise me". */
  randomize(): ParamValues;
}

export function defaultsOf(recipe: Recipe): ParamValues {
  const out: ParamValues = {};
  for (const p of recipe.params) out[p.id] = p.default;
  return out;
}
