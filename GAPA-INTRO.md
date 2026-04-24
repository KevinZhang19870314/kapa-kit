# 让 AI 编程助手学会「长记性」—— GAPA 跨 IDE 自我学习框架

> 你有没有这样的体验：每次打开 Cursor / Copilot 开始新对话，AI 就像失忆了一样，上次踩过的坑、你反复强调的代码风格、项目里约定俗成的模式……全部归零，从头来过。
>
> GAPA 就是为了解决这个问题而生的。

## 一句话介绍

**GAPA**（Generalized Action and Prompt Adaptation）是一套开源的跨 IDE 自我学习框架，让 AI Agent 在每次任务后自动评估、积累经验、提炼工作流，并在下次任务中主动应用——真正实现「越用越懂你」。

目前支持 **Kiro · Cursor · Claude Code · VS Code (Copilot) · Windsurf · TRAE** 六大主流 AI IDE / 编辑器。

---

## 为什么需要 GAPA？

### 现状：AI 助手的「金鱼记忆」

当前的 AI 编程助手有一个根本性的短板——**无状态**。每次对话都是一张白纸：

- 上次帮你修了一个 ESLint 配置的坑，这次遇到同样的问题还是会踩
- 你说了十遍「我们项目用 Composition API」，下次它可能还是给你写 Options API
- 一个复杂的部署流程，每次都要从头描述

你可以手动写 Rules / Steering 文件来缓解，但这本质上是在**人工维护 AI 的记忆**——这件事本身就应该让 AI 来做。

### GAPA 的思路：让 AI 自己管理自己的记忆

GAPA 的核心理念很简单：

> **任务完成 → 自动复盘 → 沉淀经验 → 下次应用**

这不是什么新概念——这就是人类学习的方式。GAPA 只是把这个循环工程化了，让 AI Agent 也能做到。

---

## 核心机制

GAPA 的运行逻辑可以用一张图概括：

```
用户提交任务
    ↓
📥 Context Load — 读取历史记忆 + 相关 Skill → 应用到当前任务
    ↓
🤖 Agent 执行任务
    ↓
📊 Evaluation — 5 维度评估 → 追加记忆 → 提炼 Skill → 更新偏好
    ↓
🔄 下次任务自动受益
```

拆开来看，GAPA 做了三件事：

### 1. 任务评估（Memory）

每次实质性任务完成后，Agent 会从 5 个维度进行自我评估：

| 维度 | 关注点 |
|------|--------|
| 准确性 | 结果是否正确，是否满足需求 |
| 效率 | 是否走了弯路，有没有更快的方案 |
| 代码质量 | 代码是否规范、可维护 |
| 上下文利用 | 是否充分利用了项目已有的代码和约定 |
| 沟通 | 是否理解了用户意图，交互是否顺畅 |

评估结果会自动追加到 `memory.md`，格式类似：

```markdown
### GAPA-003 | 2025-07-15 | 修复登录页 Token 刷新逻辑
- **做得好的：** 准确定位到 interceptor 中的竞态条件
- **可优化的：** 初始方案没有考虑并发请求场景
- **行动项：** 涉及 Token 刷新时，优先检查是否存在并发请求队列机制
- **提炼 skill：** token-refresh-pattern
- **偏好更新：** 无
- **评分：** 4/5
```

下次遇到类似任务时，Agent 会主动读取这些记录，避免重复犯错。

### 2. 工作流提炼（Skill）

当 Agent 发现某类任务反复出现（或者单次但通用性很强），它会自动将工作流提炼为一个 Skill 文件：

```markdown
# Skill: Token Refresh Pattern

## 触发场景
- 涉及 HTTP interceptor 中的 Token 刷新逻辑

## 工作流
1. 检查是否已有请求队列机制（避免并发刷新）
2. 确认 refresh token 的存储位置和过期策略
3. 实现 interceptor 拦截 → 队列等待 → 刷新 → 重放
4. 添加刷新失败的降级处理（跳转登录页）

## 注意事项
- 并发请求必须排队，不能同时触发多次刷新
- 刷新失败时清除所有 token，避免死循环
```

Skill 文件控制在 40 行以内，精炼实用。你也可以手动创建 Skill 来「教」Agent 特定的工作流。

### 3. 偏好适应（Preferences）

Agent 会持续观察你的习惯，自动积累到 `preferences.md`：

```markdown
## 沟通偏好
- 中文沟通，简洁直接，先给结论再展开
- 修改代码前先说明方案，等确认后再动手

## 代码风格
- Vue SFC 使用 Composition API + script setup
- 后端路由统一返回 ApiResponse 包装
- 变量命名使用 camelCase，常量使用 UPPER_SNAKE_CASE

## 项目特定习惯
- i18n 三语管理，zh-CN 为基准
- 状态管理使用 Pinia，一个 store 一个模块
```

