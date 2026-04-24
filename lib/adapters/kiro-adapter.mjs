/**
 * Kiro IDE Adapter — Kiro 适配器
 *
 * Kiro 原生支持 hook 和 steering 机制：
 * - steering 文件使用 YAML front-matter（inclusion: auto/manual）
 * - hook 文件使用 JSON 格式（.kiro.hook 扩展名）
 *
 * 生成文件：
 * - .kiro/steering/gapa.md          — GAPA 主规则（inclusion: manual）
 * - .kiro/steering/gapa-preferences.md — 偏好指引（inclusion: auto，指向 .gapa/preferences.md）
 * - .kiro/hooks/gapa-context-load.kiro.hook — 上下文加载 hook（promptSubmit 触发）
 * - .kiro/hooks/gapa-evaluation.kiro.hook   — 评估 hook（agentStop 触发）
 *
 * @module lib/adapters/kiro-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'

/** Kiro steering 文件中偏好指引的内容模板（中文） */
const PREFERENCES_POINTER_ZH =
  '用户的沟通偏好、代码风格和项目习惯。在所有交互中提供个性化上下文。\n\n' +
  '请读取 `{{gapaDir}}/preferences.md` 获取用户偏好信息，并在后续交互中应用这些偏好。'

/** Kiro steering 文件中偏好指引的内容模板（英文） */
const PREFERENCES_POINTER_EN =
  "User's communication preferences, code style and project habits. Provides personalized context across all interactions.\n\n" +
  'Please read `{{gapaDir}}/preferences.md` for user preferences and apply them in subsequent interactions.'

export default class KiroAdapter extends IDEAdapter {
  get name() { return 'kiro' }
  get formatVersion() { return '1.0' }
  get configDir() { return '.kiro' }
  get supportsHooks() { return true }

  /**
   * 检测当前项目是否已安装 Kiro 的 GAPA 配置。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.anyPathExists(projectRoot, ['.kiro/steering/', '.kiro/hooks/'])
  }

  /**
   * 生成 Kiro steering 文件。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { lang, gapaDir, templates } = ctx
    const vars = { gapaDir }

    // --- gapa.md: GAPA 主规则 steering ---
    const steeringWrapper = loadAdapterTemplate('kiro', 'steering-wrapper.tpl')
    const rulesContent = replacePlaceholders(templates.gapaRules, vars)
    const gapaSteeringContent = injectIntoWrapper(steeringWrapper, {
      inclusion: 'manual',
      gapaRules: rulesContent,
    })

    // --- gapa-preferences.md: 偏好指引 steering ---
    const prefsPointerRaw = lang === 'en' ? PREFERENCES_POINTER_EN : PREFERENCES_POINTER_ZH
    const prefsPointerContent = replacePlaceholders(prefsPointerRaw, vars)
    const prefsSteeringContent = injectIntoWrapper(steeringWrapper, {
      inclusion: 'auto',
      gapaRules: prefsPointerContent,
    })

    return [
      {
        relativePath: '.kiro/steering/gapa.md',
        content: gapaSteeringContent,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.kiro/steering/gapa-preferences.md',
        content: prefsSteeringContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 生成 Kiro hook 文件。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateHooks(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }
    const hookWrapper = loadAdapterTemplate('kiro', 'hook.tpl')

    // --- context-load hook: promptSubmit 触发 ---
    const contextLoadPrompt = replacePlaceholders(templates.contextLoadPrompt, vars).trim()
    const contextLoadContent = injectIntoWrapper(hookWrapper, {
      hookName: 'GAPA Context Load',
      hookDescription: lang2HookDesc(ctx.lang, 'contextLoad'),
      triggerType: 'promptSubmit',
      prompt: escapeJsonString(contextLoadPrompt),
    })

    // --- evaluation hook: agentStop 触发 ---
    const evaluationPrompt = replacePlaceholders(templates.evaluationPrompt, vars).trim()
    const evaluationContent = injectIntoWrapper(hookWrapper, {
      hookName: 'GAPA Post-Task Evaluation',
      hookDescription: lang2HookDesc(ctx.lang, 'evaluation'),
      triggerType: 'agentStop',
      prompt: escapeJsonString(evaluationPrompt),
    })

    return [
      {
        relativePath: '.kiro/hooks/gapa-context-load.kiro.hook',
        content: contextLoadContent,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.kiro/hooks/gapa-evaluation.kiro.hook',
        content: evaluationContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 获取 Kiro 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.kiro/steering/gapa.md', label: 'GAPA Rules (steering)' },
      { relativePath: '.kiro/steering/gapa-preferences.md', label: 'Preferences Pointer (steering)' },
      { relativePath: '.kiro/hooks/gapa-context-load.kiro.hook', label: 'Context Load Hook' },
      { relativePath: '.kiro/hooks/gapa-evaluation.kiro.hook', label: 'Evaluation Hook' },
    ]

    return files.map((f) => ({
      ...f,
      exists: this.pathExists(projectRoot, f.relativePath),
    }))
  }
}

// ─── Internal helpers ───

/**
 * Hook description 的多语言映射。
 * @param {'zh' | 'en'} lang
 * @param {'contextLoad' | 'evaluation'} hookType
 * @returns {string}
 */
function lang2HookDesc(lang, hookType) {
  const descs = {
    zh: {
      contextLoad: '在收到用户消息时，提醒 Agent 读取 GAPA 历史记忆和相关 skill，以便应用过往的行动项和偏好',
      evaluation: '每次 agent 执行完成后，触发 GAPA 三合一评估：任务评估 + 工作流提炼 + 偏好更新',
    },
    en: {
      contextLoad: 'When receiving user messages, remind Agent to read GAPA history memory and related skills to apply past action items and preferences',
      evaluation: 'After each agent execution, trigger GAPA 3-in-1 evaluation: task evaluation + workflow refinement + preference update',
    },
  }
  return (descs[lang] || descs.zh)[hookType]
}

/**
 * 转义 JSON 字符串中的特殊字符。
 * hook.tpl 中 prompt 字段需要是合法的 JSON 字符串值。
 * @param {string} str
 * @returns {string}
 */
function escapeJsonString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}
