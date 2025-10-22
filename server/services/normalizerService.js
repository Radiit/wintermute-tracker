import { toNumber, toMilliseconds, isValidSymbol, normalizeSymbol } from '../utils/formatters.js';
import config from '../config/index.js';

class NormalizerService {

  pickSymbol(obj) {
    return (
      obj?.token?.symbol ||
      obj?.asset?.symbol ||
      obj?.coin?.symbol ||
      obj?.tokenSymbol ||
      obj?.asset ||
      obj?.coin ||
      obj?.symbol ||
      obj?.ticker ||
      obj?.name
    );
  }

  pickAmount(obj) {
    return (
      obj.amount ??
      obj.balance ??
      obj.balanceFloat ??
      obj.holding ??
      obj.qty ??
      obj.quantity ??
      obj?.tokenAmount?.amount ??
      obj?.balanceAmount
    );
  }

  pickAgoAmount(obj) {
    return (
      obj.balance24hAgo ??
      obj.amount24hAgo ??
      obj.value24hAgo ??
      obj.prev ??
      obj.previous ??
      obj?.tokenAmount24hAgo
    );
  }

  normalizeBalances(rawData) {
    const root = rawData && (Array.isArray(rawData.balances) || typeof rawData.balances === 'object')
      ? rawData.balances
      : rawData;

    const currentMap = {};
    const agoMap = {};

    const visit = (node) => {
      if (!node) return;

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      if (typeof node === 'object') {
        const symbolRaw = this.pickSymbol(node);

        if (symbolRaw) {
          const symbol = normalizeSymbol(symbolRaw);

          if (isValidSymbol(symbol)) {
            const amount = toNumber(this.pickAmount(node));

            if (!currentMap[symbol]) {
              currentMap[symbol] = { amount: 0 };
            }

            if (Number.isFinite(amount)) {
              currentMap[symbol].amount += amount;
            }

            const agoAmount = toNumber(this.pickAgoAmount(node));
            if (Number.isFinite(agoAmount)) {
              if (!agoMap[symbol]) {
                agoMap[symbol] = { amount: 0 };
              }
              agoMap[symbol].amount += agoAmount;
            }
          }
        }

        for (const value of Object.values(node)) {
          if (Array.isArray(value) || typeof value === 'object') {
            visit(value);
          }
        }
      }
    };

    visit(root);

    return {
      current: currentMap,
      baseline24h: Object.keys(agoMap).length ? agoMap : null,
    };
  }

  normalizeTransfers(rawData) {
    const array = Array.isArray(rawData)
      ? rawData
      : rawData.items || rawData.transfers || rawData.result || [];

    return array
      .map((item) => {
        const symbol = normalizeSymbol(
          item.asset?.symbol ||
          item.token?.symbol ||
          item.symbol ||
          item.ticker ||
          'UNKNOWN'
        );

        const usd = toNumber(
          item.usd ??
          item.valueUSD ??
          item.usdValue ??
          item.fiatValue ??
          0
        );

        const toLabel = (
          item.to?.entity ||
          item.to?.label ||
          item.to?.name ||
          ''
        ).toLowerCase();

        const fromLabel = (
          item.from?.entity ||
          item.from?.label ||
          item.from?.name ||
          ''
        ).toLowerCase();

        const direction = toLabel.includes(config.entity.name)
          ? 1
          : fromLabel.includes(config.entity.name)
          ? -1
          : 0;

        const timestamp = toMilliseconds(
          item.time ||
          item.timestamp ||
          item.blockTime ||
          item.ts
        );

        return { symbol, usd, direction, timestamp };
      })
      .filter((transfer) => Number.isFinite(transfer.usd) && transfer.usd && transfer.direction);
  }

  computeDiff(currentAmounts, previousAmounts) {
    const symbols = new Set([
      ...Object.keys(currentAmounts || {}),
      ...(previousAmounts ? Object.keys(previousAmounts) : []),
    ]);

    const rows = [];

    for (const symbol of symbols) {
      const oldValue = Number(previousAmounts?.[symbol] ?? 0);
      const newValue = Number(currentAmounts?.[symbol] ?? 0);
      const delta = newValue - oldValue;
      const pctChange = oldValue === 0
        ? newValue === 0 ? 0 : null
        : (delta / oldValue) * 100;

      rows.push({
        symbol,
        old: oldValue,
        new: newValue,
        delta,
        pctChange,
      });
    }

    rows.sort((a, b) => {
      if (a.pctChange === null && b.pctChange === null) return 0;
      if (a.pctChange === null) return 1;
      if (b.pctChange === null) return -1;
      return Math.abs(b.pctChange) - Math.abs(a.pctChange);
    });

    return rows;
  }
}

const normalizerService = new NormalizerService();

export default normalizerService;


