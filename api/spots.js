// 화면(tools_test.html)용 — find_spots 결과에 지도 핀 좌표를 붙여서 돌려줌
// 사용: /api/spots?area=동쪽&indoor=true   (indoor 는 생략 가능)
const { find_spots, locate } = require("./tools");

module.exports = (req, res) => {
  const { area, indoor } = req.query;
  const result = find_spots({
    area,
    indoor: indoor === undefined || indoor === "" ? undefined : indoor === "true",
  });
  if (result.error) return res.status(400).json(result);

  result.spots = result.spots.map((s) => locate(s.name));
  res.status(200).json(result);
};
