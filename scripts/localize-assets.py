#!/usr/bin/env python3
"""Generate localized README artwork from the original SVG layout. No dependencies."""
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)

LOCALES = {
    "zh-CN": {
        "font": 'Arial,"PingFang SC","Microsoft YaHei",sans-serif',
        "hero_size": 72,
        "hero": ["JevPilot", "早期开发阶段", "CODEX 的 JEV 智能副驾", "复杂任务，交给 Codex。", "重复判断，交给 Jev。", "一个插件，接手任务中的细小判断。", "安装一次，照常工作。", "开源 · MIT"],
        "hero_desc": "JevPilot 正在开发中，目标平台为 macOS、Windows 和 Linux。",
        "status": "规划中 · 暂无安装包",
        "workflow": ["计划中的协作方式", "你的需求", "像平时一样提问。", "Codex", "计划、实现、验收。", "从开始到结束，负责整个任务。", "JevPilot", "判档、筛上下文、识别失败原因。", "在同一个工作流中，处理细小判断。", "不用记专门的提示词，也不用切换工作方式。"],
        "workflow_desc": "计划中的协作：用户描述任务，Codex 计划、实现并验收，JevPilot 协助处理有边界的小判断。",
    },
    "ru": {
        "font": 'Arial,Helvetica,sans-serif',
        "hero_size": 68,
        "hero": ["JevPilot", "В РАЗРАБОТКЕ", "JEV — ВАШ ПОМОЩНИК В CODEX", "Работайте в Codex.", "Малые решения — Jev.", "Один плагин для небольших решений в больших задачах.", "ОДНА УСТАНОВКА. ПРИВЫЧНАЯ РАБОТА.", "ОТКРЫТЫЙ КОД · MIT"],
        "hero_desc": "JevPilot находится на ранней стадии разработки. Целевые платформы: macOS, Windows и Linux.",
        "status": "В планах · Пока недоступно",
        "workflow": ["ПЛАНИРУЕМАЯ СХЕМА", "Ваша задача", "Спросите как обычно.", "Codex", "План. Реализация. Проверка.", "От постановки до проверки результата.", "JevPilot", "Выбор интенсивности. Контекст. Разбор сбоев.", "Малые решения в привычном рабочем процессе.", "Без специальных фраз и отдельного рабочего процесса."],
        "workflow_desc": "Планируемая схема: пользователь описывает задачу, Codex планирует, реализует и проверяет результат, а JevPilot помогает принимать небольшие решения.",
    },
    "ja": {
        "font": 'Arial,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
        "hero_size": 66,
        "hero": ["JevPilot", "開発初期段階", "CODEX のための JEV アシスタント", "いつもの Codex で。", "細かな判断は Jev に。", "ひとつのプラグインで、作業中の小さな判断をサポート。", "一度インストール。あとはいつもどおり。", "オープンソース · MIT"],
        "hero_desc": "JevPilot は開発初期段階です。macOS、Windows、Linux への対応を目指しています。",
        "status": "対応予定 · 未公開",
        "workflow": ["予定している作業の流れ", "あなたの依頼", "いつもどおりに質問。", "Codex", "計画、実装、検証。", "最初から最後までタスクを担当。", "JevPilot", "推論強度の選択・情報の選別・失敗の分類。", "同じ作業の流れで、細かな判断を支援。", "特別な呼び出し文句も、別の作業手順も不要。"],
        "workflow_desc": "予定している流れ：ユーザーが依頼し、Codex が計画・実装・検証を担当。JevPilot は範囲を限定した判断を支援します。",
    },
    "ko": {
        "font": 'Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif',
        "hero_size": 68,
        "hero": ["JevPilot", "초기 개발 단계", "CODEX를 위한 JEV 도우미", "Codex는 평소처럼.", "작은 판단은 Jev에게.", "작업 속 작은 판단을 맡기는 하나의 플러그인.", "한 번 설치하고, 평소처럼 작업하세요.", "오픈 소스 · MIT"],
        "hero_desc": "JevPilot은 초기 개발 단계입니다. macOS, Windows, Linux 지원을 목표로 합니다.",
        "status": "지원 예정 · 미공개",
        "workflow": ["예정된 작업 흐름", "사용자의 요청", "평소처럼 질문하세요.", "Codex", "계획, 구현, 검증.", "처음부터 끝까지 작업을 담당합니다.", "JevPilot", "추론 강도 선택 · 컨텍스트 선별 · 실패 분류", "같은 작업 흐름에서 작은 판단을 돕습니다.", "특별한 호출 문구나 별도의 작업 방식이 필요하지 않습니다."],
        "workflow_desc": "예정된 흐름: 사용자가 요청하면 Codex가 계획, 구현, 검증을 담당하고 JevPilot이 범위가 정해진 작은 판단을 돕습니다.",
    },
}


def localize(kind, locale, copy):
    tree = ET.parse(ROOT / "assets" / f"{kind}.svg")
    svg = tree.getroot()
    svg.set("lang", locale)
    for element in svg.iter():
        if "font-family" in element.attrib:
            element.set("font-family", copy["font"])
    texts = list(svg.iter(f"{{{NS}}}text"))
    if kind in ("hero", "workflow"):
        lines = copy[kind]
        assert len(texts) == len(lines), f"{kind} layout changed: update translations"
        for element, line in zip(texts, lines):
            element.text = line
            if element is not texts[0] or kind == "workflow":
                element.set("letter-spacing", "0")
        svg.find(f"{{{NS}}}desc").text = copy[f"{kind}_desc"]
        svg.find(f"{{{NS}}}title").text = (
            "JevPilot — " + " ".join(lines[3:5]) if kind == "hero" else lines[0]
        )
        if kind == "hero":
            for element in texts[3:5]:
                element.set("font-size", str(copy["hero_size"]))
        elif locale == "ru":
            texts[2].set("font-size", "15")
            texts[7].set("font-size", "15")
            texts[8].set("font-size", "13")
    else:
        texts[1].text = copy["status"]
        texts[1].set("font-size", "13.5" if locale == "ru" else "15")
        svg.find(f"{{{NS}}}title").text = texts[0].text + " — " + copy["status"]
    ET.indent(tree, space="  ")
    tree.write(ROOT / "assets" / f"{kind}.{locale}.svg", encoding="unicode")


if __name__ == "__main__":
    for locale, copy in LOCALES.items():
        for kind in ("hero", "windows", "macos", "linux", "workflow"):
            localize(kind, locale, copy)
    print("Generated 20 localized SVG assets.")
