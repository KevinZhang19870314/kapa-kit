/**
 * Cursor IDE Adapter — Cursor 适配器
 *
 * 基于 Cursor 1.7+ 原生 hooks 机制的三层组合策略：
 * 1. sessionStart hook — 新会话创建时通过 additional_context 注入上下文加载指引
 * 2. stop hook — Agent 循环结束且 status === "completed" 时通过 followup_message 触发评估
 * 3. MDC Rules（gapa-rules.mdc）— alwaysApply: true 的持久化规则兜底
 *
 * 生成文件：
 * - .cursor/rules/gapa-rules.mdc          — GAPA 评估规则 + 上下文加载行为指引
 * - .cursor/hooks.json                    — Cursor hooks 配置
 * - .cursor/hooks/gapa-session-start.mjs  — sessionStart hook 脚本
 * - .cursor/hooks/gapa-stop.mjs           — stop hook 脚本
 *
 * @module lib/adapters/cursor-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'

/** 中英文 MDC 文件的 description */
const I18N = {
  zh: {
    rulesDesc: 'GAPA 自我学习系统 — 评估规则与行为指引',
  },
  en: {
    rulesDesc: 'GAPA Self-Learning System — Evaluation Rules & Behavior Guidance',
  },
}

export default class CursorAdapter extends IDEAdapter {
  get name() { return 'cursor' }
  get formatVersion() { return '3.0' }
  get configDir() { return '.cursor' }
  get supportsHooks() { return true }

  /**
   * 检测当前项目是否已安装 Cursor 的 GAPA 配置。
   * 兼容旧版（仅有 rules/）和新版（有 hooks.json）安装。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.anyPathExists(projectRoot, [
      '.cursor/rules/',
      '.cursor/hooks.json',
    ])
  }

  /**
   * 生成 Cursor MDC 规则文件。
   * 仅生成 1 个合并的 MDC 文件（GAPA 规则 + 上下文加载行为指引）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { lang, gapaDir, templates } = ctx
    const vars = { gapaDir }
    const i18n = I18N[lang] || I18N.zh

    // 加载 MDC 包装器模板
    const mdcWrapper = loadAdapterTemplate('cursor', 'mdc-wrapper.tpl')

    // 替换核心模板中的占位符
    const gapaRulesContent = replacePlaceholders(templates.gapaRules, vars)
    const contextLoadContent = replacePlaceholders(templates.contextLoadPrompt, vars)

    // 注入到包装器
    const mdcContent = injectIntoWrapper(mdcWrapper, {
      description: i18n.rulesDesc,
      gapaRules: gapaRulesContent,
      contextLoadGuidance: contextLoadContent,
    })

    return [
      {
        relativePath: '.cursor/rules/gapa-rules.mdc',
        content: mdcContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 生成 Cursor hook 文件。
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
      version: 1,
      hooks: {
        sessionStart: [
          {
            command: 'node .cursor/hooks/gapa-session-start.mjs',
            timeout: 5,
          },
        ],
        stop: [
          {
            command: 'node .cursor/hooks/gapa-stop.mjs',
            timeout: 5,
          },
        ],
      },
    }

    // --- sessionStart hook 脚本 ---
    const sessionStartWrapper = loadAdapterTemplate('cursor', 'session-start-hook.tpl')
    const contextLoadPrompt = replacePlaceholders(templates.contextLoadPrompt, vars)
    const sessionStartContent = injectIntoWrapper(sessionStartWrapper, {
      contextLoadPrompt: escapeForTemplateLiteral(contextLoadPrompt),
    })

    // --- stop hook 脚本 ---
    const stopWrapper = loadAdapterTemplate('cursor', 'stop-hook.tpl')
    const evaluationPrompt = replacePlaceholders(templates.evaluationPrompt, vars)
    const stopContent = injectIntoWrapper(stopWrapper, {
      evaluationPrompt: escapeForTemplateLiteral(evaluationPrompt),
    })

    return [
      {
        relativePath: '.cursor/hooks.json',
        content: JSON.stringify(hooksConfig, null, 2) + '\n',
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.cursor/hooks/gapa-session-start.mjs',
        content: sessionStartContent,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.cursor/hooks/gapa-stop.mjs',
        content: stopContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 获取 Cursor 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.cursor/rules/gapa-rules.mdc', label: 'GAPA Rules (MDC)' },
      { relativePath: '.cursor/hooks.json', label: 'Cursor Hooks Config' },
      { relativePath: '.cursor/hooks/gapa-session-start.mjs', label: 'Session Start Hook' },
      { relativePath: '.cursor/hooks/gapa-stop.mjs', label: 'Stop Hook' },
    ]

    return files.map((f) => ({
      ...f,
      exists: this.pathExists(projectRoot, f.relativePath),
    }))
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
