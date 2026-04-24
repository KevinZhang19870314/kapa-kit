/**
 * TRAE IDE Adapter — TRAE（字节跳动）适配器
 *
 * TRAE 使用两种文件机制：
 * - `.trae/rules/` — 纯 Markdown 全局规则（所有对话自动携带）
 * - `.trae/skills/gapa/` — 带 YAML front-matter 的 SKILL.md（Model-invoked 技能）
 *
 * 不支持原生 hook，通过行为指引段落降级实现。
 *
 * 生成文件：
 * - .trae/rules/gapa-framework.md — GAPA 主规则 + 降级行为指引
 * - .trae/skills/gapa/SKILL.md — GAPA 评估技能（带 YAML front-matter）
 *
 * @module lib/adapters/trae-adapter
 */

import { IDEAdapter } from './base-adapter.mjs'
import {
  replacePlaceholders,
  injectIntoWrapper,
  loadAdapterTemplate,
} from '../core/template-engine.mjs'

export default class TraeAdapter extends IDEAdapter {
  get name() { return 'trae' }
  get formatVersion() { return '1.0' }
  get configDir() { return '.trae' }
  get supportsHooks() { return false }

  /**
   * 检测当前项目是否已安装 TRAE 的配置。
   * @param {string} projectRoot
   * @returns {boolean}
   */
  detect(projectRoot) {
    return this.anyPathExists(projectRoot, ['.trae/rules/', '.trae/skills/'])
  }

  /**
   * 生成 TRAE steering 文件。
   *
   * 1. `.trae/rules/gapa-framework.md` — 纯 Markdown 全局规则（使用 rules-wrapper.tpl）
   * 2. `.trae/skills/gapa/SKILL.md` — 带 YAML front-matter 的技能文件（使用 skill-wrapper.tpl）
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {import('./base-adapter.mjs').FileOutput[]}
   */
  generateSteering(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }

    // ── 1. Rules file (pure Markdown) ──
    const rulesWrapper = loadAdapterTemplate('trae', 'rules-wrapper.tpl')
    const rulesContent = replacePlaceholders(templates.gapaRules, vars)
    const fallbackContent = this._buildFallbackContent(ctx)

    const rulesFile = injectIntoWrapper(rulesWrapper, {
      gapaRules: rulesContent,
      fallbackSteering: fallbackContent,
    })

    // ── 2. SKILL.md (YAML front-matter) ──
    const skillWrapper = loadAdapterTemplate('trae', 'skill-wrapper.tpl')
    const skillContent = this._buildSkillContent(ctx)

    const skillFile = injectIntoWrapper(skillWrapper, {
      skillName: 'gapa-evaluation',
      skillDescription: this._getSkillDescription(ctx),
      skillContent: skillContent,
    })

    return [
      {
        relativePath: '.trae/rules/gapa-framework.md',
        content: rulesFile,
        writeStrategy: 'overwrite',
      },
      {
        relativePath: '.trae/skills/gapa/SKILL.md',
        content: skillFile,
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
   * 获取 TRAE 已安装的 GAPA 文件列表。
   *
   * @param {string} projectRoot
   * @returns {import('./base-adapter.mjs').InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    const files = [
      { relativePath: '.trae/rules/gapa-framework.md', label: 'GAPA Framework (TRAE rule)' },
      { relativePath: '.trae/skills/gapa/SKILL.md', label: 'GAPA Evaluation Skill (TRAE skill)' },
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
   * 构建 SKILL.md 的主体内容（GAPA 评估工作流描述）。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {string}
   */
  _buildSkillContent(ctx) {
    const { gapaDir, templates } = ctx
    const vars = { gapaDir }
    const evaluationPrompt = replacePlaceholders(templates.evaluationPrompt, vars).trim()

    const lines = [
      '# GAPA 评估技能',
      '',
      '## 触发场景',
      '- 当 Agent 完成实质性编码任务后',
      '',
      '## 工作流',
      `1. 读取 ${gapaDir}/memory.md 获取历史评估记录`,
      `2. 读取 ${gapaDir}/preferences.md 获取用户偏好`,
      '3. 对本次任务执行评估',
      `4. 将评估结果追加到 ${gapaDir}/memory.md`,
      '',
      '## 评估指引',
      evaluationPrompt,
    ]

    return lines.join('\n')
  }

  /**
   * 获取 SKILL.md 的 description 字段值。
   *
   * @param {import('./base-adapter.mjs').GenerateContext} ctx
   * @returns {string}
   */
  _getSkillDescription(ctx) {
    return 'GAPA AI Agent 自我学习评估技能，在任务完成后自动触发评估流程'
  }
}
