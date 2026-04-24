/**
 * Base Adapter — IDEAdapter 基类
 *
 * 定义所有 IDE 适配器必须实现的接口方法。
 * 各适配器继承此基类并实现具体逻辑。
 *
 * 接口方法：
 * - generateSteering(ctx)         — 生成 steering/rules 文件
 * - generateHooks(ctx)            — 生成 hook 文件（仅 supportsHooks=true）
 * - generateFallbackSteering(ctx) — 生成降级 steering（仅 supportsHooks=false）
 * - detect(projectRoot)           — 检测项目是否已安装该 IDE 配置
 * - getInstalledFiles(projectRoot) — 获取已安装的 GAPA 文件列表
 *
 * @module lib/adapters/base-adapter
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * @typedef {object} GenerateContext
 * @property {string} projectRoot — 项目根目录绝对路径
 * @property {string} lang — 目标语言 ('zh' | 'en')
 * @property {string} gapaDir — 共享数据目录路径（默认 '.gapa'）
 * @property {import('../core/template-engine.mjs').CoreTemplates} templates — 核心模板内容
 * @property {boolean} isUpdate — 是否为 update 模式
 */

/**
 * @typedef {object} FileOutput
 * @property {string} relativePath — 相对于项目根的文件路径
 * @property {string} content — 文件内容
 * @property {'create' | 'overwrite' | 'append-with-markers' | 'skip-if-exists'} writeStrategy
 */

/**
 * @typedef {object} InstalledFile
 * @property {string} relativePath — 相对于项目根的文件路径
 * @property {boolean} exists — 文件是否存在
 * @property {string} label — 文件描述标签
 */

export class IDEAdapter {
  /**
   * IDE 标识名（如 'kiro'、'cursor'、'claude-code'）。
   * @type {string}
   * @readonly
   */
  get name() {
    throw new Error('IDEAdapter.name must be implemented by subclass')
  }

  /**
   * 适配器格式版本号。
   * 用于 update 时检测格式变化并触发迁移。
   * @type {string}
   * @readonly
   */
  get formatVersion() {
    throw new Error('IDEAdapter.formatVersion must be implemented by subclass')
  }

  /**
   * IDE 配置目录路径（相对于项目根）。
   * 如 '.kiro'、'.cursor'、'.github' 等。
   * @type {string}
   * @readonly
   */
  get configDir() {
    throw new Error('IDEAdapter.configDir must be implemented by subclass')
  }

  /**
   * 是否支持原生 hook 机制。
   * true: 调用 generateHooks()
   * false: 调用 generateFallbackSteering()
   * @type {boolean}
   * @readonly
   */
  get supportsHooks() {
    throw new Error('IDEAdapter.supportsHooks must be implemented by subclass')
  }

  /**
   * 生成 steering/rules 文件。
   *
   * @param {GenerateContext} ctx
   * @returns {FileOutput[]}
   */
  generateSteering(ctx) {
    throw new Error('IDEAdapter.generateSteering() must be implemented by subclass')
  }

  /**
   * 生成 hook 文件。
   * 仅在 supportsHooks === true 时调用。
   *
   * @param {GenerateContext} ctx
   * @returns {FileOutput[]}
   */
  generateHooks(ctx) {
    if (!this.supportsHooks) {
      throw new Error(
        `${this.name} adapter does not support hooks. Use generateFallbackSteering() instead.`
      )
    }
    throw new Error('IDEAdapter.generateHooks() must be implemented by subclass')
  }

  /**
   * 生成降级 steering 文件。
   * 将 hook 逻辑嵌入 rules/steering 文件的行为指引段落。
   * 仅在 supportsHooks === false 时调用。
   *
   * @param {GenerateContext} ctx
   * @returns {FileOutput[]}
   */
  generateFallbackSteering(ctx) {
    if (this.supportsHooks) {
      throw new Error(
        `${this.name} adapter supports native hooks. Use generateHooks() instead.`
      )
    }
    throw new Error('IDEAdapter.generateFallbackSteering() must be implemented by subclass')
  }

  /**
   * 检测当前项目是否已安装该 IDE 的配置。
   * 使用精确路径检测，而非仅检测顶层目录。
   *
   * @param {string} projectRoot — 项目根目录绝对路径
   * @returns {boolean}
   */
  detect(projectRoot) {
    throw new Error('IDEAdapter.detect() must be implemented by subclass')
  }

  /**
   * 获取该 IDE 已安装的 GAPA 文件列表。
   * 用于 status 命令。
   *
   * @param {string} projectRoot — 项目根目录绝对路径
   * @returns {InstalledFile[]}
   */
  getInstalledFiles(projectRoot) {
    throw new Error('IDEAdapter.getInstalledFiles() must be implemented by subclass')
  }

  // ─── Helper methods for subclasses ───

  /**
   * 检查项目中指定路径是否存在（目录或文件）。
   *
   * @param {string} projectRoot
   * @param {string} relativePath
   * @returns {boolean}
   */
  pathExists(projectRoot, relativePath) {
    return existsSync(resolve(projectRoot, relativePath))
  }

  /**
   * 检查项目中指定路径列表中是否有任一存在。
   *
   * @param {string} projectRoot
   * @param {string[]} relativePaths
   * @returns {boolean}
   */
  anyPathExists(projectRoot, relativePaths) {
    return relativePaths.some((p) => this.pathExists(projectRoot, p))
  }
}
