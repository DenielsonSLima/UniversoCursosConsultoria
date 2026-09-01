export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const titleReplacementJson = (titleReplacement: {
  result?: unknown;
}) => {
  const result = String(titleReplacement.result || "");
  const success = !["REVIEW_REQUIRED", "REVIEW_FENCED"].includes(result) &&
    !result.endsWith("_RETRY");
  return json({ success, titleReplacement });
};
