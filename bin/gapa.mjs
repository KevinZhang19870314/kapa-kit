#!/usr/bin/env node

/**
 * GAPA CLI 入口 — 跨 IDE 通用版本
 *
 * 支持命令：init / update / status / help / version
 * 支持参数：--target <ide>（可多次指定）、--lang <zh|en>（默认 zh）
 *
 * @module bin/gapa
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createInterface } from 'node:readline'

import { parseArgs } from '../lib/utils/cli-parser.mjs'
import { createAdapter, getSupportedIDEs, detectIDEs } from '../lib/adapters/factory.mjs'
import { loadTemplates } from '../lib/core/template-engine.mjs'
import { createTranslator } from '../lib/core/i18n.mjs'
import {
  createGapaConfig,
  createGitignore,
  countMemoryEntries,
  GAPA_DIR,
  SHARED_FILES,
} from '../lib/core/shared-data.mjs'
import { writeWithStrategy } from '../lib/utils/fs-helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'))
const VERSION = PKG.version

// ─── Helpers ───

function printHelp() {
  console.log(`
  gapa v${VERSION} — Generalized Action and Prompt Adaptation (Cross-IDE)

  Usage:
    gapa init   [--target <ide>] [--lang <zh|en>]   Install GAPA into a project
    gapa update [--target <ide>]                     Update framework files (preserves memory & preferences)
    gapa status [--target <ide>]                     Check GAPA installation status
    gapa version                                     Show version
    gapa help                                        Show this help

  Options:
    --target <ide>   Target IDE (${getSupportedIDEs().join(', ')}). Can be specified multiple times.
    --lang <lang>    Language (zh, en). Default: zh.

  Examples:
    npx gapa-kit init
    npx gapa-kit init --target kiro --target cursor
    npx gapa-kit init --target claude-code --lang en
    npx gapa-kit update
    npx gapa-kit status
  `)
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close()
      res(answer.trim().toLowerCase())
    })
  })
}


/**
 * 交互式选择 IDE（单选或多选）。
 * @param {string[]} options — 可选 IDE 列表
 * @param {Function} t — 翻译函数
 * @returns {Promise<string[]>}
 */
async function interactiveSelectIDEs(options, t) {
  console.log(`\n${t('ide.selectPrompt')}`)
  options.forEach((ide, i) => console.log(`  ${i + 1}. ${ide}`))
  const answer = await ask('\n> ')
  const indices = answer.split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n))
  const selected = indices
    .map((i) => options[i - 1])
    .filter(Boolean)
  return selected.length > 0 ? selected : []
}

/**
 * 解析目标 IDE 列表：优先使用 --target，否则自动检测/交互选择。
 * @param {string[]} targets — CLI 指定的 targets
 * @param {string} projectRoot
 * @param {Function} t — 翻译函数
 * @returns {Promise<string[]>}
 */
async function resolveTargets(targets, projectRoot, t) {
  if (targets.length > 0) return targets

  // 非交互式终端必须指定 --target
  if (!process.stdin.isTTY) {
    console.error(t('error.targetRequired'))
    process.exit(1)
  }

  const detected = await detectIDEs(projectRoot)

  if (detected.length === 0) {
    console.log(t('ide.noneDetected'))
    const selected = await interactiveSelectIDEs(getSupportedIDEs(), t)
    if (selected.length === 0) {
      console.log(t('init.cancelled'))
      process.exit(0)
    }
    return selected
  }

  if (detected.length === 1) {
    console.log(t('ide.detected', detected))
    return detected
  }

  // 多个 IDE 检测到 → 交互式多选
  console.log(t('ide.detected', detected))
  const selected = await interactiveSelectIDEs(detected, t)
  if (selected.length === 0) {
    console.log(t('init.cancelled'))
    process.exit(0)
  }
  return selected
}

// ─── Commands ───

/**
 * init 命令：为目标 IDE 安装 GAPA。
 */
async function cmdInit(projectRoot, targets, lang) {
  const t = createTranslator(lang)
  console.log(t('init.start', VERSION, resolve(projectRoot)))

  const resolvedTargets = await resolveTargets(targets, projectRoot, t)
  const templates = loadTemplates(lang)
  const gapaAbsDir = resolve(projectRoot, GAPA_DIR)
  const adapterInfos = {}
  let sharedFilesWritten = false

  for (const ideName of resolvedTargets) {
    const adapter = await createAdapter(ideName)
    const ctx = {
      projectRoot,
      lang,
      gapaDir: GAPA_DIR,
      templates,
      isUpdate: false,
    }

    // Generate steering files
    const steeringFiles = adapter.generateSteering(ctx)

    // Generate hooks or fallback steering
    const extraFiles = adapter.supportsHooks
      ? adapter.generateHooks(ctx)
      : adapter.generateFallbackSteering(ctx)

    const allFiles = [...steeringFiles, ...extraFiles]

    // Write IDE-specific files
    for (const file of allFiles) {
      const absPath = resolve(projectRoot, file.relativePath)
      const result = writeWithStrategy(absPath, file.content, file.writeStrategy, { version: VERSION })
      logFileResult(result, file.relativePath, t)
    }

    adapterInfos[ideName] = { formatVersion: adapter.formatVersion }

    // Write shared .gapa/ files (only once)
    if (!sharedFilesWritten) {
      writeSharedFiles(projectRoot, lang, templates, t)
      sharedFilesWritten = true
    }
  }

  // Write .gaparc.json
  const config = createGapaConfig({ version: VERSION, lang, adapters: adapterInfos })
  const configPath = resolve(gapaAbsDir, SHARED_FILES.config)
  const configResult = writeWithStrategy(configPath, JSON.stringify(config, null, 2) + '\n', 'overwrite', { version: VERSION })
  logFileResult(configResult, `${GAPA_DIR}/${SHARED_FILES.config}`, t)

  console.log(`\n${t('init.done')}`)
  console.log(t('init.nextSteps'))
  console.log()
}


