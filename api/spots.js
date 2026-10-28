// 화면(tools_test.html)용 — find_spots 결과에 지도 핀 좌표를 붙여서 돌려줌
// 사용: /api/spots?area=동쪽&indoor=true   (indoor 는 생략 가능)
const { find_spots } = require("./tools");

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

module.exports = (req, res) => {
  const { area, indoor } = req.query;
  const result = find_spots({
    area,
    indoor: indoor === undefined || indoor === "" ? undefined : indoor === "true",
  });
  if (result.error) return res.status(400).json(result);

  result.spots = result.spots.map((s) => {
    const [lat, lng] = AREA_CENTER[s.region];
    return { ...s, lat: lat + offset(s.name, 7), lng: lng + offset(s.name, 13) };
  });
  res.status(200).json(result);
};
