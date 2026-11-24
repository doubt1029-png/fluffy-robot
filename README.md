# fluffy-robot
## 실행

프로젝트 루트에서 `node server.mjs`를 실행하고 http://127.0.0.1:4173 을 엽니다. 로컬 제보는 `reports.json`에 저장됩니다.

## Vercel 배포

1. GitHub 저장소를 가져오고 루트 디렉터리 `./`, 프레임워크 `Other`를 선택합니다. 빌드 명령과 출력 디렉터리는 `vercel.json`에서 읽습니다.
2. Vercel Marketplace에서 Upstash Redis를 프로젝트의 Production 환경에 연결합니다. 기존 Upstash를 사용하는 경우 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`을 프로젝트 환경 변수에 설정합니다. `KV_REST_API_URL`과 `KV_REST_API_TOKEN`도 지원합니다.
3. 배포합니다. 환경 변수를 배포 후 추가했다면 다시 배포합니다. Redis 연결 전에도 예시 시설 검색과 상세 화면을 이용할 수 있습니다. 제보 저장은 연결 후 활성화됩니다.
