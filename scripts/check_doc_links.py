#!/usr/bin/env python3
"""check_doc_links.py —— 文档一致性与引用检查器（CI 文档关卡）

背景：2026-08-23 外部评审发现 48 小时内 4 处事实漂移（README 阶段状态滞后、
"21 种事件"漏改、速查表计数不同步）。本脚本是防复发机制，随 CI 运行。

检查项：
1. 【error】markdown 相对链接可解析：[text](path.md#anchor)，剥锚点后目标须存在
2. 【error】跨文档事实一致性：
   a) 事件词表计数：doc/02 §4.3 标题 == ARCHITECTURE 事件模型行 == AGENTS §2.8 == README 词表行
   b) 参考速查表计数：doc/02 §9 标题 == AGENTS §5
3. 【warn，--strict 升级为 error】反引号内仓库相对路径存在性：
   仅检查已知根前缀（packages/apps/doc/scripts/examples/.github/.agents 等），
   自动跳过外部参考项目的同名前缀路径（如 pi 的 packages/agent/**）与含占位符的路径。

用法：python scripts/check_doc_links.py [--root REPO_ROOT] [--strict]
退出码：0 = 通过；1 = 存在 error（或 strict 下存在 warn）
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- 常量

MD_GLOB = "**/*.md"
SKIP_DIRS = {".git", "node_modules", "dist", ".pnpm-store", ".zcode"}

# 反引号路径只查这些根前缀（仓库自身结构）；其余视为外部引用或噪声
REPO_PATH_ROOTS = (
    "packages/", "apps/", "doc/", "scripts/", "examples/",
    ".github/", ".agents/", ".cursor/", ".windsurf/", ".qoder/", ".trae/",
)
ROOT_FILES = {
    "AGENTS.md", "README.md", "ARCHITECTURE.md", "DESIGN.md",
    "CLAUDE.md", "GEMINI.md", "QWEN.md", "package.json", "pnpm-workspace.yaml",
    "tsconfig.base.json", "eslint.config.js", ".prettierrc.json", "LICENSE",
}

# 已知的外部参考项目路径前缀——它们以 packages//apps/ 开头但不属于本仓库
EXTERNAL_PREFIXES = (
    "packages/agent/",        # pi
    "packages/coding-agent/", # pi
    "packages/ai/",           # pi-ai
    "packages/opencode/",     # opencode
    "packages/core/session/", # dsh
    "packages/core/src/",     # dsh
    "packages/schema/",       # opencode-ai/schema
    "packages/client/",       # dsh
    "core/src/",              # opencode/codex
    "schema/src/",            # opencode-ai/schema
    "rollout/src/",           # codex
    "protocol/src/",          # codex
    "xai-grok-workspace/",    # Grok
)
# 外部参考项目的确切路径（无尾斜杠形式）
EXTERNAL_PATHS = {
    "packages/app", "packages/ui", "packages/session-ui", "packages/web",
}

# 目录式简写引用（如 doc/02、doc/01/02——指文档编号而非文件路径）
DOC_SHORTHAND_RE = re.compile(r"^doc/\d+(\.\d+)?(/[A-Za-z0-9]+)*$")

# 路径占位符（模板/树形图片段），不做存在性判断
PLACEHOLDER_CHARS = set("{}*<>|$\\")

MD_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
BACKTICK_RE = re.compile(r"`([^`\n]+)`")

# 事实一致性规则：(名称, {文件名: 正则})，各文件的首个捕获组必须全部相等
FACT_RULES: dict[str, dict[str, str]] = {
    "事件词表计数": {
        "doc/02-development-plan.md": r"# 4\.3 事件词表（(\d+) 种",
        "ARCHITECTURE.md": r"\*\*事件模型\*\* \| (\d+) 种",
        "AGENTS.md": r"逐一单测（(\d+) 种）",
        "README.md": r"(\d+) 种事件词表",
    },
    "参考速查表条数": {
        "doc/02-development-plan.md": r"^# 9\. 参考速查表（(\d+) 条）",
        "AGENTS.md": r"完整 (\d+) 条速查表在",
    },
}

# 规划中尚未创建的合法路径（warn 豁免名单；落地后应从名单移除）
PLANNED_PATHS = {
    "prompts/base.ts",            # §5.11 提示词常量，阶段三落地
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def iter_md_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.md") if not any(part in SKIP_DIRS for part in p.parts))


def strip_anchor(link: str) -> str:
    return link.split("#", 1)[0]


# ---------------------------------------------------------------- 检查 1：链接

def check_md_links(files: list[Path], root: Path, report: Report) -> None:
    for path in files:
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")
        for match in MD_LINK_RE.finditer(text):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            clean = strip_anchor(target)
            if not clean.endswith(".md"):
                continue
            resolved = (path.parent / clean).resolve()
            if not resolved.exists():
                line = text[: match.start()].count("\n") + 1
                report.error(f"{rel}:{line} 断链：({target})")


# ---------------------------------------------------------------- 检查 2：事实一致性

def check_facts(files: list[Path], root: Path, report: Report) -> None:
    by_rel: dict[str, str] = {}
    for path in files:
        by_rel[path.relative_to(root).as_posix()] = path.read_text(encoding="utf-8")

    for rule_name, patterns in FACT_RULES.items():
        values: dict[str, tuple[str, int]] = {}
        for rel, pattern in patterns.items():
            match = re.search(pattern, by_rel.get(rel, ""), re.MULTILINE)
            if match:
                values[rel] = (match.group(1), by_rel[rel][: match.start()].count("\n") + 1)
        if not values:
            report.error(f"[{rule_name}] 所有锚点正则都未命中——正则可能已过时，请更新本脚本")
            continue
        distinct = {v[0] for v in values.values()}
        if len(distinct) > 1:
            detail = "、".join(f"{rel}:{line}={val}" for rel, (val, line) in sorted(values.items()))
            report.error(f"[{rule_name}] 计数不一致 → {detail}")
        missing = sorted(set(patterns) - set(values))
        if missing:
            report.warn(f"[{rule_name}] 锚点未命中（文件缺失或措辞变更）：{', '.join(missing)}")


# ---------------------------------------------------------------- 检查 3：反引号路径

def check_backtick_paths(files: list[Path], root: Path, report: Report) -> None:
    for path in files:
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")
        for match in BACKTICK_RE.finditer(text):
            candidate = match.group(1).strip()
            if "/" not in candidate and candidate not in ROOT_FILES:
                continue
            if candidate.startswith(("~", "http", "@")) or any(c in PLACEHOLDER_CHARS for c in candidate):
                continue
            if DOC_SHORTHAND_RE.match(candidate):
                continue
            if candidate.startswith(EXTERNAL_PREFIXES) or candidate in EXTERNAL_PATHS:
                continue
            if not candidate.startswith(REPO_PATH_ROOTS) and candidate not in ROOT_FILES:
                continue
            if candidate in PLANNED_PATHS:
                continue
            line = text[: match.start()].count("\n") + 1
            if not (root / candidate).exists():
                report.warn(f"{rel}:{line} 仓库路径不存在：`{candidate}`")


# ---------------------------------------------------------------- 主流程

def main() -> int:
    parser = argparse.ArgumentParser(description="Spark 文档一致性检查器")
    parser.add_argument("--root", default=".", help="仓库根目录（默认当前目录）")
    parser.add_argument("--strict", action="store_true", help="warning 也计为失败")
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台
    except AttributeError:
        pass

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"根目录不存在：{root}")
        return 1

    report = Report()
    files = iter_md_files(root)
    check_md_links(files, root, report)
    check_facts(files, root, report)
    check_backtick_paths(files, root, report)

    for w in report.warnings:
        print(f"[WARN] {w}")
    for e in report.errors:
        print(f"[FAIL] {e}")
    print(
        f"\n检查完成：{len(files)} 个 md 文件，"
        f"{len(report.errors)} error / {len(report.warnings)} warning"
    )
    if report.errors or (args.strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
