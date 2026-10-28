// 에이전트가 부르는 도구 모음 — find_spots(관광지 찾기) · get_weather(날씨 보기)
const data = require("../jeju_spots.json");

const MAX_RESULTS = 8;
const AREAS = ["동쪽", "서쪽", "서귀포", "제주시"];

// jeju_spots.json 에는 장소별 좌표가 없어서, 지역 대표 좌표(근사값)를 씁니다.
const AREA_CENTER = {
  "동쪽(성산)": [33.458, 126.942],
  "동쪽(구좌)": [33.524, 126.859],
  "제주시": [33.4996, 126.5312],
  "서쪽(한림)": [33.414, 126.265],
  "서쪽(안덕)": [33.25, 126.33],
  "서귀포": [33.254, 126.56],
};

// 같은 지역 핀이 한 점에 겹치지 않도록 이름으로 정한 고정 오프셋(약 ±2km)
const offset = (name, salt) => {
  let h = salt;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return (h / 1000 - 0.5) * 0.04;
};

// 장소 이름으로 목록에서 찾아 근사 좌표를 붙임. 목록에 없으면 null (inList 판단용)
function locate(name) {
  const s = data.spots.find((x) => x.name === name);
  if (!s) return null;
  const [lat, lng] = AREA_CENTER[s.area];
  return { name: s.name, region: s.area, indoor: s.indoor, description: s.type,
           lat: lat + offset(s.name, 7), lng: lng + offset(s.name, 13) };
}

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

// 입력: { area, day: "오늘" | "내일" }  — Open-Meteo 예보(키 없음)
const WEATHER_POINT = {
  "동쪽": AREA_CENTER["동쪽(성산)"],
  "서쪽": AREA_CENTER["서쪽(한림)"],
  "서귀포": AREA_CENTER["서귀포"],
  "제주시": AREA_CENTER["제주시"],
};

async function get_weather({ area, day = "오늘" } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area 는 ${AREAS.join(" · ")} 중 하나여야 합니다.` };
  }
  const i = day === "내일" ? 1 : 0;
  const [lat, lng] = WEATHER_POINT[area];
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min` +
    `&timezone=Asia%2FSeoul&forecast_days=2`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const d = (await res.json()).daily;
    return {
      area, day, date: d.time[i],
      rain_probability_percent: d.precipitation_probability_max[i],
      temp_max_c: d.temperature_2m_max[i],
      temp_min_c: d.temperature_2m_min[i],
      source: "Open-Meteo 예보",
    };
  } catch (e) {
    return { error: "날씨를 가져오지 못했어요. 날씨 숫자는 모른다고 답하세요." };
  }
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
        area: { type: "string", enum: AREAS, description: "찾을 지역" },
        indoor: { type: "boolean", description: "true 면 실내만, false 면 야외만. 생략하면 둘 다." },
      },
      required: ["area"],
    },
  },
  {
    name: "get_weather",
    description:
      "Open-Meteo 예보로 제주 지역의 오늘 또는 내일 강수확률(%) · 최고/최저 기온을 알려 준다. " +
      "장소를 고르기 전에 불러서 비 올 가능성을 확인한다. 실패하면 날씨는 모른다고 말한다.",
    input_schema: {
      type: "object",
      properties: {
        area: { type: "string", enum: AREAS, description: "날씨를 볼 지역" },
        day: { type: "string", enum: ["오늘", "내일"], description: "생략하면 오늘" },
      },
      required: ["area"],
    },
  },
];

// 도구 이름으로 실행 (agent.js 에서 tool_use 를 받았을 때 사용)
const handlers = { find_spots, get_weather };
const runTool = async (name, input) =>
  handlers[name] ? handlers[name](input) : { error: `알 수 없는 도구: ${name}` };

module.exports = { find_spots, get_weather, toolDefinitions, runTool, locate };
