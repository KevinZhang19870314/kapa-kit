/**
 * VS Code (Copilot) Adapter — VS Code 适配器
 *
 * VS Code Copilot 支持多种自定义指令和原生 hooks 机制：
 * - .github/copilot-instructions.md — 全局 always-on 指令
 * - .github/instructions/*.instructions.md — 带 applyTo 的拆分指令文件
 * - .github/hooks/hooks.json — 原生 hooks 配置
 * - .github/hooks/gapa-prompt-submit.mjs — UserPromptSubmit hook（注入上下文加载指引）
 * - .github/hooks/gapa-stop.mjs — Stop hook（触发 GAPA 评估）
 *
 * 策略：
 * 1. copilot-instructions.md 保留精简但强命令式的 GAPA 概述
 * 2. 拆分的 .instructions.md 文件提供详细规则
 * 3. 原生 hooks 通过 UserPromptSubmit 注入上下文、通过 Stop 触发评估
 *
 * generateSteering() 生成文件：
 * - .github/copilot-instructions.md — GAPA 概述（标记包裹）
 * - .github/instructions/gapa-rules.instructions.md — GAPA 完整规则
 * - .github/instructions/gapa-context-load.instructions.md — 任务开始前指引
 * - .github/instructions/gapa-evaluation.instructions.md — 任务完成后评估
 *
 * generateHooks() 生成文件：
 * - .github/hooks/hooks.json — hooks 配置
 * - .github/hooks/gapa-prompt-submit.mjs — UserPromptSubmit hook 脚本
 * - .github/hooks/gapa-stop.mjs — Stop hook 脚本
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

export default class VSCodeAdapter extends IDEAdapter {
  get name() { return 'vscode' }
  get formatVersion() { return '4.0' }
  get configDir() { return '.github' }
  get supportsHooks() { return true }

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

    return files
  }

  /**
   * 生成 VS Code Copilot hook 文件。
   * 生成 3 个文件：hooks.json 配置 + 2 个 hook 脚本。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateHooks(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }

    // --- hooks.json 配置 ---
    const hooksConfig = {
      hooks: {
        UserPromptSubmit: [
          {
            type: 'command',
            command: 'node .github/hooks/gapa-prompt-submit.mjs',
            timeout: 10,
          },
        ],
        Stop: [
          {
            type: 'command',
            command: 'node .github/hooks/gapa-stop.mjs',
            timeout: 10,
          },
        ],
      },
    }

    // --- UserPromptSubmit hook 脚本 ---
    const promptSubmitWrapper = loadAdapterTemplate('vscode', 'prompt-submit-hook.tpl')
    const contextLoadPrompt = replacePlaceholders(templates.contextLoadPrompt, vars)
    const promptSubmitContent = injectIntoWrapper(promptSubmitWrapper, {
      contextLoadPrompt: escapeForTemplateLiteral(contextLoadPrompt),
    })

    // --- Stop hook 脚本 ---
    const stopWrapper = loadAdapterTemplate('vscode', 'stop-hook.tpl')
    const evaluationPrompt = replacePlaceholders(templates.evaluationPrompt, vars)
    const stopContent = injectIntoWrapper(stopWrapper, {
      evaluationPrompt: escapeForTemplateLiteral(evaluationPrompt),
    })

    return [
      {
        relativePath: '.github/hooks/hooks.json',
        content: JSON.stringify(hooksConfig, null, 2) + '\n',
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.github/hooks/gapa-prompt-submit.mjs',
        content: promptSubmitContent,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.github/hooks/gapa-stop.mjs',
        content: stopContent,
        writeStrategy: 'overwrite',
      },
    ]
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
      { relativePath: '.github/hooks/hooks.json', label: 'GAPA Hooks Config' },
      { relativePath: '.github/hooks/gapa-prompt-submit.mjs', label: 'GAPA UserPromptSubmit Hook' },
      { relativePath: '.github/hooks/gapa-stop.mjs', label: 'GAPA Stop Hook' },
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

    const fullContent = injectIntoWrapper(wrapper, {
      overview: overviewContent,
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

// ─── Internal helpers ───

/**
 * 转义内容以安全注入到 JavaScript 模板字面量（反引号字符串）中。
 * 必须转义：反斜杠、反引号、${
 *
 * @param {string} str
 * @returns {string}
 */
function escapeForTemplateLiteral(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
}
