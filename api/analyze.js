
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "只支持 POST 请求"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "服务器未配置 GEMINI_API_KEY，请检查 Vercel 环境变量"
    });
  }

  try {
    let body = req.body || {};

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const symbol = String(body.symbol || "EUR/USD");
    const price = body.price ?? "未知";
    const direction = String(body.direction || "未指定");
    const structure = String(body.structure || "未指定");

    const prompt = `
你是一名专业外汇市场分析助手。
请使用中文分析以下市场信息，不要编造实时行情。

交易品种：${symbol}
当前价格：${price}
用户选择的方向：${direction}
市场结构：${structure}

请按以下格式回答：
1. 市场方向判断
2. 市场结构分析
3. 关键支撑与阻力（若无数据，明确说明）
4. 多头与空头的确认条件
5. 风险控制建议
6. 当前操作建议：观察、等待确认或暂不交易

不要保证盈利，不要声称能够确定未来价格。
如果数据不足，请明确指出。
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1200
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : 400).json({
        success: false,
        error: "Gemini API 请求失败",
        details: data.error?.message || `HTTP ${response.status}`
      });
    }

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!text) {
      return res.status(502).json({
        success: false,
        error: "Gemini 没有返回分析内容",
        details: data.promptFeedback?.blockReason || "响应内容为空"
      });
    }

    return res.status(200).json({
      success: true,
      symbol,
      price,
      analysis: text,
      model: "gemini-2.5-flash"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "服务器调用 Gemini 失败",
      details: error.message || "未知错误"
    });
  }
}