这些偏好会随着使用不断更新——新增 append，同类 rewrite，过时删除，始终保持精简。

---

## 跨 IDE：一份数据，处处可用

GAPA 最大的设计亮点之一是**跨 IDE 共享数据**。

所有 IDE 共享同一个 `.gapa/` 目录：

```
.gapa/
├── memory.md          # 任务评估记录
├── preferences.md     # 用户偏好
├── skills/            # 提炼的工作流
├── .gaparc.json       # 配置文件
└── .gitignore         # memory.md 不入库，preferences 和 skills 可团队共享
```

这意味着：
- 你在 Cursor 里积累的经验，切到 Claude Code 时依然有效
- 团队成员可以共享 `preferences.md` 和 `skills/`，统一 AI 的行为规范
- `memory.md` 是个人数据，默认 gitignore，不会泄露到仓库

### 各 IDE 的适配方式

| IDE | 适配方式 | 自动触发 |
|-----|---------|---------|
| Kiro | Steering + 原生 Hook | ✅ promptSubmit / agentStop |
| Cursor | MDC Rules | ⚡ 通过行为指引降级实现 |
| Claude Code | CLAUDE.md 标记注入 | ⚡ 通过行为指引降级实现 |
| VS Code | copilot-instructions.md | ⚡ 通过行为指引降级实现 |
| Windsurf | Rules (YAML front-matter) | ⚡ 通过行为指引降级实现 |
| TRAE | Rules + Skill | ⚡ 通过行为指引降级实现 |

Kiro 是唯一支持原生 Hook 的 IDE，可以在 `promptSubmit`（用户发消息时）和 `agentStop`（Agent 完成时）精确触发上下文加载和评估流程。其他 IDE 通过在 Rules/Steering 中嵌入行为指引来降级实现相同效果。

---

## 30 秒上手

```bash
# 自动检测 IDE 并安装
npx gapa-kit init

# 指定 IDE
npx gapa-kit init --target cursor

# 多 IDE 同时安装
npx gapa-kit init --target kiro --target cursor --target claude-code

# 英文模板
npx gapa-kit init --target cursor --lang en
```

安装完成后，正常使用你的 AI 助手即可。GAPA 会在后台默默工作——你会逐渐发现 AI 越来越「懂」你的项目和习惯。

### 常用命令

```bash
gapa init              # 初始化
gapa update            # 更新框架文件（保留用户数据）
gapa status            # 查看安装状态和数据统计
```

---

## 设计哲学

GAPA 在设计上遵循几个原则：

**零侵入** — 不修改你的项目代码，只在 IDE 配置目录和 `.gapa/` 目录中工作。卸载就是删两个目录的事。

**诚实评估** — 评估维度和标准是透明的，Agent 不会给自己「放水」。行动项必须具体可执行，不允许空泛的「下次注意」。

**克制提炼** — Skill 不是越多越好。只有真正反复出现或通用性强的工作流才会被提炼，避免信息过载。

**偏好基于观察** — Agent 不会臆测你的偏好，只记录实际观察到的习惯。新增 append，同类 rewrite，过时删除。

**团队友好** — `preferences.md` 和 `skills/` 可以提交到 Git，团队成员共享同一套 AI 行为规范。`memory.md` 是个人数据，默认排除。

---

## 和手写 Rules 有什么区别？

你可能会问：我直接在 `.cursorrules` 或 Steering 里写规则不就行了？

当然可以。但 GAPA 解决的是一个不同层面的问题：

| | 手写 Rules | GAPA |
|---|-----------|------|
| 维护方式 | 人工编写和更新 | Agent 自动维护 |
| 覆盖范围 | 你能想到的规则 | 包括你没意识到的习惯 |
| 跨 IDE | 每个 IDE 单独维护 | 一份数据，所有 IDE 共享 |
| 持续演进 | 写完就不动了 | 每次任务后自动更新 |
| 团队协作 | 各写各的 | 共享 preferences 和 skills |

GAPA 不是要替代手写 Rules，而是在此基础上增加了一层**自动化的经验积累机制**。两者完全可以共存。

---

## 写在最后

GAPA 目前还在快速迭代中（当前版本 v0.5.1），但核心的「评估 → 记忆 → 提炼 → 应用」循环已经稳定可用。

如果你也受够了 AI 助手的「金鱼记忆」，不妨试试：

```bash
npx gapa-kit init
```

然后正常写代码，过几天回头看看 `.gapa/memory.md` 和 `preferences.md`，你会发现 AI 真的在「学习」。

---

**GitHub:** [github.com/kevinzhang19870314/gapa-kit](https://github.com/kevinzhang19870314/gapa-kit)

**NPM:** [npmjs.com/package/gapa-kit](https://www.npmjs.com/package/gapa-kit)

**协议：** MIT
