/**
 * Windsurf IDE Adapter — Windsurf 适配器
 *
 * Windsurf 使用 YAML front-matter 格式的 rules 文件：
 * - 文件存放在 `.windsurf/rules/` 目录
 * - 使用 YAML front-matter（`trigger: always_on`）
 * - 不支持原生 hook，通过行为指引段落降级实现
 *
 * 生成文件：
 * - .windsurf/rules/gapa-framework.md — GAPA 主规则 + 降级行为指引
 *
 * @module lib/adapters/windsurf-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'

export default class WindsurfAdapter extends IDEAdapter {
  get name() { return 'windsurf' }
  get formatVersion() { return '1.0' }
  get configDir() { return '.windsurf' }
  get supportsHooks() { return false }

  /**
   * 检测当前项目是否已安装 Windsurf 的配置。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.anyPathExists(projectRoot, ['.windsurfrules', '.windsurf/rules/'])
  }

  /**
   * 生成 Windsurf steering 文件（YAML front-matter 格式）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }

    // Load Windsurf rules wrapper template
    const rulesWrapper = loadAdapterTemplate('windsurf', 'rules-wrapper.tpl')

    // Prepare core GAPA rules with path placeholders replaced
    const rulesContent = replacePlaceholders(templates.gapaRules, vars)

    // Build fallback steering content (context-load + evaluation prompts)
    const fallbackContent = this._buildFallbackContent(ctx)

    // Inject both slots into the wrapper
    const fileContent = injectIntoWrapper(rulesWrapper, {
      gapaRules: rulesContent,
      fallbackSteering: fallbackContent,
    })

    return [
      {
        relativePath: '.windsurf/rules/gapa-framework.md',
        content: fileContent,
        writeStrategy: 'overwrite',
      },
    ]
  }

  /**
   * 生成降级行为指引文件。
   *
   * 将上下文加载和评估 prompt 嵌入规则文件行为指引段落，
   * 返回完整的规则文件（与 generateSteering 相同输出）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateFallbackSteering(ctx) {
    return this.generateSteering(ctx)
  }

  /**
   * 获取 Windsurf 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.windsurf/rules/gapa-framework.md', label: 'GAPA Framework (Windsurf rule)' },
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
