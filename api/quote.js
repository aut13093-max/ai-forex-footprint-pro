
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "只支持 GET 请求"
    });
  }

  const apiKey =
    process.env.TWELVE_DATA_API_KEY ||
    process.env.TWELVE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "服务器未配置 Twelve Data API Key。请在 Vercel 添加 TWELVE_DATA_API_KEY，并重新部署。"
    });
  }

  const symbol = String(req.query.symbol || "EUR/USD").toUpperCase();
  const timeframe = String(req.query.timeframe || "H1").toUpperCase();

  const intervals = {
    M15: "15min",
    H1: "1h",
    H4: "4h",
    D1: "1day"
  };

  if (!intervals[timeframe]) {
    return res.status(400).json({
      error: "不支持的周期，请使用 M15、H1、H4 或 D1"
    });
  }

  const allowedSymbols = [
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "AUD/USD",
    "XAU/USD"
  ];

  if (!allowedSymbols.includes(symbol)) {
    return res.status(400).json({
      error: "不支持的交易品种"
    });
  }

  try {
    const params = new URLSearchParams({
      symbol,
      interval: intervals[timeframe],
      outputsize: "200",
      apikey: apiKey,
      format: "JSON"
    });

    const url =
      "https://api.twelvedata.com/time_series?" +
      params.toString();

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Twelve Data 请求失败",
        details: data.message || `HTTP ${response.status}`
      });
    }

    if (data.status === "error" || !Array.isArray(data.values)) {
      return res.status(502).json({
        error: "行情接口返回错误",
        details:
          data.message ||
          "没有取得 K 线数据，请检查 API Key、额度及交易品种。"
      });
    }

    const candles = data.values
      .map(item => ({
        time: item.datetime,
        o: Number(item.open),
        h: Number(item.high),
        l: Number(item.low),
        c: Number(item.close),
        v: Number(item.volume || 0)
      }))
      .filter(item =>
        Number.isFinite(item.o) &&
        Number.isFinite(item.h) &&
        Number.isFinite(item.l) &&
        Number.isFinite(item.c)
      )
      .reverse();

    if (candles.length < 2) {
      return res.status(502).json({
        error: "有效 K 线数量不足",
        details: "请检查 API 返回数据和当前账户的行情权限。"
      });
    }

    return res.status(200).json({
      success: true,
      symbol,
      timeframe,
      interval: intervals[timeframe],
      count: candles.length,
      time: candles.map(x => x.time),
      o: candles.map(x => x.o),
      h: candles.map(x => x.h),
      l: candles.map(x => x.l),
      c: candles.map(x => x.c),
      v: candles.map(x => x.v),
      candles
    });
  } catch (error) {
    return res.status(500).json({
      error: "服务器获取行情失败",
      details: error.message || "未知错误"
    });
  }
}
