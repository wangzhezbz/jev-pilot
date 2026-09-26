<p align="center"><img src="assets/hero.ko.583ac211cddb.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.ko.svg?v=download20260926" width="32%" alt="windows x64 — 다운로드" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.ko.svg?v=download20260926" width="32%" alt="macos arm64 — 다운로드" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.ko.svg?v=download20260926" width="32%" alt="linux x64 — 다운로드" /></a></p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**플러그인 하나로 평소처럼 Codex를 사용하세요. 작은 판단은 Jev가 돕고 계획, 구현, 최종 검증은 Codex가 맡습니다.**

## 평소 작업 방식 그대로

평소처럼 요청하면 JevPilot이 판단, 자료 선별, 화면 조작을 돕습니다. 여러 Skill이나 별도 실행기, 매번 입력하는 호출 문구가 필요하지 않습니다.

## GitHub에서 직접 설치

아래 요청을 Codex에 보내세요:

> https://github.com/wangzhezbz/jev-pilot 에서 JevPilot을 개인 Codex 플러그인으로 설치해 주세요. 의존성과 호환성을 확인하고 TypeSafe Key 비공개 설정과 재시작 후 확인을 안내해 주세요.

[자세한 설치 방법](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)

## 실측 사례

### 추론 강도 자동 조정 실측

| 시나리오 | 시간 | GPT 토큰 | Jev 포함 추정 비용 | 실제 강도 변경 |
| --- | --- | --- | --- | --- |
| [티켓 안정 정렬 수정](docs/reports/holdout-20260925/README.zh-CN.md) | −25.64% | −17.13% | −5.25% | high → medium |
| [구간 차집합 수정](docs/reports/holdout-20260925/README.zh-CN.md) | −14.20% | −12.58% | −31.40% | high → low |

두 작업 모두 독립 검증을 통과하고 네이티브 applied 기록을 확인했습니다. 수치는 전체 작업 비교입니다.

### 문서 선별 및 복원 가능한 출력

| 시나리오 | 시간 | GPT 토큰 | Jev 포함 추정 비용 |
| --- | --- | --- | --- |
| [문서 선별](docs/reports/targeted-20260925/README.zh-CN.md) | −40.03% | −23.88% | −33.69% |

### 자동 판단 실측: Chrome 및 Computer Use

| 시나리오 | 시간 | GPT 토큰 | Jev 포함 추정 비용 | 실제 Jev 판단 |
| --- | --- | --- | --- | --- |
| [Chrome 기록 조회](docs/reports/holdout-20260925/README.zh-CN.md) | −41.03% | −55.91% | −54.87% | 판단 5회 / 조작 5회 / 중간 인계 0회 |
| [Computer Use 연속 탐색](docs/reports/targeted-20260925/README.zh-CN.md) | −47.64% | −57.14% | −56.52% | 2회 실행에서 각각: 판단 5회 / 조작 5회 / 중간 인계 0회 |

### 컴포넌트 실측

| 컴포넌트 | 실측 결과 |
| --- | --- |
| [자동 판단: 자료 일괄 선별](docs/reports/cache-budget-20260924/README.zh-CN.md) | 180개 기록, Jev 호출 6회에 4.119초. 116개 제외, 대상 증거 8개 모두 유지. 반환 본문 크기 −62.96%(바이트) |
| [필수 도구 선택](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 필수 도구 12개 모두 유지, 불필요한 Jev 토큰 2,090 → 0 |
| [검토 및 테스트 선택](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 이전 버전 대비 시간 −22.69%, Jev 토큰 −53.93%, 필수 테스트 9개 모두 유지 |
| [반복 인계 판단 재사용](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 5회 인계에서 요청 5 → 1, Jev 토큰 −80.25%, 원문 모두 유지 |
| [무손실 컨텍스트 인계](docs/reports/localization-handoff-20260925/README.zh-CN.md) | 전체 표현 5,439 → 2,713바이트(−50.12%), 대화 교환 6쌍 모두 복원 가능 |

위 수치는 시나리오를 실제로 실행해 측정한 결과입니다. [테스트 시나리오 및 전체 데이터](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

## 14가지 기능

| # | 기능 | 하는 일 |
|---:|---|---|
| 1 | **자동 판단** | 분류와 후보 선택을 일괄 처리하고 판단을 재사용합니다. |
| 2 | **추론 강도 자동 조절** | 선택한 모델을 유지하며 실제 요청 강도를 조절합니다. |
| 3 | **검색과 파일 선별** | 출처 위치를 보존하며 관련 자료를 찾습니다. |
| 4 | **복원 가능한 출력 필터** | 핵심 근거를 먼저 읽고 필요하면 원문을 다시 봅니다. |
| 5 | **도구와 Skill 선택** | 필수 도구를 유지하고 적합한 후보를 선택합니다. |
| 6 | **실패 인식과 복구** | 재시도를 제한하고 불확실한 작업은 Codex에 넘깁니다. |
| 7 | **근거 및 품질 검사** | 실행 결과, 내용 규칙, 번역 일관성을 확인합니다. |
| 8 | **Chrome과 Computer Use** | 기존 공식 플러그인으로 범위가 제한된 연속 클릭을 수행합니다. |
| 9 | **프로젝트 메모리** | 동의하에 출처, 유효 기간, 취소 기능과 함께 저장합니다. |
| 10 | **사용량과 효과 통계** | GPT/Jev 사용량, 추정 비용, 실제 강도 변경을 기록합니다. |
| 11 | **컨텍스트 인계** | 반복 텍스트를 무손실 표현으로 줄이고 원문을 보존합니다. |
| 12 | **변경 검토와 테스트 선택** | 필수 테스트를 유지하고 관련 변경을 우선 확인합니다. |
| 13 | **체크포인트와 재개** | 진행 상황을 저장하고 파일 변경을 확인한 뒤 재개합니다. |
| 14 | **원문 정확 추출** | 원문 위치를 반환하고 누락이나 모호함을 표시합니다. |
