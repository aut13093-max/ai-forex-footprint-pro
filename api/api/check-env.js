
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  return res.status(200).json({
    hasTwelveDataKey: Boolean(
      process.env.TWELVE_DATA_API_KEY
    ),
    hasFallbackKey: Boolean(
      process.env.TWELVE_API_KEY
    ),
    environment: process.env.VERCEL_ENV || "unknown"
  });
}
