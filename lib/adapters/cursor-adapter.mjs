/**
 * Cursor IDE Adapter — Cursor 适配器
 *
 * Cursor 使用 MDC（Markdown with Components）格式的 rules 文件：
 * - 文件存放在 `.cursor/rules/` 目录
 * - 使用 YAML front-matter（`alwaysApply: true`）
 * - 不支持原生 hook，通过行为指引段落降级实现
 *
 * 生成文件：
 * - .cursor/rules/gapa-framework.mdc — GAPA 主规则 + 降级行为指引
 *
 * @module lib/adapters/cursor-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'

export default class CursorAdapter extends IDEAdapter {
  get name() { return 'cursor' }
  get formatVersion() { return '1.0' }
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
   * 生成 Cursor steering 文件（MDC 格式）。
   *
   * 内部调用 generateFallbackSteering 获取降级行为指引内容，
   * 然后将 gapaRules 和 fallbackSteering 一起注入 MDC wrapper。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }

    // Load MDC wrapper template
    const mdcWrapper = loadAdapterTemplate('cursor', 'mdc-wrapper.tpl')

    // Prepare core GAPA rules with path placeholders replaced
    const rulesContent = replacePlaceholders(templates.gapaRules, vars)

    // Build fallback steering content (context-load + evaluation prompts)
    const fallbackContent = this._buildFallbackContent(ctx)

    // Inject both slots into the MDC wrapper
    const mdcContent = injectIntoWrapper(mdcWrapper, {
      gapaRules: rulesContent,
      fallbackSteering: fallbackContent,
    })

    return [
      {
        relativePath: '.cursor/rules/gapa-framework.mdc',
        content: mdcContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 生成降级行为指引文件。
   *
   * 将上下文加载和评估 prompt 嵌入 MDC 行为指引段落，
   * 返回完整的 MDC 文件（与 generateSteering 相同输出）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateFallbackSteering(ctx) {
    // For Cursor, fallback steering is the same as generateSteering
    // since the fallback content is always embedded in the MDC file
    return this.generateSteering(ctx)
  }

  /**
   * 获取 Cursor 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.cursor/rules/gapa-framework.mdc', label: 'GAPA Framework (MDC rule)' },
    ]

    return files.map((f) => ({
      ...f,
      exists: this.pathExists(projectRoot, f.relativePath),
    }))
  }

  // ─── Internal helpers ───

  /**
   * 构建降级行为指引内容（上下文加载 + 评估 prompt）。
   *
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
}
