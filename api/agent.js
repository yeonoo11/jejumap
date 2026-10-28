// 에이전트: 질문 → Gemini 가 도구(find_spots · get_weather)를 골라 쓰고 → 결과를 보고 다시 판단 (최대 5번)
// 사용: POST /api/agent  { "question": "내일 동쪽에서 아이랑 갈 곳" }
// 필요: Vercel 환경변수 GEMINI_API_KEY (Google AI Studio 에서 발급)
const { toolDefinitions, runTool, locate } = require("./tools");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_TURNS = 5;

const SYSTEM = `너는 제주 관광 안내 에이전트다. 사용자의 질문에 맞는 지역과 날짜를 정해 도구로 확인한 뒤 추천한다.
규칙:
- 먼저 get_weather 로 지역 날씨를 보고, find_spots 로 장소를 찾는다.
- 강수확률 50% 이상이면 실내 위주, 아니면 야외를 섞는다.
- 한 번에 한 지역만 추천한다. 지역을 말하지 않았으면 물어보지 말고 하나를 골라 이유를 적는다.
- find_spots 결과에 없는 장소는 추천하지 않는다. 목록 밖 장소(다른 지역 포함)를 물으면 없다고 말하고 제주 안의 대안을 준다.
- 모르는 것(운영시간 · 요금)은 모른다고 한다. 날씨를 못 가져오면 모른다고 한다.
마지막 답은 JSON 만 출력한다(설명 · 코드블록 없이):
{"places":[{"name":"장소 이름","why":"이유 한 줄"}], "judge":"숫자 → 이유 → 결론 한 줄", "tip":"한 줄 팁"}
places 는 1~5곳이고, 이름은 find_spots 결과의 name 을 그대로 쓴다.`;

// tools.js 의 도구 설명(name · description · input_schema)을 Gemini 형식으로 바꿔 보냄
const tools = [
  {
    functionDeclarations: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  },
];

// 503(붐빔) · 429(한도)는 잠깐 뒤 다시 시도 — 최대 3번
async function callGemini(contents) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await callGeminiOnce(contents);
    } catch (e) {
      if (attempt >= 3 || !/Gemini API (503|429)/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function callGeminiOnce(contents) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        tools,
        contents,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Gemini API ${res.status}: ${(body.error && body.error.message) || "응답 없음"}`);
  }
  const data = await res.json();
  const content = data.candidates && data.candidates[0] && data.candidates[0].content;
  if (!content) throw new Error("Gemini 응답이 비어 있어요.");
  return content;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST 로 보내세요." });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY 환경변수가 없습니다." });
  }
  const question = String((req.body && req.body.question) || "").trim().slice(0, 300);
  if (!question) return res.status(400).json({ error: "question 이 비어 있어요." });

  const contents = [{ role: "user", parts: [{ text: question }] }];
  const trace = []; // 화면의 '생각 과정 보기'

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await callGemini(contents);
      const parts = reply.parts || [];
      contents.push({ role: "model", parts });

      const calls = parts.filter((p) => p.functionCall);
      if (calls.length === 0) {
        const text = parts.map((p) => p.text || "").join("");
        let answer;
        try {
          answer = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
        } catch (e) {
          return res.status(200).json({ places: [], judge: text, tip: "", trace });
        }
        // 목록과 대조해 좌표 · 실내 여부 · inList 를 붙임
        answer.places = (answer.places || []).map((p) => {
          const spot = locate(p.name);
          return spot ? { ...p, ...spot, inList: true } : { ...p, inList: false };
        });
        return res.status(200).json({ ...answer, trace });
      }

      const results = [];
      for (const { functionCall: c } of calls) {
        const output = await runTool(c.name, c.args);
        trace.push({ tool: c.name, input: c.args, output });
        results.push({ functionResponse: { name: c.name, response: { result: output } } });
      }
      contents.push({ role: "user", parts: results });
    }
    res.status(200).json({ places: [], judge: "도구를 5번 써도 답을 정하지 못했어요. 질문을 더 구체적으로 써 주세요.", tip: "", trace });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `에이전트 실행 중 오류: ${e.message}`, trace });
  }
};
