# 일볼때 지도와 배포 안내

## 실행

저장소 루트에서 `node server.mjs`를 실행하고 [로컬 웹앱](http://127.0.0.1:4173)을 엽니다. Node.js 20 이상을 사용합니다. 프런트엔드 산출물만 만들 때는 `node scripts/build.mjs`를 실행합니다.

## 지도와 검색

- 장소명, 주소 또는 인근 지역명으로 검색하거나 지도를 원하는 지역으로 이동합니다. 목록에는 기준점에서 가까운 시설을 최대 35곳 표시합니다.
- **현재 위치**를 누르고 브라우저의 위치 권한을 허용합니다. Vercel HTTPS 주소와 localhost에서 동작합니다. 위치 권한을 거절했거나 기기의 위치 서비스가 꺼져 있으면 지역명을 검색할 수 있습니다.
- **위치 추가**를 누르고 지도에서 지점을 선택한 뒤 이름과 선택 설명을 입력합니다. Redis를 연결한 Vercel 환경에서는 공유 위치로 저장됩니다. 로컬 실행이나 Redis를 연결하지 않은 배포에서는 현재 브라우저에만 저장됩니다.
- 기존 시설의 출입 및 비밀번호 상태는 확인된 정보가 없으면 **정보 없음**으로 표시합니다. 직선거리는 실제 보행 거리와 다릅니다.

## Vercel 배포

GitHub 저장소에서 `main` 브랜치를 연결합니다. 프로젝트 루트는 `./`, 프레임워크는 **Other**로 선택합니다. `vercel.json`에서 정적 페이지의 빌드 명령과 출력 폴더를 설정하며, `/api` 경로는 Vercel Functions로 실행됩니다.

| 목적 | 설정 |
| --- | --- |
| 실제 지도, 기본 화장실 목록, GPS | 환경 변수 없이 동작 |
| 위치 공유 및 기존 시설에 대한 온라인 제보 저장 | Vercel 프로젝트에 Upstash Redis 연결 |
| 기존 Upstash를 직접 연결 | Production 환경에 `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` 추가. `KV_REST_API_URL`, `KV_REST_API_TOKEN`도 지원 |
| 환경 변수 변경 후 | 다음 배포부터 반영되므로 재배포 |

Vercel에서 `/data.json`이 데이터 배열을 반환하는지 먼저 확인합니다. `/api/places`는 기본 목록과 공유 정보를 반환합니다. 공유 API가 일시 실패하면 앱은 정적 데이터로 기본 목록을 계속 보여줍니다.

## 데이터 출처와 갱신

기본 위치는 [Geofabrik 대한민국 OSM 추출본](https://download.geofabrik.de/asia/south-korea/index.html)의 2026년 11월 23일 파일에서 `amenity=toilets`로 등록된 점과 면 5,530곳을 추출한 것입니다. 등록 시설만 표시되므로 누락이나 오래된 정보가 있을 수 있습니다. 주소가 없을 때는 인근 지명을 표시합니다. 행정안전부 전국 공중화장실 표준데이터는 좌표 제공이 종료되어 이 버전의 지도 좌표 원본으로 사용하지 않았습니다. [공공데이터포털 제공 안내](https://www.data.go.kr/data/15012892/standard.do)

`data.json`의 OSM 파생 데이터는 © OpenStreetMap 기여자, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)입니다. 지도에 [OpenStreetMap 출처](https://www.openstreetmap.org/copyright)를 표시합니다. 지도 배경에는 [OSM 표준 타일](https://operations.osmfoundation.org/policies/tiles/)을 사용합니다.

갱신하려면 Geofabrik에서 PBF를 받아 아래 명령을 실행하고 `data.json` 변경분을 배포합니다.

```sh
python -m pip install osmium
python scripts/import-osm.py south-korea-latest.osm.pbf data.json
```
