
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
      error: "缺少 GEMINI_API_KEY",
      details: "请在 Vercel 项目的 Environment Variables 中检查变量名称，并重新部署。"
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
你是一名专业的外汇与黄金市场分析助手，请使用中文分析。
不要编造实时行情，不要保证盈利。

交易品种：${symbol}
当前价格：${price}
用户选择的方向：${direction}
市场结构：${structure}

请按以下格式回答：
1. 市场方向判断
2. 市场结构分析
3. 关键支撑与阻力；没有数据时明确说明
4. 多头确认条件
5. 空头确认条件
6. 风险控制建议
7. 当前建议：观察、等待确认或暂不交易

说明数据限制，不得把推测当作确定事实。
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
      return res.status(200).json({
        success: false,
        error: "Gemini API 请求失败",
        details: data.error?.message || `HTTP ${response.status}`,
        upstreamStatus: response.status
      });
    }

    const analysis = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!analysis) {
      return res.status(200).json({
        success: false,
        error: "Gemini 没有返回分析内容",
        details:
          data.promptFeedback?.blockReason ||
          data.candidates?.[0]?.finishReason ||
          "API 响应内容为空"
      });
    }

    return res.status(200).json({
      success: true,
      symbol,
      price,
      analysis,
      model: "gemini-2.5-flash"
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      error: "服务器调用 Gemini 失败",
      details: error.message || "未知错误"
    });
  }
}
