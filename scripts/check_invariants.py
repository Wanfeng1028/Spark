#!/usr/bin/env python3
"""check_invariants.py —— 横向不变量第二关（LA-63）

背景：doc/11 审计发现多处"声称零命中"的 grep 验收从未真正执行（§12.8 检查项、
圆角封闭集、public-surface 值导出条数、engine.ts 行数口径、端点路径字符串）。
本脚本使这五项"声称"必须有当次执行痕迹——任一偏离即 CI 红。

检查项（对应 doc/11 LA-63）：
1. web 聊天/设置组件源码无 shadow-lg（重投影禁令；dialog.tsx 曾有一处漏网）
2. web 组件 border-radius 封闭集：rounded 类只允许 tokens 登记过的档位
   （rounded / rounded-md / rounded-lg / rounded-xl / rounded-[22px] / rounded-full /
     rounded-r-md / rounded-t-* 继承族）
3. packages/engine 公共面（index.ts）导出符号数与 doc/02 §4.6 锚定数一致
   （防止"值导出条数"漂移；数字在脚本内显式断言，改面必须同步改这里）
4. packages/engine/src/engine.ts 行数如实口径：AGENTS §1.1 记录的行数与实际差 >10% 报警
   （行数写死必漂——这里是"记录值 vs 实测值"的对账，不是限成长上限）
5. server 端点路径抽查：openapi.json 的路径集与 routes 源码 app.get/put/post/delete
   字面量一致（防"路径字符串写错/漏登 openapi"）

用法：python scripts/check_invariants.py [--root REPO_ROOT]
退出码：0 = 通过；非 0 = 存在偏离
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def ok(msg: str) -> None:
    print(f"[ok] {msg}")


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def web_dir(root: Path) -> Path:
    return root / "apps" / "web" / "src"


# ---------------------------------------------------------------- 1. shadow-lg 禁令

def check_shadow_lg(root: Path) -> bool:
    bad = []
    for p in web_dir(root).rglob("*.tsx"):
        if "shadow-lg" in read(p):
            bad.append(str(p.relative_to(root)))
    if bad:
        for b in bad:
            fail(f"shadow-lg 命中 {b}——重投影禁令（§12.8），改 popover-surface 或 token 化阴影")
        return False
    ok("shadow-lg 零命中（聊天/设置组件面）")
    return True


# ---------------------------------------------------------------- 2. 圆角封闭集

ALLOWED_RADII = {
    "rounded",
    "rounded-sm",
    "rounded-md",
    "rounded-lg",
    "rounded-xl",
    "rounded-2xl",
    "rounded-full",
    "rounded-none",
    "rounded-r-md",
    "rounded-l-md",
}

def check_radius_set(root: Path) -> bool:
    pattern = re.compile(r"\brounded(?:-[a-z0-9]+|-\[[^\]]+\])+")
    bad = []
    for p in web_dir(root).rglob("*.tsx"):
        for m in pattern.finditer(read(p)):
            token = m.group(0)
            # 任意值特批：22px（Composer 卡身，WO-058）/ 2px、3px（图表微圆角）
            if token in ("rounded-[22px]", "rounded-[2px]", "rounded-[3px]", "rounded-t-[3px]"):
                continue
            if token not in ALLOWED_RADII:
                bad.append(f"{p.relative_to(root)}: {token}")
    if bad:
        for b in sorted(set(bad)):
            fail(f"圆角越出封闭集：{b}（LA-63；新档位先进 ALLOWED_RADII 登记）")
        return False
    ok(f"圆角封闭集通过（{len(ALLOWED_RADII)} 档 + 2px/3px/22px 特批）")
    return True


# ---------------------------------------------------------------- 3. engine 公共面导出数

# doc/02 §4.6 锚定的 @spark/engine 公共面导出条数（index.ts 的 export 声明数）。
# 改公共面必须同步此数——这正是"值导出条数有闸"的本体。
EXPECTED_ENGINE_EXPORTS = 69


def engine_export_count(root: Path) -> int:
    text = read(root / "packages" / "engine" / "src" / "index.ts")
    # 逐条 export 声明计数（export { a, b as c } 内的逗号分隔项 + export const/function/class/…）
    count = 0
    for m in re.finditer(r"^export \{([^}]+)\}", text, re.M):
        count += len([x for x in m.group(1).split(",") if x.strip()])
    for m in re.finditer(r"^export (?:const|function|class|abstract class|type|interface|enum) ([A-Za-z_][A-Za-z0-9_]*)", text, re.M):
        count += 1
    return count


def check_engine_exports(root: Path) -> bool:
    actual = engine_export_count(root)
    if actual != EXPECTED_ENGINE_EXPORTS:
        fail(
            f"@spark/engine 公共面导出 {actual} 条 ≠ 闸值 {EXPECTED_ENGINE_EXPORTS}"
            f"（LA-63；公共面有意识扩面时同步 scripts/check_invariants.py 的 EXPECTED_ENGINE_EXPORTS）"
        )
        return False
    ok(f"engine 公共面导出 {actual} 条 = 闸值")
    return True


# ---------------------------------------------------------------- 4. engine.ts 行数口径

# AGENTS §1.1 记录值（LA-41 实测口径）。允许 ±10% 漂移——超窗说明"巨石又长了一截"，
# 该回 AGENTS 更新记录值（不阻止开发，防记录失真）。
RECORDED_ENGINE_LINES = 2871


def check_engine_lines(root: Path) -> bool:
    actual = len(read(root / "packages" / "engine" / "src" / "engine.ts").splitlines())
    drift = abs(actual - RECORDED_ENGINE_LINES) / RECORDED_ENGINE_LINES
    if drift > 0.10:
        fail(
            f"engine.ts 实测 {actual} 行与 AGENTS 记录 {RECORDED_ENGINE_LINES} 行偏差 {drift:.0%}"
            f" 超 10%——请回 AGENTS §1.1 更新记录值（LA-63 口径对账）"
        )
        return False
    ok(f"engine.ts {actual} 行（记录 {RECORDED_ENGINE_LINES}，对账通过）")
    return True


# ---------------------------------------------------------------- 5. 端点路径抽查

def route_paths(root: Path) -> set[str]:
    paths: set[str] = set()
    routes_dir = root / "apps" / "server" / "src" / "routes"
    pattern = re.compile(r"app\.(?:get|put|post|delete)\(\s*'([^']+)'")
    # 通配段别名：源码 '*' ↔ openapi 命名参数
    wildcard_aliases = {
        "/api/attachments/*": "/api/attachments/{file}",
        "/api/artifacts/*": "/api/artifacts/{file}",
    }
    for p in routes_dir.rglob("*.ts"):
        for m in pattern.finditer(read(p)):
            path = m.group(1)
            path = wildcard_aliases.get(path, path)
            # :id 风格 → {id}（openapi 记法）后比对
            paths.add(re.sub(r":[A-Za-z]+", lambda m: "{" + m.group(0)[1:] + "}", path))
    return paths


def openapi_paths(root: Path) -> set[str]:
    text = read(root / "packages" / "protocol" / "openapi.json")
    return set(re.findall(r'"(/api/[^"]+)"\s*:', text))


def check_endpoint_sync(root: Path) -> bool:
    routes = route_paths(root)
    doc = openapi_paths(root)
    missing = {p for p in routes if p not in doc and p != "/api/healthz"}
    if missing:
        for m in sorted(missing):
            fail(f"路由 {m} 未进 openapi.json（LA-63 端点路径抽查）")
        return False
    ok(f"端点路径同步（{len(routes)} 条路由全部在 openapi.json）")
    return True


# ---------------------------------------------------------------- 主流程

def main() -> int:
    parser = argparse.ArgumentParser(description="横向不变量第二关（LA-63）")
    parser.add_argument("--root", default=".", help="仓库根目录（默认当前目录）")
    args = parser.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"根目录不存在：{root}")
        return 1

    results = [
        check_shadow_lg(root),
        check_radius_set(root),
        check_engine_exports(root),
        check_engine_lines(root),
        check_endpoint_sync(root),
    ]
    passed = sum(1 for r in results if r)
    print(f"\n不变量检查完成：{passed}/{len(results)} 通过")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
