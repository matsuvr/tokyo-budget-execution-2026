export function sortBreakdownComponentsByUnexecutedAmount(components) {
    return [...components].sort((a, b) => {
        const amountDifference = b.amounts.yearEndUnexecutedYen - a.amounts.yearEndUnexecutedYen;
        if (amountDifference !== 0)
            return amountDifference;
        if (a.accountKey.key < b.accountKey.key)
            return -1;
        if (a.accountKey.key > b.accountKey.key)
            return 1;
        return 0;
    });
}