/**
 * 写入 .gapa/ 共享文件（memory.md, preferences.md, skills/, .gitignore）。
 */
function writeSharedFiles(projectRoot, lang, templates, t) {
  const gapaAbsDir = resolve(projectRoot, GAPA_DIR)

  // memory.md — skip if exists (preserve user data)
  const memoryPath = resolve(gapaAbsDir, SHARED_FILES.memory)
  const memResult = writeWithStrategy(memoryPath, templates.memoryTemplate, 'skip-if-exists')
  logFileResult(memResult, `${GAPA_DIR}/${SHARED_FILES.memory}`, t)

  // preferences.md — skip if exists (preserve user data)
  const prefsPath = resolve(gapaAbsDir, SHARED_FILES.preferences)
  const prefsResult = writeWithStrategy(prefsPath, templates.preferencesTemplate, 'skip-if-exists')
  logFileResult(prefsResult, `${GAPA_DIR}/${SHARED_FILES.preferences}`, t)

  // skills/_example.md — skip if exists
  const skillPath = resolve(gapaAbsDir, SHARED_FILES.skillExample)
  const skillResult = writeWithStrategy(skillPath, templates.skillExampleTemplate, 'skip-if-exists')
  logFileResult(skillResult, `${GAPA_DIR}/${SHARED_FILES.skillExample}`, t)

  // .gitignore
  const gitignorePath = resolve(gapaAbsDir, SHARED_FILES.gitignore)
  const gitignoreResult = writeWithStrategy(gitignorePath, createGitignore(), 'overwrite')
  logFileResult(gitignoreResult, `${GAPA_DIR}/${SHARED_FILES.gitignore}`, t)
}

/**
 * update 命令：更新框架文件，保留用户数据。
 */
async function cmdUpdate(projectRoot, targets, langOverride) {
  const gapaAbsDir = resolve(projectRoot, GAPA_DIR)
  const configPath = resolve(gapaAbsDir, SHARED_FILES.config)

  // Read .gaparc.json
  if (!existsSync(configPath)) {
    // Use override lang or default for error message
    const t = createTranslator(langOverride || 'zh')
    console.error(t('update.notInstalled'))
    process.exit(1)
  }

  let gapaConfig
  try {
    gapaConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    const t = createTranslator(langOverride || 'zh')
    console.error(t('error.gaparcCorrupt'))
    process.exit(1)
  }

  const lang = gapaConfig.lang || 'zh'
  const t = createTranslator(lang)
  console.log(t('update.start', VERSION, resolve(projectRoot)))

  // Determine which adapters to update
  const installedAdapters = gapaConfig.installedAdapters || {}
  let resolvedTargets = targets.length > 0
    ? targets
    : Object.keys(installedAdapters)

  if (resolvedTargets.length === 0) {
    console.error(t('update.notInstalled'))
    process.exit(1)
  }

  const templates = loadTemplates(lang)

  for (const ideName of resolvedTargets) {
    const adapter = await createAdapter(ideName)
    const ctx = {
      projectRoot,
      lang,
      gapaDir: GAPA_DIR,
      templates,
      isUpdate: true,
    }

    // Regenerate steering files
    const steeringFiles = adapter.generateSteering(ctx)
    const extraFiles = adapter.supportsHooks
      ? adapter.generateHooks(ctx)
      : adapter.generateFallbackSteering(ctx)

    const allFiles = [...steeringFiles, ...extraFiles]

    for (const file of allFiles) {
      const absPath = resolve(projectRoot, file.relativePath)
      const result = writeWithStrategy(absPath, file.content, file.writeStrategy, { version: VERSION })
      logFileResult(result, file.relativePath, t)
    }

    // Update adapter info in config
    const now = new Date().toISOString()
    if (!gapaConfig.installedAdapters) gapaConfig.installedAdapters = {}
    const existing = gapaConfig.installedAdapters[ideName] || {}
    gapaConfig.installedAdapters[ideName] = {
      formatVersion: adapter.formatVersion,
      installedAt: existing.installedAt || now,
      updatedAt: now,
    }
  }

  // Regenerate shared framework files (skip memory.md and preferences.md)
  // Skill example — overwrite (framework file)
  const skillPath = resolve(gapaAbsDir, SHARED_FILES.skillExample)
  const skillResult = writeWithStrategy(skillPath, templates.skillExampleTemplate, 'overwrite')
  logFileResult(skillResult, `${GAPA_DIR}/${SHARED_FILES.skillExample}`, t)

  // .gitignore — overwrite
  const gitignorePath = resolve(gapaAbsDir, SHARED_FILES.gitignore)
  const gitignoreResult = writeWithStrategy(gitignorePath, createGitignore(), 'overwrite')
  logFileResult(gitignoreResult, `${GAPA_DIR}/${SHARED_FILES.gitignore}`, t)

  // Skip memory.md and preferences.md (preserve user data)
  const memoryRel = `${GAPA_DIR}/${SHARED_FILES.memory}`
  console.log(t('file.skipped', memoryRel))
  const prefsRel = `${GAPA_DIR}/${SHARED_FILES.preferences}`
  console.log(t('file.skipped', prefsRel))

  // Update .gaparc.json
  gapaConfig.version = VERSION
  const configResult = writeWithStrategy(configPath, JSON.stringify(gapaConfig, null, 2) + '\n', 'overwrite', { version: VERSION })
  logFileResult(configResult, `${GAPA_DIR}/${SHARED_FILES.config}`, t)

  console.log(t('update.done'))
}


