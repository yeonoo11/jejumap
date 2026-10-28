// 에이전트가 부르는 도구 모음 — 지금은 find_spots 하나
const data = require("../jeju_spots.json");

const MAX_RESULTS = 8;
const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];

// 입력: { area: "동쪽" | "서쪽" | "서귀포" | "제주시", indoor?: boolean }
// 출력: 최대 8곳의 { name, region, indoor, description } (좌표 제외)
function find_spots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area 는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
  }

  // "동쪽" → "동쪽(성산)", "동쪽(구좌)" 처럼 앞부분이 같으면 같은 지역으로 봅니다.
  const found = data.spots.filter(
    (s) => s.area.startsWith(area) && (indoor === undefined || s.indoor === indoor)
  );

  return {
    total: found.length,
    spots: found.slice(0, MAX_RESULTS).map((s) => ({
      name: s.name,
      region: s.area,
      indoor: s.indoor,
      description: s.type,
    })),
  };
}

// Claude 에게 알려 줄 도구 설명 (name · description · input_schema)
const toolDefinitions = [
  {
    name: "find_spots",
    description:
      "제주 관광지 목록(jeju_spots.json)에서 지역과 실내/야외 조건으로 장소를 찾는다. " +
      "이름 · 지역 · 실내 여부 · 설명을 최대 8곳 돌려준다. " +
      "목록 밖 장소는 없다: 결과에 없는 장소는 추천하지 말고, 없다고 답한다.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: AREAS,
          description: "찾을 지역",
        },
        indoor: {
          type: "boolean",
          description: "true 면 실내만, false 면 야외만. 생략하면 둘 다.",
        },
      },
      required: ["area"],
    },
  },
];

// 도구 이름으로 실행 (agent.js 에서 tool_use 를 받았을 때 사용)
const handlers = { find_spots };
const runTool = (name, input) =>
  handlers[name] ? handlers[name](input) : { error: `알 수 없는 도구: ${name}` };

module.exports = { find_spots, toolDefinitions, runTool };
