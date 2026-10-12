// cafe-ai: 리뷰 답글 / 홍보 문구를 만들어 주는 Edge Function (type으로 구분)
//
// 요청  POST { "type": "review_reply", "review": { "author": "...", "rating": 1-5, "content": "..." } }
//       POST { "type": "promo", "menu": "...", "mood": "...", "channel": "..." }
//       (선택) "model": 아래 MODELS 중 하나를 넣으면 그 모델을 먼저 쓴다. 없으면 순서대로.
// 응답  { "text": "첫 번째 후보", "options": ["후보1", "후보2", ...], "model": "사용한 모델" }
// 오류  { "error": "사람이 읽을 수 있는 메시지" } + 4xx/5xx
//
// AI는 OpenRouter의 무료 모델을 순서대로 시도한다(앞 모델이 실패하면 다음 모델).
// 키는 Supabase Secrets의 OPENROUTER_API_KEY(없으면 ANTHROPIC_API_KEY)에만 둔다.

const MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 문자열만 받고, 길이를 제한한다.
function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const STYLE = `당신은 동네 골목카페 사장님을 돕는 글쓰기 도우미입니다.
- 한국어로, 사장님이 직접 쓴 것처럼 따뜻하고 담백한 말투를 씁니다.
- 없는 사실(가격, 이벤트, 메뉴, 영업시간 등)을 지어내지 않습니다. 입력에 있는 내용만 씁니다.
- 과장 광고 표현과 이모지는 최소로 씁니다.
- 설명이나 머리말 없이 결과 문장만 출력합니다.`;

function buildPrompt(body: Record<string, unknown>): { prompt: string; count: number; maxTokens: number } | string {
  if (body.type === "review_reply") {
    const r = (body.review ?? {}) as Record<string, unknown>;
    const content = str(r.content, 1000);
    if (!content) return "리뷰 내용을 입력해 주세요.";
    const author = str(r.author, 40) || "손님";
    const rating = Number(r.rating);
    const ratingText = rating >= 1 && rating <= 5 ? `별점 ${Math.round(rating)}점` : "별점 정보 없음";
    return {
      count: 1,
      maxTokens: 1500,
      prompt: `${STYLE}

아래 손님 리뷰에 대한 사장님 답글을 한 개 작성하세요.
- 2~4문장, 손님 이름(${author})을 한 번 부릅니다.
- 칭찬에는 고마움을, 아쉬움이나 불만에는 먼저 사과하고 개선하겠다는 약속을 담습니다. 변명하지 않습니다.
- 다시 방문해 달라는 말로 마무리합니다.

[${ratingText}]
리뷰: ${content}`,
    };
  }

  if (body.type === "promo") {
    const menu = str(body.menu, 200);
    if (!menu) return "홍보할 메뉴나 내용을 입력해 주세요.";
    const mood = str(body.mood, 100) || "따뜻하고 편안한";
    const channel = str(body.channel, 40) || "인스타그램";
    return {
      count: 3,
      maxTokens: 2000,
      prompt: `${STYLE}

아래 내용으로 홍보 문구 후보를 정확히 3개 작성하세요.
- 후보와 후보 사이에는 한 줄에 "---"만 적어 구분합니다. 번호나 제목은 붙이지 않습니다.
- 채널: ${channel} (채널에 맞는 길이와 말투로)
- 분위기: ${mood}
- 후보마다 첫 문장이 서로 다르게 시작합니다.

홍보할 내용: ${menu}`,
    };
  }

  return "type은 review_reply 또는 promo 이어야 해요.";
}

// 모델 하나를 호출해서 본문 텍스트를 돌려준다. 실패하면 null.
async function ask(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<string | null> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
        "x-title": "cafe-ai",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("openrouter error", model, res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (e) {
    console.error("openrouter fetch failed", model, String(e));
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST 요청만 받아요." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "요청 형식이 올바르지 않아요." }, 400);
  }

  const built = buildPrompt(body);
  if (typeof built === "string") return json({ error: built }, 400);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "AI 키가 아직 설정되지 않았어요. Supabase Secrets에 OPENROUTER_API_KEY를 넣어 주세요." }, 500);
  }

  // 사용자가 고른 모델(목록에 있는 것만)을 먼저 시도하고, 실패하면 나머지로 넘어간다.
  const picked = typeof body.model === "string" && MODELS.includes(body.model) ? body.model : null;
  const order = picked ? [picked, ...MODELS.filter((m) => m !== picked)] : MODELS;

  for (const model of order) {
    const raw = await ask(apiKey, model, built.prompt, built.maxTokens);
    if (!raw) continue;

    const options = built.count === 1
      ? [raw]
      : raw.split(/^\s*---\s*$/m).map((s) => s.trim()).filter(Boolean).slice(0, built.count);
    return json({ text: options[0] ?? raw, options: options.length ? options : [raw], model });
  }

  return json({ error: "지금은 AI가 답을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요." }, 502);
});