/**
 * status 命令：检查 GAPA 安装状态。
 */
async function cmdStatus(projectRoot, targets, langOverride) {
  const gapaAbsDir = resolve(projectRoot, GAPA_DIR)
  const configPath = resolve(gapaAbsDir, SHARED_FILES.config)

  let gapaConfig = null
  let lang = langOverride || 'zh'

  if (existsSync(configPath)) {
    try {
      gapaConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
      lang = gapaConfig.lang || lang
    } catch {
      // corrupt config, continue with defaults
    }
  }

  const t = createTranslator(lang)
  console.log(t('status.title', VERSION))

  if (!gapaConfig) {
    console.error(t('update.notInstalled'))
    process.exit(1)
  }

  const installedAdapters = gapaConfig.installedAdapters || {}
  const resolvedTargets = targets.length > 0
    ? targets
    : Object.keys(installedAdapters)

  let allGood = true

  // Check shared .gapa/ files
  const sharedChecks = [
    { path: `${GAPA_DIR}/${SHARED_FILES.memory}`, label: 'Memory' },
    { path: `${GAPA_DIR}/${SHARED_FILES.preferences}`, label: 'Preferences' },
    { path: `${GAPA_DIR}/${SHARED_FILES.config}`, label: 'Config (.gaparc.json)' },
  ]

  for (const check of sharedChecks) {
    const exists = existsSync(resolve(projectRoot, check.path))
    if (!exists) allGood = false
    const icon = exists ? '✅' : '❌'
    console.log(`  ${icon} ${check.label} (${check.path})`)
  }

  // Check per-IDE files
  for (const ideName of resolvedTargets) {
    try {
      const adapter = await createAdapter(ideName)
      const files = adapter.getInstalledFiles(projectRoot)
      console.log(`\n  📦 ${ideName}:`)
      for (const f of files) {
        if (!f.exists) allGood = false
        const icon = f.exists ? '✅' : '❌'
        console.log(`    ${icon} ${f.label} (${f.relativePath})`)
      }
    } catch {
      console.log(`\n  ⚠️  ${ideName}: adapter load failed`)
      allGood = false
    }
  }

  // Count skills
  const skillsDir = resolve(gapaAbsDir, SHARED_FILES.skillsDir)
  let skillCount = 0
  if (existsSync(skillsDir)) {
    skillCount = readdirSync(skillsDir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .length
  }
  console.log(`\n${t('status.skills', skillCount)}`)

  // Count memory entries
  const memoryPath = resolve(gapaAbsDir, SHARED_FILES.memory)
  if (existsSync(memoryPath)) {
    const content = readFileSync(memoryPath, 'utf-8')
    const entries = countMemoryEntries(content)
    console.log(t('status.memoryEntries', entries))
  }

  console.log(allGood ? `\n${t('status.installed')}` : `\n${t('status.incomplete')}`)
}

/**
 * 日志输出文件操作结果。
 */
function logFileResult(result, relativePath, t) {
  switch (result.action) {
    case 'created':
      console.log(t('file.created', relativePath))
      break
    case 'overwritten':
    case 'replaced':
      console.log(t('file.overwritten', relativePath))
      break
    case 'skipped':
      console.log(t('file.skipped', relativePath))
      break
    case 'appended':
      console.log(t('file.created', relativePath))
      break
  }
}

// ─── Main ───

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2))
    const projectRoot = resolve('.')

    switch (parsed.command) {
      case 'init':
        await cmdInit(projectRoot, parsed.targets, parsed.lang)
        break
      case 'update':
        await cmdUpdate(projectRoot, parsed.targets, parsed.lang)
        break
      case 'status':
        await cmdStatus(projectRoot, parsed.targets, parsed.lang)
        break
      case 'version':
        console.log(`gapa v${VERSION}`)
        break
      case 'help':
      default:
        printHelp()
        break
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`)
    process.exit(1)
  }
}

main()
