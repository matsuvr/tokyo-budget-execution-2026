/**
 * ブラウザ用エントリポイント（Issue #46）。
 * フレームワークを使わず、最小限のDOM操作だけを行う。
 */

function showError(message: string): void {
  const error = document.querySelector<HTMLElement>("#error");
  const loading = document.querySelector<HTMLElement>("#loading");
  if (error == null) return;
  error.textContent = message;
  error.hidden = false;
  if (loading != null) loading.hidden = true;
}

function main(): void {
  const content = document.querySelector<HTMLElement>("#content");
  const loading = document.querySelector<HTMLElement>("#loading");
  if (content == null || loading == null) {
    showError("画面の初期化に失敗しました");
    return;
  }
  // 後続Issue（#47以降）で執行レビューAPIからデータを取得して描画する。
  loading.hidden = true;
}

main();
