// Modules may translate presentation text. Without one installed, rendering is unchanged.
import type { ReactNode } from "react";
import { webModules } from "../site-modules";
export function useText() {
  const translators = webModules().flatMap(m => m.text ? [m.text()] : []);
  return <T,>(source: T): T | string => typeof source === "string" ? translators.reduce<string>((text, translate) => translate(text), source) : source;
}
export function Text({ children }: { children: ReactNode }) {
  const translate = useText();
  return typeof children === "string" ? translate(children) : children;
}
