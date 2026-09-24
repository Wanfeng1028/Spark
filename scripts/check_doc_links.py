#!/usr/bin/env python3
"""check_doc_links.py —— 文档一致性与引用检查器（CI 文档关卡）

背景：2026-08-23 外部评审发现 48 小时内 4 处事实漂移（README 阶段状态滞后、
"21 种事件"漏改、速查表计数不同步）。本脚本是防复发机制，随 CI 运行。

检查项：
1. 【error】markdown 相对链接可解析：[text](path.md#anchor)，剥锚点后目标须存在
2. 【error】跨文档事实一致性：
   a) 事件词表计数：doc/02 §4.3 标题 == ARCHITECTURE 事件模型行 == AGENTS §2.8 == README 词表行
   a2) 事件词表计数副锚点：doc/02 §6.4 处理表标题 == doc/03 §4 对比表行
   a3) 事件词表计数扩展锚点：apps/docs/index.md == apps/docs/faq.md == CONTRIBUTING.md == doc/02 §8.6
   a4) 事件词表计数 web 测试行锚点：doc/02 §8.6 web 行 == apps/docs/index.md
   b) 参考速查表计数：doc/02 §9 标题 == AGENTS §5
3. 【warn，--strict 升级为 error】反引号内仓库相对路径存在性：
   仅检查已知根前缀（packages/apps/doc/scripts/examples/.github/.agents 等），
   自动跳过外部参考项目的同名前缀路径（如 pi 的 packages/agent/**）与含占位符的路径。
4. 【error】doc/02 版本记录表重复版本号检测（防止 v4.50 重号类漂移复发）
5. 【error】对外文案口号扫描（DESIGN §12.7/§12.8，工单 19.44）：扫 official/src、
   apps/*/src 与门面 README 正文，命中"本地优先/数据不出本机/无云端依赖/跑在你自己/
   local-first"即报错。文档（DESIGN/AGENTS/doc/*）不扫——那里这些词是"被禁项的判据
   文本"与版本表勘误记录，出现属预期；README 内的版本记录表行同样跳过（拍板证据）。
   由来：「本地优先」在 AGENTS v1.3 / ARCHITECTURE v1.2 / README v1.3 三次拍板移除后，
   2026-09-14 官网落地第四次写回——纯 md 提醒挡不住，须有硬检查层（AGENTS §8 第四条纪律）。

用法：python scripts/check_doc_links.py [--root REPO_ROOT] [--strict]
退出码：0 = 通过；1 = 存在 error（或 strict 下存在 warn）
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- 常量

MD_GLOB = "**/*.md"
SKIP_DIRS = {".git", "node_modules", "dist", ".pnpm-store", ".zcode", "official"}


def _is_skipped(path: Path) -> bool:
    """目录级黑名单 + `.wt-*` 前缀临时工作目录（并行会话的仓库副本，扫描会撞不完整 node_modules）"""
    return any(part in SKIP_DIRS or part.startswith(".wt-") for part in path.parts)

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
    "packages/cli/",          # qwen-code（doc/02 工单 10.23 在线源码引用）
    "core/src/",              # opencode/codex
    "schema/src/",            # opencode-ai/schema
    "rollout/src/",           # codex
    "protocol/src/",          # codex
    "xai-grok-workspace/",    # Grok
)
# 外部参考项目的确切路径（无尾斜杠形式）
EXTERNAL_PATHS = {
    "packages/app", "packages/ui", "packages/session-ui", "packages/web",
    # dsh 的入口文件（doc/03 §2.1 引用）——本仓同名路径是 apps/web/src/main.tsx，不混淆
    "apps/web/src/main.ts",
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
        "ARCHITECTURE.md": r"\*\*事件模型\*\*\s*\|\s*(\d+) 种",
        "AGENTS.md": r"逐一单测（(\d+) 种）",
        "README.md": r"(\d+) 种事件词表",
    },
    "参考速查表条数": {
        "doc/02-development-plan.md": r"^# 9\. 参考速查表（(\d+) 条）",
        "AGENTS.md": r"完整 (\d+) 条速查表在",
    },
    # 副锚点（doc/02 v4.40）：同一事实在 doc/02 内还有第二处（§6.4 处理表标题），而每条
    # 规则以文件名为键——同文件只能挂一个锚点，故另立一条规则交叉校验它与 doc/03 §4 对比表行。
    # 由来：工单 16.3 第一批改了 §4.3 却漏了 §6.4（标题停在 21 种、表里已 22 行），
    # doc/03 更是自阶段七两次扩表后一直停在 19 种——两处都不在主规则锚点上，默漂了多个版本。
    "事件词表计数（副锚点）": {
        "doc/02-development-plan.md": r"\*\*applyEvent 处理表（(\d+) 种全覆盖）\*\*",
        "doc/03-frontend-approach.md": r"reducer 事件表单测\*\*（(\d+) 种事件逐一断言）",
    },
    # 扩展锚点（工单 W9）：覆盖 apps/docs 文档站与 CONTRIBUTING 中的事件计数措辞，
    # 以及 doc/02 §8.6 测试矩阵 protocol 行——此前四处均不在任何规则锚点上，默漂不报。
    "事件词表计数（扩展锚点）": {
        "apps/docs/index.md": r"(\d+) 种事件的词表",
        "apps/docs/faq.md": r"处理 (\d+) 种事件的投影规则",
        "CONTRIBUTING.md": r"(\d+) 种逐一单测",
        "doc/02-development-plan.md": r"(\d+) 种事件样例逐一过",
    },
    # web 测试行锚点（工单 W9）：doc/02 §8.6 web 行的 "applyEvent N 种逐一断言" 交叉校验。
    "事件词表计数（web 测试行锚点）": {
        "doc/02-development-plan.md": r"\*\*applyEvent (\d+) 种逐一断言\*\*",
        "apps/docs/index.md": r"(\d+) 种事件的字段表",
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
    """os.walk 容忍遍历中途目录消失（并行会话的 .wt-* 临时目录随时增删）；prune 掉跳过目录不进入。"""
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root, onerror=lambda _e: None):
        dirnames[:] = [d for d in dirnames if not _is_skipped(Path(dirpath, d))]
        for name in filenames:
            if name.endswith(".md"):
                out.append(Path(dirpath, name))
    return sorted(out)


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


# ---------------------------------------------------------------- 检查 3：版本表重号

# doc/02 版本记录表行正则（提取版本号）
VERSION_ROW_RE = re.compile(r"^\|\s*(v[\d.]+[a-z]?)\s*\|", re.MULTILINE)


def check_version_duplicates(root: Path, report: Report) -> None:
    """检测 doc/02-development-plan.md 版本记录表中的重复版本号。

    允许带后缀消歧的版本号（如 v4.50a）与无后缀版本共存——只报告完全相同的版本号出现两次以上。
    """
    doc02 = root / "doc" / "02-development-plan.md"
    if not doc02.exists():
        return
    text = doc02.read_text(encoding="utf-8")
    seen: dict[str, list[int]] = {}  # version -> [line_numbers]
    for match in VERSION_ROW_RE.finditer(text):
        ver = match.group(1)
        line = text[: match.start()].count("\n") + 1
        seen.setdefault(ver, []).append(line)
    for ver, lines in sorted(seen.items()):
        if len(lines) > 1:
            locs = ", ".join(f"L{n}" for n in lines)
            report.error(
                f"[版本表重号] doc/02-development-plan.md 版本号 {ver} 出现 {len(lines)} 次（{locs}）"
            )


# ---------------------------------------------------------------- 检查 4：反引号路径


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


# ---------------------------------------------------------------- 检查 5：对外文案口号

# 禁项字面量。判据层是 DESIGN §12.8 表的新增行，本表是执行层——两处须同改。
COPY_SLOP_PATTERNS: tuple[str, ...] = ("本地优先", "数据不出本机", "无云端依赖", "跑在你自己")
COPY_SLOP_RE = re.compile("|".join([*(re.escape(p) for p in COPY_SLOP_PATTERNS), r"[Ll]ocal-first"]))
COPY_SLOP_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".css", ".html")
COPY_SLOP_READMES = ("README.md", "README.en.md", "official/README.md")
COPY_SLOP_SKIP_DIRS = {"node_modules", "dist", ".next", ".pnpm-store", "out"}
# 版本记录表行（`| v1.3 | 2026-08-22 |`）——引用被禁词是拍板证据本身，不判违规。
# 与检查 3 的 VERSION_ROW_RE 是两个用途（那个要捕获版本号做重号比对），故另立名字不复用。
COPY_SLOP_VERSION_ROW_RE = re.compile(r"^\s*\|\s*v\d+\.\d+")


def _hit(line: str) -> str | None:
    match = COPY_SLOP_RE.search(line)
    return match.group(0) if match else None


def _iter_copy_code_files(root: Path) -> list[Path]:
    bases = [root / "official" / "src"]
    apps_dir = root / "apps"
    if apps_dir.is_dir():
        bases.extend(sorted(p / "src" for p in apps_dir.iterdir() if (p / "src").is_dir()))
    out: list[Path] = []
    for base in bases:
        if not base.is_dir():
            continue
        for dirpath, dirnames, filenames in os.walk(base, onerror=lambda _e: None):
            dirnames[:] = [d for d in dirnames if d not in COPY_SLOP_SKIP_DIRS]
            out.extend(Path(dirpath, n) for n in filenames if n.endswith(COPY_SLOP_SUFFIXES))
    return sorted(out)


def check_copy_slop(root: Path, report: Report) -> None:
    targets = [(p, False) for p in _iter_copy_code_files(root)]
    targets += [(root / r, True) for r in COPY_SLOP_READMES if (root / r).exists()]
    for path, skip_version_rows in targets:
        rel = path.relative_to(root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if skip_version_rows and COPY_SLOP_VERSION_ROW_RE.match(line):
                continue
            phrase = _hit(line)
            if phrase is not None:
                report.error(
                    f"[文案口号] {rel}:{lineno} 命中「{phrase}」——DESIGN §12.7 禁"
                    f"口号标签与第二人称喊话，改说事实（工单 19.44）"
                )


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
    check_version_duplicates(root, report)
    check_copy_slop(root, report)

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
