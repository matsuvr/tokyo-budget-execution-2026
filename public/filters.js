import { el } from "./dom.js";
import { ALL, availableBureaus, clearFilters } from "./filter.js";
import { confidenceLabel, STATUS_LABELS } from "./labels.js";
function selectControl(labelText, id, value, options, onChange) {
    const select = el("select", { id, name: id });
    for (const option of options) {
        const optionEl = el("option", { value: option.value }, option.label);
        if (option.value === value)
            optionEl.setAttribute("selected", "");
        select.append(optionEl);
    }
    select.addEventListener("change", () => onChange(select.value));
    return el("div", { class: "filter-field" }, el("label", { for: id }, labelText), select);
}
function confidenceCheckboxes(current, onChange) {
    const choices = ["A", "B", "C", "unmatched"];
    const checkboxes = choices.map((choice) => {
        const input = el("input", { type: "checkbox", id: `confidence-${choice}`, value: choice });
        if (current.includes(choice))
            input.setAttribute("checked", "");
        input.addEventListener("change", () => {
            const selected = choices.filter((c) => {
                const box = document.querySelector(`#confidence-${CSS.escape(c)}`);
                return box?.checked ?? false;
            });
            onChange(selected);
        });
        return el("span", { class: "checkbox-choice" }, input, el("label", { for: `confidence-${choice}` }, confidenceLabel(choice)));
    });
    return el("fieldset", { class: "filter-field" }, el("legend", {}, "対応信頼度"), ...checkboxes);
}
export function renderFilterControls(records, filteredCount, filters, callbacks) {
    const bureaus = availableBureaus(records);
    const statusOptions = [
        { value: ALL, label: "すべての状態" },
        ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
    ];
    const bureauOptions = [{ value: ALL, label: "すべての局" }, ...bureaus.map((b) => ({ value: b, label: b }))];
    const update = (patch) => callbacks.onFiltersChange({ ...filters, ...patch });
    const resetButton = el("button", { type: "button", class: "reset-button" }, "条件をリセット");
    resetButton.addEventListener("click", () => {
        for (const choice of ["A", "B", "C", "unmatched"]) {
            const box = document.querySelector(`#confidence-${CSS.escape(choice)}`);
            if (box != null)
                box.checked = false;
        }
        callbacks.onFiltersChange(clearFilters());
    });
    return el("section", { class: "card filter-card", "aria-label": "候補の絞り込み" }, el("h2", {}, "絞り込み"), el("div", { class: "filter-controls" }, selectControl("状態", "filter-status", filters.status, statusOptions, (status) => update({ status })), selectControl("局", "filter-bureau", filters.bureau, bureauOptions, (bureau) => update({ bureau })), confidenceCheckboxes(filters.confidences, (confidences) => update({ confidences }))), el("p", { class: "filter-count", "aria-live": "polite" }, `${filteredCount.toLocaleString("ja-JP")} 件 / 全 ${records.length.toLocaleString("ja-JP")} 件`), resetButton);
}
