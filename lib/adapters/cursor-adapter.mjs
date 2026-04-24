/**
 * Cursor IDE Adapter — Cursor 适配器
 *
 * Cursor 使用 MDC（Markdown Configuration）格式的 rules 文件：
 * - 文件存放在 `.cursor/rules/` 目录
 * - 使用 YAML front-matter（alwaysApply / description / globs）
 * - agent 模式下必须 alwaysApply: true 才能保证 100% 注入
 *
 * 策略（基于社区测试和官方文档）：
 * 1. 拆分为多个小文件（<100行），避免 "lost in the middle" 效应
 * 2. 每个文件都设 alwaysApply: true（agent 模式下无此设置 = 0% 遵循率）
 * 3. 规则措辞具体、命令式，避免模糊表述
 *
 * 生成文件：
 * - .cursor/rules/gapa-rules.mdc — GAPA 完整评估规则
 * - .cursor/rules/gapa-context-load.mdc — 任务开始前指引
 * - .cursor/rules/gapa-evaluation.mdc — 任务完成后评估（强命令式）
 *
 * @module lib/adapters/cursor-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import { replacePlaceholders } from '../core/template-engine.mjs'

/** 中英文 MDC 文件的 description */
const I18N = {
  zh: {
    rulesDesc: 'GAPA 自我学习系统的完整评估规则和文件更新策略',
    contextLoadDesc: '实质性任务开始前必须读取历史记录和相关 skill',
    evaluationDesc: '实质性任务完成后必须执行 GAPA 评估，不可跳过',
  },
  en: {
    rulesDesc: 'Complete evaluation rules and file update strategy for GAPA self-learning system',
    contextLoadDesc: 'Must read history records and relevant skills before substantive tasks',
    evaluationDesc: 'Must execute GAPA evaluation after substantive tasks, non-skippable',
  },
}

export default class CursorAdapter extends IDEAdapter {
  get name() { return 'cursor' }
  get formatVersion() { return '2.0' }
  get configDir() { return '.cursor' }
  get supportsHooks() { return false }

  /**
   * 检测当前项目是否已安装 Cursor 的配置。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.pathExists(projectRoot, '.cursor/rules/')
  }

  /**
   * 生成 Cursor 的全部 MDC 规则文件。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { gapaDir, templates, lang } = ctx
    const vars = { gapaDir }
    const i18n = I18N[lang] || I18N.zh

    return [
      this._buildRulesFile(templates.gapaRules, vars, i18n),
      this._buildContextLoadFile(templates.contextLoadPrompt, vars, i18n),
      this._buildEvaluationFile(templates.evaluationPrompt, vars, i18n),
    ]
  }

  /**
   * 生成降级行为指引文件（与 generateSteering 相同）。
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateFallbackSteering(ctx) {
    return this.generateSteering(ctx)
  }

  /**
   * 获取 Cursor 已安装的 GAPA 文件列表。
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.cursor/rules/gapa-rules.mdc', label: 'GAPA Rules (MDC)' },
      { relativePath: '.cursor/rules/gapa-context-load.mdc', label: 'GAPA Context Load (MDC)' },
      { relativePath: '.cursor/rules/gapa-evaluation.mdc', label: 'GAPA Evaluation (MDC)' },
    ]

    return files.map((f) => ({
      ...f,
      exists: this.pathExists(projectRoot, f.relativePath),
    }))
  }

  // ─── Internal helpers ───

  /**
   * 构建 GAPA 规则 MDC 文件。
   */
  _buildRulesFile(gapaRulesTemplate, vars, i18n) {
    const content = replacePlaceholders(gapaRulesTemplate, vars).trim()
    const mdc = this._wrapMdc(i18n.rulesDesc, content)

    return {
      relativePath: '.cursor/rules/gapa-rules.mdc',
      content: mdc,
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 构建任务开始前指引 MDC 文件。
   */
  _buildContextLoadFile(contextLoadTemplate, vars, i18n) {
    const content = replacePlaceholders(contextLoadTemplate, vars).trim()
    const mdc = this._wrapMdc(i18n.contextLoadDesc, content)

    return {
      relativePath: '.cursor/rules/gapa-context-load.mdc',
      content: mdc,
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 构建任务完成后评估 MDC 文件。
   */
  _buildEvaluationFile(evaluationTemplate, vars, i18n) {
    const content = replacePlaceholders(evaluationTemplate, vars).trim()
    const mdc = this._wrapMdc(i18n.evaluationDesc, content)

    return {
      relativePath: '.cursor/rules/gapa-evaluation.mdc',
      content: mdc,
      writeStrategy: 'overwrite',
    }
  }

  /**
   * 用 MDC frontmatter 包裹内容。
   * @param {string} description
   * @param {string} body
   * @returns {string}
   */
  _wrapMdc(description, body) {
    return `---\ndescription: "${description}"\nalwaysApply: true\n---\n\n${body}\n`
  }
}
