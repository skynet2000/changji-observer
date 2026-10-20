// Modules may translate presentation text. Without one installed, rendering is unchanged.
import type { ReactNode } from "react";
import { webModules } from "../site-modules";
export function useText(content = false) {
  const translators = webModules().flatMap(m => m.text ? [m.text()] : []);
  return <T,>(source: T): T | string => typeof source === "string" ? translators.reduce<string>((text, translate) => translate(text, content ? "content" : "interface"), source) : source;
}
export function Text({ children, content = false }: { children: ReactNode; content?: boolean }) {
  const translate = useText(content);
  return typeof children === "string" ? translate(children) : children;
}
