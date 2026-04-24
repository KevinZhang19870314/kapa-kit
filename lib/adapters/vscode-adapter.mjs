/**
 * VS Code (Copilot) Adapter — VS Code 适配器
 *
 * VS Code Copilot 使用 .github/copilot-instructions.md 文件：
 * - 使用 `<!-- GAPA:START -->` / `<!-- GAPA:END -->` 标记包裹 GAPA 内容
 * - 不支持原生 hook，通过行为指引段落降级实现
 * - copilot-instructions.md 可能已存在用户内容，使用 append-with-markers 策略保留
 *
 * 生成文件：
 * - .github/copilot-instructions.md — GAPA 主规则 + 降级行为指引（标记包裹）
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

export default class VSCodeAdapter extends IDEAdapter {
  get name() { return 'vscode' }
  get formatVersion() { return '1.0' }
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
    ])
  }

  /**
   * 生成 VS Code Copilot steering 文件（copilot-instructions.md，标记包裹）。
   *
   * 内部调用 _buildFallbackContent 获取降级行为指引内容，
   * 然后将 gapaRules 和 fallbackSteering 一起注入 wrapper 模板。
   * 输出内容不含 GAPA 标记（由 fs-helpers 的 append-with-markers 策略添加）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }

    // Load instructions wrapper template
    const wrapper = loadAdapterTemplate('vscode', 'instructions-wrapper.tpl')

    // Prepare core GAPA rules with path placeholders replaced
    const rulesContent = replacePlaceholders(templates.gapaRules, vars)

    // Build fallback steering content (context-load + evaluation prompts)
    const fallbackContent = this._buildFallbackContent(ctx)

    // Inject both slots into the wrapper
    const fullContent = injectIntoWrapper(wrapper, {
      gapaRules: rulesContent,
      fallbackSteering: fallbackContent,
    })

    // Strip the outer GAPA markers from the template output,
    // since writeWithStrategy('append-with-markers') adds them.
    const gapaContent = this._stripGapaMarkers(fullContent)

    return [
      {
        relativePath: '.github/copilot-instructions.md',
        content: gapaContent,
        writeStrategy: 'append-with-markers',
      },
    ]
  }

  /**
   * 生成降级行为指引文件。
   *
   * 将上下文加载和评估 prompt 嵌入 copilot-instructions.md 行为指引段落，
   * 返回完整的 copilot-instructions.md 文件（与 generateSteering 相同输出）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateFallbackSteering(ctx) {
    // For VS Code, fallback steering is the same as generateSteering
    // since the fallback content is always embedded in copilot-instructions.md
    return this.generateSteering(ctx)
  }

  /**
   * 获取 VS Code Copilot 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.github/copilot-instructions.md', label: 'GAPA Framework (copilot-instructions.md)' },
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

  /**
   * 从模板输出中提取 GAPA 标记之间的内容。
   * 模板自带标记，但 writeWithStrategy('append-with-markers') 会再次添加，
   * 因此需要剥离模板中的标记，只保留内部内容。
   *
   * @param {string} content — 包含 GAPA 标记的完整模板输出
   * @returns {string} — 标记之间的内容（不含标记本身）
   */
  _stripGapaMarkers(content) {
    const startIdx = content.indexOf(GAPA_START_MARKER)
    const endIdx = content.indexOf(GAPA_END_MARKER)

    if (startIdx === -1 || endIdx === -1) {
      // No markers found, return as-is
      return content
    }

    // Extract content between markers (after START marker line, before END marker)
    const afterStart = startIdx + GAPA_START_MARKER.length
    const inner = content.substring(afterStart, endIdx)

    // Remove the template's own version comment line (first non-empty line after marker)
    // e.g. "<!-- 由 gapa-kit 生成，请勿手动编辑此区域 -->"
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

    // Trim leading/trailing blank lines but preserve internal structure
    let result = filtered.join('\n')
    // Remove leading newlines
    result = result.replace(/^\n+/, '')
    // Remove trailing newlines
    result = result.replace(/\n+$/, '')

    return result
  }
}
