export interface UnexecutedBreakdownComponent {
  accountKey: { key: string };
  amounts: { yearEndUnexecutedYen: number };
}

export function sortBreakdownComponentsByUnexecutedAmount<
  T extends UnexecutedBreakdownComponent,
>(components: readonly T[]): T[] {
  return [...components].sort((a, b) => {
    const amountDifference = b.amounts.yearEndUnexecutedYen - a.amounts.yearEndUnexecutedYen;
    if (amountDifference !== 0) return amountDifference;
    if (a.accountKey.key < b.accountKey.key) return -1;
    if (a.accountKey.key > b.accountKey.key) return 1;
    return 0;
  });
}
