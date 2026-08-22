"use strict";
/**
 * ブラウザ用エントリポイント（Issue #46）。
 * フレームワークを使わず、最小限のDOM操作だけを行う。
 */
function showError(message) {
    const error = document.querySelector("#error");
    const loading = document.querySelector("#loading");
    if (error == null)
        return;
    error.textContent = message;
    error.hidden = false;
    if (loading != null)
        loading.hidden = true;
}
function main() {
    const content = document.querySelector("#content");
    const loading = document.querySelector("#loading");
    if (content == null || loading == null) {
        showError("画面の初期化に失敗しました");
        return;
    }
    // 後続Issue（#47以降）で執行レビューAPIからデータを取得して描画する。
    loading.hidden = true;
}
main();
