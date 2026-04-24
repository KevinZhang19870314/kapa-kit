/**
 * VS Code (Copilot) Adapter — VS Code 适配器
 *
 * VS Code Copilot 支持多种自定义指令和强制执行机制：
 * - .github/copilot-instructions.md — 全局 always-on 指令
 * - .github/instructions/*.instructions.md — 带 applyTo 的拆分指令文件
 * - .github/hooks/*.json — Agent Hooks（代码级强制执行，Preview）
 *
 * 策略：
 * 1. copilot-instructions.md 保留精简但强命令式的 GAPA 概述
 * 2. 拆分的 .instructions.md 文件提供详细规则
 * 3. Stop hook 在 agent 结束时提醒执行 GAPA 评估（Preview 功能，可能不生效）
 *
 * 生成文件：
 * - .github/copilot-instructions.md — GAPA 概述 + 降级行为指引（标记包裹）
 * - .github/instructions/gapa-rules.instructions.md — GAPA 完整规则
 * - .github/instructions/gapa-context-load.instructions.md — 任务开始前指引
 * - .github/instructions/gapa-evaluation.instructions.md — 任务完成后评估
 * - .github/hooks/gapa-stop.json — Stop hook 配置（提醒评估）
 *
 * @module lib/adapters/vscode-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'
import { GAPA_START_MARKER, GAPA_END_MARKER } from '../utils/fs-helpers.mjs'

/** 中英文 instructions 文件的 name / description */
const I18N = {
  zh: {
    rulesName: 'GAPA 评估规则',
    rulesDesc: 'GAPA 自我学习系统的完整评估规则和文件更新策略',
    contextLoadName: 'GAPA 任务开始前',
    contextLoadDesc: '实质性任务开始前读取历史记录和相关 skill',
    evaluationName: 'GAPA 任务完成后',
    evaluationDesc: '实质性任务完成后执行评估、提炼 skill、更新偏好',
  },
  en: {
    rulesName: 'GAPA Evaluation Rules',
    rulesDesc: 'Complete evaluation rules and file update strategy for GAPA self-learning system',
    contextLoadName: 'GAPA Pre-Task',
    contextLoadDesc: 'Read history records and relevant skills before substantive tasks',
    evaluationName: 'GAPA Post-Task',
    evaluationDesc: 'Execute evaluation, extract skills, update preferences after substantive tasks',
  },
}

/**
 * Stop hook JSON 配置。
 * 使用最简单的 echo 命令输出 block decision，无需外部脚本。
 * 注意：VS Code hooks 是 Preview 功能，可能不在所有版本中生效。
 */
const HOOK_CONFIGS = {
  zh: {
    hooks: {
      Stop: [
        {
          type: 'command',
          command: 'node -e "process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:\'Stop\',decision:\'block\',reason:\'任务完成前请执行 GAPA 评估：读取 .gapa/gapa-rules.md，按 5 个维度评估当前任务，将结果追加到 .gapa/memory.md。如果有可复用工作流提炼为 .gapa/skills/{name}.md，如果有新偏好更新 .gapa/preferences.md。简单问答可跳过。\'}}))"',
          timeout: 5,
        },
      ],
    },
  },
  en: {
    hooks: {
      Stop: [
        {
          type: 'command',
          command: 'node -e "process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:\'Stop\',decision:\'block\',reason:\'Before finishing, execute GAPA evaluation: read .gapa/gapa-rules.md, evaluate against 5 dimensions, append results to .gapa/memory.md. Extract reusable workflows to .gapa/skills/{name}.md, update .gapa/preferences.md if new preferences observed. Skip for simple Q&A.\'}}))"',
          timeout: 5,
        },
      ],
    },
  },
}

export default class VSCodeAdapter extends IDEAdapter {
  get name() { return 'vscode' }
  get formatVersion() { return '3.1' }
  get configDir() { return '.github' }
  get supportsHooks() { return false }

  /**
   * 检测当前项目是否已安装 VS Code Copilot 的配置。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.anyPathExists(projectRoot, [
      '.github/copilot-instructions.md',
      '.github/instructions/',
      '.github/hooks/',
    ])
  }

  /**
   * 生成 VS Code Copilot 的全部文件（instructions + hook）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { gapaDir, lang } = ctx
    const vars = { gapaDir }
    const i18n = I18N[lang] || I18N.zh

    const files = []

    // ── 1. copilot-instructions.md ──
    files.push(this._buildOverviewFile(ctx, vars))

    // ── 2. gapa-rules.instructions.md ──
    files.push(this._buildRulesInstructionFile(ctx, vars, i18n))

    // ── 3. gapa-context-load.instructions.md ──
    files.push(this._buildContextLoadInstructionFile(ctx, vars, i18n))

    // ── 4. gapa-evaluation.instructions.md ──
    files.push(this._buildEvaluationInstructionFile(ctx, vars, i18n))

    // ── 5. Stop hook（Preview，可能不生效，作为额外保障）──
    files.push(this._buildStopHookFile(ctx))

    return files
  }

  /**
   * 生成降级行为指引文件。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateFallbackSteering(ctx) {
    return this.generateSteering(ctx)
  }

  /**
   * 获取 VS Code Copilot 已安装的 GAPA 文件列表。
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.github/copilot-instructions.md', label: 'GAPA Overview (copilot-instructions.md)' },
      { relativePath: '.github/instructions/gapa-rules.instructions.md', label: 'GAPA Rules (instructions)' },
      { relativePath: '.github/instructions/gapa-context-load.instructions.md', label: 'GAPA Context Load (instructions)' },
      { relativePath: '.github/instructions/gapa-evaluation.instructions.md', label: 'GAPA Evaluation (instructions)' },
      { relativePath: '.github/hooks/gapa-stop.json', label: 'GAPA Stop Hook (hooks, Preview)' },
    ]

    return files.map((f) => ({
      ...f,
      exists: this.pathExists(projectRoot, f.relativePath),
    }))
  }

  // ─── Internal helpers ───

  /**
   * 构建 copilot-instructions.md。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @param {Record<string, string>} vars
   * @returns {import('./base-adapter.mjs').FileOutput}
   */
  _buildOverviewFile(ctx, vars) {
    const { templates } = ctx
    const wrapper = loadAdapterTemplate('vscode', 'instructions-overview.tpl')

    const overviewRaw = templates.copilotOverview || templates.gapaRules
    const overviewContent = replacePlaceholders(overviewRaw, vars).trim()
    const fallbackContent = this._buildFallbackContent(ctx)

    const fullContent = injectIntoWrapper(wrapper, {
      overview: overviewContent,
      fallbackSteering: fallbackContent,
    })

    const gapaContent = this._stripGapaMarkers(fullContent)

    return {
      relativePath: '.github/copilot-instructions.md',
      content: gapaContent,
      writeStrategy: 'append-with-markers',
    }
  }

