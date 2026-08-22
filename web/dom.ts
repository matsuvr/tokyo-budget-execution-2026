/**
 * DOM生成の小さなヘルパー。textContentのみを使いHTML文字列を組み立てない。
 */

export type ElementAttributes = Record<string, string>;

export function el(
  tag: string,
  attributes: ElementAttributes = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElement {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "class") {
      element.className = value;
    } else {
      element.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    element.append(child);
  }
  return element;
}
