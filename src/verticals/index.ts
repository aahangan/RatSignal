// Registry of lead products. Launching a vertical = adding one config file and listing it here.
import type { Vertical } from "../engine/schema";
import { grease } from "./grease";
import { vermin } from "./vermin";

export const VERTICALS = { vermin, grease } as const satisfies Record<string, Vertical>;
export type VerticalId = keyof typeof VERTICALS;
export const VERTICAL_IDS = Object.keys(VERTICALS) as VerticalId[];
export const DEFAULT_VERTICAL: VerticalId = "vermin";

export function getVertical(id: string | undefined | null): Vertical {
  return VERTICALS[(id ?? DEFAULT_VERTICAL) as VerticalId] ?? VERTICALS[DEFAULT_VERTICAL];
}

export const isVerticalId = (id: unknown): id is VerticalId => typeof id === "string" && id in VERTICALS;