  /**
   * 构建 gapa-rules.instructions.md。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @param {Record<string, string>} vars
   * @param {object} i18n
   * @returns {import('./base-adapter.mjs').FileOutput}
   */
  _buildRulesInstructionFile(ctx, vars, i18n) {
    const wrapper = loadAdapterTemplate('vscode', 'gapa-rules-instruction.tpl')
    const rulesContent = replacePlaceholders(ctx.templates.gapaRules, vars).trim()

    const content = injectIntoWrapper(wrapper, {
      name: i18n.rulesName,
      description: i18n.rulesDesc,
      gapaRules: rulesContent,
    })

    return {
      relativePath: '.github/instructions/gapa-rules.instructions.md',
      content,
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 构建 gapa-context-load.instructions.md。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @param {Record<string, string>} vars
   * @param {object} i18n
   * @returns {import('./base-adapter.mjs').FileOutput}
   */
  _buildContextLoadInstructionFile(ctx, vars, i18n) {
    const wrapper = loadAdapterTemplate('vscode', 'context-load-instruction.tpl')
    const contextLoadContent = replacePlaceholders(ctx.templates.contextLoadPrompt, vars).trim()

    const content = injectIntoWrapper(wrapper, {
      name: i18n.contextLoadName,
      description: i18n.contextLoadDesc,
      contextLoadContent,
    })

    return {
      relativePath: '.github/instructions/gapa-context-load.instructions.md',
      content,
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 构建 gapa-evaluation.instructions.md。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @param {Record<string, string>} vars
   * @param {object} i18n
   * @returns {import('./base-adapter.mjs').FileOutput}
   */
  _buildEvaluationInstructionFile(ctx, vars, i18n) {
    const wrapper = loadAdapterTemplate('vscode', 'evaluation-instruction.tpl')
    const evaluationContent = replacePlaceholders(ctx.templates.evaluationPrompt, vars).trim()

    const content = injectIntoWrapper(wrapper, {
      name: i18n.evaluationName,
      description: i18n.evaluationDesc,
      evaluationContent,
    })

    return {
      relativePath: '.github/instructions/gapa-evaluation.instructions.md',
      content,
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 构建 Stop hook 配置文件。
   * 使用内联 echo 命令，无需外部脚本，最大化兼容性。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput}
   */
  _buildStopHookFile(ctx) {
    const { gapaDir, lang } = ctx
    const langKey = (lang === 'en') ? 'en' : 'zh'
    const config = JSON.parse(JSON.stringify(HOOK_CONFIGS[langKey]))

    // 替换 hook reason 中的 .gapa 路径
    for (const hook of config.hooks.Stop) {
      hook.command = hook.command.replace(/\.gapa\//g, `${gapaDir}/`)
    }

    return {
      relativePath: '.github/hooks/gapa-stop.json',
      content: JSON.stringify(config, null, 2) + '\n',
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 构建降级行为指引内容。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {string}
   */
  _buildFallbackContent(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }

    const contextLoadPrompt = replacePlaceholders(templates.contextLoadPrompt, vars).trim()
    const evaluationPrompt = replacePlaceholders(templates.evaluationPrompt, vars).trim()

    return `### 任务开始前\n${contextLoadPrompt}\n\n### 任务完成后\n${evaluationPrompt}`
  }

  /**
   * 从模板输出中提取 GAPA 标记之间的内容。
   * @param {string} content
   * @returns {string}
   */
  _stripGapaMarkers(content) {
    const startIdx = content.indexOf(GAPA_START_MARKER)
    const endIdx = content.indexOf(GAPA_END_MARKER)

    if (startIdx === -1 || endIdx === -1) {
      return content
    }

    const afterStart = startIdx + GAPA_START_MARKER.length
    const inner = content.substring(afterStart, endIdx)

    const lines = inner.split('\n')
    const filtered = []
    let skippedComment = false
    for (const line of lines) {
      if (!skippedComment && line.trim().startsWith('<!-- 由 gapa-kit')) {
        skippedComment = true
        continue
      }
      filtered.push(line)
    }

    let result = filtered.join('\n')
    result = result.replace(/^\n+/, '')
    result = result.replace(/\n+$/, '')

    return result
  }
}
