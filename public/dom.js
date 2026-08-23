export function el(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === "class")
            element.className = value;
        else
            element.setAttribute(key, value);
    }
    for (const child of children)
        if (child != null)
            element.append(child);
    return element;
}
