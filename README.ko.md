<p align="center"><img src="assets/hero.ko.583ac211cddb.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.ko.svg?v=preview20260926" width="32%" alt="windows x64 — 프리뷰 다운로드" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.ko.svg?v=preview20260926" width="32%" alt="macos arm64 — 프리뷰 다운로드" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.ko.svg?v=preview20260926" width="32%" alt="linux x64 — 프리뷰 다운로드" /></a></p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**플러그인 하나로 평소처럼 Codex를 사용하세요. 작은 판단은 Jev가 돕고 계획, 구현, 최종 검증은 Codex가 맡습니다.**

[다른 아키텍처와 체크섬](https://github.com/wangzhezbz/jev-pilot/releases/tag/preview-20260926) · [macOS Intel](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-x64.zip) · [Windows ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-arm64.zip) · [Linux ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-arm64.zip)

macOS 실기기 검증 완료. Windows/Linux는 빌드와 CI 검증 완료, 데스크톱 실기기 검증은 예정입니다. 서명되지 않은 ZIP이며 Node 24+, curl, ripgrep이 필요합니다.

## 평소 작업 방식 그대로

평소처럼 요청하면 JevPilot이 판단, 자료 선별, 화면 조작을 돕습니다. 여러 Skill이나 별도 실행기, 매번 입력하는 호출 문구가 필요하지 않습니다.

## 실측 사례

| 시나리오 | 시간 | GPT 토큰 | Jev 포함 추정 비용 |
|---|---:|---:|---:|
| 문서 선별 | −40.03% | −23.88% | −33.69% |
| Computer Use 연속 탐색 | −47.64% | −57.14% | −56.52% |

선별한 실측 사례이며 macOS에서 시나리오당 2쌍을 비교했습니다. UI는 긴 대화의 조작 구간, 비용은 2026-09-24 API 가격 기준 추정치입니다. 모든 작업의 절감을 보장하지 않습니다. [데이터 및 측정 방법](docs/reports/targeted-20260925/README.zh-CN.md) · [전체 보고서](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

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

## 한 번 설치하고 평소처럼 사용

1. OS와 CPU에 맞는 ZIP을 내려받아 압축을 풉니다.
2. 아래 요청과 폴더 경로를 Codex에 전달합니다.
3. 로컬 설정 화면에서 자신의 TypeSafe Key를 비공개로 입력하고 Codex를 재시작합니다.
4. 이후 평소처럼 요청하세요. 화면 조작은 기존 공식 Chrome / Computer Use 플러그인을 사용합니다.

> 이 압축 해제 폴더의 JevPilot을 개인 Codex 플러그인으로 설치해 주세요. 의존성과 호환성을 확인하고 TypeSafe Key를 비공개로 입력할 로컬 설정 화면을 열어 주세요. 어댑터를 설정하고 재시작 후 활성화를 확인해 주세요. 선택한 모델과 다른 플러그인은 유지해 주세요.

### GitHub에서 직접 설치

> https://github.com/wangzhezbz/jev-pilot 에서 JevPilot을 개인 Codex 플러그인으로 설치해 주세요. 의존성과 호환성을 확인하고 TypeSafe Key 비공개 설정과 재시작 후 확인을 안내해 주세요.

[자세한 설치 방법](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)

## 프로젝트 상태

개발 프리뷰 · MIT · 5개 언어. 프로젝트 메모리는 동의 후 활성화하며 컨텍스트 인계는 원래 대화 기록을 변경하지 않습니다. OpenAI 또는 TypeSafe의 공식 제품이 아닌 독립 커뮤니티 프로젝트입니다.
