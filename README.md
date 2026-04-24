# GAPA Kit — Generalized Action and Prompt Adaptation

[![npm version](https://img.shields.io/npm/v/gapa-kit.svg)](https://www.npmjs.com/package/gapa-kit)

GAPA 是一套跨 IDE 的 AI Agent 自我学习框架，支持 **Kiro**、**Cursor**、**Claude Code**、**VS Code (Copilot)**、**Windsurf** 和 **TRAE**。

核心能力：

- **任务评估** — 每次实质性任务完成后自动评估表现
- **工作流提炼** — 将重复出现的高价值工作流自动提炼为可复用的 Skill
- **偏好适应** — 持续观察用户习惯，自动积累个性化偏好

## 快速开始

```bash
# 自动检测当前项目使用的 IDE 并安装
npx gapa-kit init

# 指定目标 IDE
npx gapa-kit init --target kiro

# 指定目标 IDE + 英文模板
npx gapa-kit init --target cursor --lang en

# 同时为多个 IDE 安装
npx gapa-kit init --target kiro --target cursor --target claude-code
```

## 命令

### `gapa init`

初始化 GAPA 框架。生成 IDE 特定的 steering/rules 文件和共享的 `.gapa/` 数据目录。

```bash
gapa init [--target <ide>] [--lang <zh|en>]
```

- `--target` — 目标 IDE，可多次指定。支持：`kiro`、`cursor`、`claude-code`、`vscode`、`windsurf`、`trae`
- `--lang` — 模板和 CLI 消息语言，默认 `zh`。支持：`zh`、`en`
- 未指定 `--target` 时自动检测项目中已有的 IDE 配置目录，检测到多个时交互式选择

### `gapa update`

更新框架文件（steering/rules/hooks），保留用户数据（memory.md、preferences.md）。

```bash
gapa update [--target <ide>]
```

- 从 `.gaparc.json` 读取已安装的 IDE 列表和语言设置
- 对使用 GAPA 标记的文件（CLAUDE.md、copilot-instructions.md）仅替换标记区域内容
- 未指定 `--target` 时更新所有已安装的 IDE

### `gapa status`

检查 GAPA 安装状态，统计 Memory 条目数和 Skill 文件数。

```bash
gapa status [--target <ide>]
```

### 其他命令

| 命令 | 说明 |
|------|------|
| `gapa version` | 显示版本号 |
| `gapa help` | 显示帮助信息 |

## 各 IDE 使用示例

### Kiro

```bash
npx gapa-kit init --target kiro
```

生成文件：

```
.kiro/
├── steering/
│   ├── gapa.md                        # 框架规则（inclusion: manual）
│   └── gapa-preferences.md            # 偏好指引（inclusion: auto）
└── hooks/
    ├── gapa-context-load.kiro.hook    # 任务前加载上下文（promptSubmit 触发）
    └── gapa-evaluation.kiro.hook      # 任务后评估（agentStop 触发）
```

Kiro 是唯一支持原生 Hook 机制的 IDE，其他 IDE 通过 steering/rules 中的行为指引降级实现。

### Cursor

```bash
npx gapa-kit init --target cursor
```

生成文件：

```
.cursor/rules/
└── gapa-framework.mdc    # MDC 格式，alwaysApply: true
```

GAPA 规则和行为指引（上下文加载 + 评估 prompt）嵌入到 MDC 规则文件中。

### Claude Code

```bash
npx gapa-kit init --target claude-code
```

生成文件：

```
CLAUDE.md    # 追加 GAPA 段落（<!-- GAPA:START --> / <!-- GAPA:END --> 标记包裹）
```

如果 `CLAUDE.md` 已存在，GAPA 内容会追加到文件末尾，不影响原有内容。`update` 时仅替换标记区域。

### VS Code (Copilot)

```bash
npx gapa-kit init --target vscode
```

生成文件：

```
.github/
└── copilot-instructions.md    # 追加 GAPA 段落（GAPA 标记包裹）
```

与 Claude Code 类似，使用 GAPA 标记实现追加和幂等更新。

### Windsurf

```bash
npx gapa-kit init --target windsurf
```

生成文件：

```
.windsurf/rules/
└── gapa-framework.md    # YAML front-matter，trigger: always_on
```

### TRAE

```bash
npx gapa-kit init --target trae
```

生成文件：

```
.trae/
├── rules/
│   └── gapa-framework.md       # 纯 Markdown 全局规则
└── skills/gapa/
    └── SKILL.md                # YAML front-matter（name + description），Model-invoked 技能
```

## `.gapa/` 共享目录结构

所有 IDE 共享同一份数据目录，避免多份数据的同步问题：

```
.gapa/
├── memory.md          # 任务评估记录（自动维护，个人数据）
├── preferences.md     # 用户偏好（自动学习，可团队共享）
├── skills/            # Skill 文件（可团队共享）
│   └── _example.md    # 示例 Skill 模板
├── .gaparc.json       # GAPA 配置（已安装 IDE、语言、版本）
└── .gitignore         # 排除 memory.md，保留 preferences.md 和 skills/
```

`.gaparc.json` 示例：

```json
{
  "version": "0.2.0",
  "lang": "zh",
  "installedAdapters": {
    "kiro": { "formatVersion": "1.0", "installedAt": "2025-07-10T..." },
    "cursor": { "formatVersion": "1.0", "installedAt": "2025-07-10T..." }
  }
}
```

## 自定义

### 评估维度

编辑 `.gapa/` 对应的 steering/rules 文件中的维度行：

```markdown
**维度：** 准确性 | 效率 | 代码质量 | 上下文利用 | 沟通
```

### 偏好

编辑 `.gapa/preferences.md`，填入你的偏好（沟通偏好、代码风格、项目特定习惯）。Agent 会在后续交互中自动补充和优化。

### 创建自定义 Skill

参考 `.gapa/skills/_example.md` 模板创建 Skill 文件。GAPA 也会在识别到可复用模式时自动创建 Skill。

## 从 v0.1.0 迁移到 v0.2.0

v0.2.0 引入了跨 IDE 支持和共享数据目录 `.gapa/`。

### 主要变化

| 项目 | v0.1.0 | v0.2.0 |
|------|--------|--------|
| 支持 IDE | 仅 Kiro | Kiro + Cursor + Claude Code + VS Code + Windsurf + TRAE |
| 数据目录 | `.kiro/steering/` | `.gapa/`（跨 IDE 共享） |
| CLI 参数 | 无 | `--target <ide>` + `--lang <zh\|en>` |
| 模板语言 | 仅中文 | 中文 + 英文 |

### 自动迁移

运行 `gapa init` 时，如果检测到旧版安装（`.kiro/steering/gapa-*.md` 存在且 `.gapa/` 不存在），CLI 会提示是否执行迁移：

- `.kiro/steering/gapa-memory.md` → `.gapa/memory.md`
- `.kiro/steering/gapa-preferences.md` → `.gapa/preferences.md`
- `.kiro/skills/` 下的 Skill 文件 → `.gapa/skills/`

迁移后 `.kiro/steering/gapa-preferences.md` 会保留为指向 `.gapa/preferences.md` 的指引文件。

### 手动迁移

如果你希望手动迁移：

```bash
# 1. 创建共享目录
mkdir -p .gapa/skills

# 2. 迁移数据文件
cp .kiro/steering/gapa-memory.md .gapa/memory.md
cp .kiro/steering/gapa-preferences.md .gapa/preferences.md
cp .kiro/skills/*.md .gapa/skills/

# 3. 重新安装
npx gapa-kit init --target kiro
```

## 工作原理

```
用户提交任务
    ↓
[Context Load] → 读取 .gapa/memory.md + .gapa/skills/ → 应用到当前任务
    ↓
Agent 执行任务
    ↓
[Evaluation] → 5 维度评估 → 追加记忆 → 提炼 Skill → 更新偏好
    ↓
下次任务自动受益
```

支持 Hook 的 IDE（Kiro）通过原生 Hook 自动触发；不支持 Hook 的 IDE 通过 steering/rules 中的行为指引降级实现相同效果。

## 卸载

```bash
# 删除共享数据目录
rm -rf .gapa/

# 删除 IDE 特定文件（按需）
rm -rf .kiro/steering/gapa*.md .kiro/hooks/gapa-*.kiro.hook
rm -rf .cursor/rules/gapa-framework.mdc
# Claude Code: 手动删除 CLAUDE.md 中 GAPA:START 到 GAPA:END 之间的内容
# VS Code: 手动删除 copilot-instructions.md 中 GAPA:START 到 GAPA:END 之间的内容
rm -rf .windsurf/rules/gapa-framework.md
rm -rf .trae/rules/gapa-framework.md .trae/skills/gapa/
```

## License

[MIT](LICENSE)
