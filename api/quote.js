// api/quote.js
const SYMBOLS = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY', 'XAU/USD'];
const INTERVALS = { M15: '15min', H1: '1h', H4: '4h', D1: '1day' };

module.exports = async (req, res) => {
  try {
    const key = process.env.TWELVE_API_KEY;
    if (!key) return res.status(500).json({ error: '服务器未配置 TWELVE_API_KEY' });

    const symbol = String(req.query.symbol || 'EUR/USD');
    const tf = String(req.query.tf || 'H1');
    if (!SYMBOLS.includes(symbol)) return res.status(400).json({ error: '不支持的品种' });
    if (!INTERVALS[tf]) return res.status(400).json({ error: '不支持的周期' });

    const url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(symbol) +
      '&interval=' + INTERVALS[tf] + '&outputsize=140&order=ASC&apikey=' + key;

    const r = await fetch(url);
    const j = await r.json();
    if (j.status === 'error' || !Array.isArray(j.values)) {
      return res.status(502).json({ error: j.message || '行情源返回错误' });
    }

    const rows = j.values.map(x => ({
      t: x.datetime,
      o: +x.open, h: +x.high, l: +x.low, c: +x.close,
      v: x.volume ? +x.volume : 0
    })).filter(x => [x.o, x.h, x.l, x.c].every(Number.isFinite));

    if (rows.length < 40) return res.status(502).json({ error: '返回的 K 线不足 40 根' });

    // 外汇/黄金常无成交量：用波动幅度估算 tick 量
    const noVol = rows.every(x => !x.v);
    if (noVol) {
      const avgRange = rows.reduce((s, x) => s + (x.h - x.l), 0) / rows.length || 1;
      rows.forEach(x => { x.v = Math.round(((x.h - x.l) / avgRange) * 1000); });
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({
      symbol, tf, volumeEstimated: noVol,
      o: rows.map(x => x.o), h: rows.map(x => x.h),
      l: rows.map(x => x.l), c: rows.map(x => x.c),
      v: rows.map(x => x.v), last: rows[rows.length - 1].t
    });
  } catch (e) {
    res.status(500).json({ error: '服务器错误：' + e.message });
  }
};