
const SYMBOLS = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY', 'XAU/USD'];
const INTERVALS = {
  M15: '15min',
  H1: '1h',
  H4: '4h',
  D1: '1day'
};

module.exports = async (req, res) => {
  try {
    // 兼容 Vercel 中的两种变量名称
    const key =
      process.env.TWELVE_API_KEY ||
      process.env.TWELVE_DATA_API_KEY;

    if (!key) {
      return res.status(500).json({
        error: '服务器未配置 Twelve Data API Key',
        requiredVariables: [
          'TWELVE_API_KEY',
          'TWELVE_DATA_API_KEY'
        ]
      });
    }

    const symbol = String(req.query.symbol || 'EUR/USD').toUpperCase();
    const tf = String(req.query.tf || 'H1').toUpperCase();

    if (!SYMBOLS.includes(symbol)) {
      return res.status(400).json({
        error: '不支持的品种',
        supported: SYMBOLS
      });
    }

    if (!INTERVALS[tf]) {
      return res.status(400).json({
        error: '不支持的周期',
        supported: Object.keys(INTERVALS)
      });
    }

    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', INTERVALS[tf]);
    url.searchParams.set('outputsize', '140');
    url.searchParams.set('apikey', key);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || data.status === 'error' ||
        !Array.isArray(data.values)) {
      return res.status(502).json({
        error: data.message || '行情源返回错误',
        code: data.code || null
      });
    }

    // Twelve Data 通常按最新到最旧返回，转成时间升序
    const rows = data.values.map(x => ({
      t: x.datetime,
      o: Number(x.open),
      h: Number(x.high),
      l: Number(x.low),
      c: Number(x.close),
      v: x.volume == null ? 0 : Number(x.volume)
    }))
    .filter(x =>
      [x.o, x.h, x.l, x.c].every(Number.isFinite)
    )
    .reverse();

    if (rows.length < 40) {
      return res.status(502).json({
        error: '返回的 K 线不足 40 根',
        count: rows.length
      });
    }

    // 无成交量时，用 K 线振幅估算活动度，不代表真实成交量
    const volumeEstimated = rows.every(x => x.v <= 0);

    if (volumeEstimated) {
      const avgRange =
        rows.reduce((sum, x) => sum + (x.h - x.l), 0) /
        rows.length || 1;

      rows.forEach(x => {
        x.v = Math.round(((x.h - x.l) / avgRange) * 1000);
      });
    }

    const latest = rows[rows.length - 1];
    const previous = rows[rows.length - 2];

    res.setHeader(
      'Cache-Control',
      's-maxage=30, stale-while-revalidate=60'
    );

    return res.status(200).json({
      success: true,
      source: 'Twelve Data',
      symbol,
      timeframe: tf,
      interval: INTERVALS[tf],
      volumeEstimated,
      last: latest.t,
      close: latest.c,
      previousClose: previous.c,
      change: Number((latest.c - previous.c).toFixed(6)),
      changePercent: Number(
        ((latest.c - previous.c) / previous.c * 100).toFixed(3)
      ),
      count: rows.length,
      candles: rows,
      o: rows.map(x => x.o),
      h: rows.map(x => x.h),
      l: rows.map(x => x.l),
      c: rows.map(x => x.c),
      v: rows.map(x => x.v)
    });

  } catch (error) {
    return res.status(500).json({
      error: '服务器请求失败',
      message: error.message
    });
  }
};
