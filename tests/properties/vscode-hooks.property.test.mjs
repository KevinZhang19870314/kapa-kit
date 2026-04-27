/**
 * Property tests for VSCode adapter hooks implementation.
 *
 * Feature: vscode-hooks-support
 *
 * Tests cover:
 * - Property 1: generateHooks 文件完整性
 * - Property 2: hooks.json 结构有效性
 * - Property 3: 模板占位符完全替换
 * - Property 4: generateSteering 简化输出
 * - Property 5: Stop hook 条件输出
 * - Property 6: UserPromptSubmit hook 输出有效性
 * - Property 7: getInstalledFiles 结构一致性
 */

import { describe, it, afterEach } from 'vitest'
import fc from 'fast-check'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import VSCodeAdapter from '../../lib/adapters/vscode-adapter.mjs'

const adapter = new VSCodeAdapter()

/** Generator for safe gapaDir values (dot-prefixed, alphanumeric with hyphens/underscores) */
const gapaDirArb = fc.constantFrom('.gapa', '.my-gapa', '.test_dir', '.gapa2', '.data', '.g', '.abc-def_123')

/** Generator for lang */
const langArb = fc.constantFrom('zh', 'en')

/** Build a valid GenerateContext */
function makeCtx(lang, gapaDir) {
  const templates = loadTemplates(lang)
  return {
    projectRoot: '/tmp/test',
    lang,
    gapaDir,
    templates,
    isUpdate: false,
  }
}

// ─── Property 1 ───

/**
 * Property 1: generateHooks 文件完整性
 *
 * 对任意 lang ∈ {zh, en} 和合法 gapaDir，验证 generateHooks() 返回恰好 3 个文件，
 * 路径分别为 .github/hooks/hooks.json、.github/hooks/gapa-prompt-submit.mjs、
 * .github/hooks/gapa-stop.mjs，且所有 hook 脚本使用 .mjs 扩展名。
 *
 * Feature: vscode-hooks-support, Property 1: generateHooks 文件完整性
 *
 * **Validates: Requirements 2.1, 3.1, 4.1**
 */
describe('Feature: vscode-hooks-support, Property 1: generateHooks 文件完整性', () => {
  it('returns exactly 3 files with correct paths and .mjs extension for any valid GenerateContext', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateHooks(ctx)

        // Must return exactly 3 files
        if (!Array.isArray(files) || files.length !== 3) {
          throw new Error(`Expected exactly 3 files, got ${files?.length}`)
        }

        // Expected paths
        const expectedPaths = [
          '.github/hooks/hooks.json',
          '.github/hooks/gapa-prompt-submit.mjs',
          '.github/hooks/gapa-stop.mjs',
        ]

        const actualPaths = files.map((f) => f.relativePath).sort()
        const sortedExpected = [...expectedPaths].sort()

        for (let i = 0; i < sortedExpected.length; i++) {
          if (actualPaths[i] !== sortedExpected[i]) {
            throw new Error(
              `Expected paths ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(actualPaths)}`
            )
          }
        }

        // All hook script files (non-JSON) must use .mjs extension
        for (const f of files) {
          if (f.relativePath !== '.github/hooks/hooks.json' && !f.relativePath.endsWith('.mjs')) {
            throw new Error(`Hook script ${f.relativePath} does not use .mjs extension`)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ─── Property 2 ───

/**
 * Property 2: hooks.json 结构有效性
 *
 * 对任意 lang ∈ {zh, en} 和合法 gapaDir，验证生成的 hooks.json 解析后满足：
 * 无 version 字段，包含 hooks 对象，hooks 对象包含 UserPromptSubmit 和 Stop 两个
 * PascalCase 事件名，每个事件对应一个非空数组，数组中每个条目包含 type === "command"、
 * 以 node .github/hooks/ 开头的 command 字符串、以及 0 < timeout <= 10 的数值。
 * hooks.json 结构与语言无关（zh 和 en 产生相同结构）。
 *
 * Feature: vscode-hooks-support, Property 2: hooks.json 结构有效性
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 8.5, 10.1, 10.2, 10.3**
 */
describe('Feature: vscode-hooks-support, Property 2: hooks.json 结构有效性', () => {
  it('hooks.json has valid structure: no version, PascalCase events, correct entries for any valid GenerateContext', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateHooks(ctx)

        // Find hooks.json
        const hooksJsonFile = files.find((f) => f.relativePath === '.github/hooks/hooks.json')
        if (!hooksJsonFile) {
          throw new Error('hooks.json not found in generateHooks output')
        }

        // Parse JSON
        const parsed = JSON.parse(hooksJsonFile.content)

        // No version field
        if ('version' in parsed) {
          throw new Error('hooks.json should not have a "version" field')
        }

        // Has hooks object
        if (typeof parsed.hooks !== 'object' || parsed.hooks === null || Array.isArray(parsed.hooks)) {
          throw new Error('hooks.json must have a "hooks" object')
        }

        // PascalCase event names: UserPromptSubmit and Stop
        const expectedEvents = ['UserPromptSubmit', 'Stop']
        for (const eventName of expectedEvents) {
          if (!(eventName in parsed.hooks)) {
            throw new Error(`hooks.json missing PascalCase event "${eventName}"`)
          }

          const entries = parsed.hooks[eventName]

          // Each event maps to a non-empty array
          if (!Array.isArray(entries) || entries.length === 0) {
            throw new Error(`hooks.hooks.${eventName} must be a non-empty array`)
          }

          // Validate each entry
          for (const entry of entries) {
            // type === "command"
            if (entry.type !== 'command') {
              throw new Error(`Entry in ${eventName} must have type === "command", got "${entry.type}"`)
            }

            // command is a string starting with "node .github/hooks/"
            if (typeof entry.command !== 'string' || !entry.command.startsWith('node .github/hooks/')) {
              throw new Error(
                `Entry in ${eventName} must have command starting with "node .github/hooks/", got "${entry.command}"`
              )
            }

            // 0 < timeout <= 10
            if (typeof entry.timeout !== 'number' || entry.timeout <= 0 || entry.timeout > 10) {
              throw new Error(
                `Entry in ${eventName} must have 0 < timeout <= 10, got ${entry.timeout}`
              )
            }
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('hooks.json is language-independent (same structure for zh and en)', () => {
    fc.assert(
      fc.property(gapaDirArb, (gapaDir) => {
        const ctxZh = makeCtx('zh', gapaDir)
        const ctxEn = makeCtx('en', gapaDir)

        const filesZh = adapter.generateHooks(ctxZh)
        const filesEn = adapter.generateHooks(ctxEn)

        const hooksJsonZh = filesZh.find((f) => f.relativePath === '.github/hooks/hooks.json')
        const hooksJsonEn = filesEn.find((f) => f.relativePath === '.github/hooks/hooks.json')

        if (!hooksJsonZh || !hooksJsonEn) {
          throw new Error('hooks.json not found in generateHooks output')
        }

        // Content should be identical regardless of language
        if (hooksJsonZh.content !== hooksJsonEn.content) {
          throw new Error('hooks.json should be language-independent but differs between zh and en')
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ─── Property 3 ───

/**
 * Property 3: 模板占位符完全替换
 *
 * 对任意 lang ∈ {zh, en} 和合法 gapaDir，验证 generateHooks(ctx) 和 generateSteering(ctx)
 * 所有输出文件内容中不包含 {{...}} 模式的未替换占位符。
 *
 * Feature: vscode-hooks-support, Property 3: 模板占位符完全替换
 *
 * **Validates: Requirements 3.3, 4.5**
 */
describe('Feature: vscode-hooks-support, Property 3: 模板占位符完全替换', () => {
  it('all output files from generateHooks() and generateSteering() contain no unreplaced {{...}} placeholders', () => {
    const unreplacedPattern = /\{\{[^}]+\}\}/

    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)

        // Check generateHooks output
        const hookFiles = adapter.generateHooks(ctx)
        for (const file of hookFiles) {
          if (unreplacedPattern.test(file.content)) {
            const match = file.content.match(unreplacedPattern)
            throw new Error(
              `generateHooks() output file "${file.relativePath}" contains unreplaced placeholder: ${match[0]}`
            )
          }
        }

        // Check generateSteering output
        const steeringFiles = adapter.generateSteering(ctx)
        for (const file of steeringFiles) {
          if (unreplacedPattern.test(file.content)) {
            const match = file.content.match(unreplacedPattern)
            throw new Error(
              `generateSteering() output file "${file.relativePath}" contains unreplaced placeholder: ${match[0]}`
            )
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ─── Property 4 ───

/**
 * Property 4: generateSteering 简化输出
 *
 * 对任意 lang ∈ {zh, en} 和合法 gapaDir，验证 generateSteering(ctx) 返回恰好 4 个文件：
 * copilot-instructions.md（append-with-markers 策略，不含 "任务开始前" 或 "任务完成后" 降级内容）、
 * 3 个 .instructions.md 文件（overwrite 策略）。输出中不包含 .github/hooks/gapa-stop.json。
 *
 * Feature: vscode-hooks-support, Property 4: generateSteering 简化输出
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**
 */
describe('Feature: vscode-hooks-support, Property 4: generateSteering 简化输出', () => {
  it('returns exactly 4 files with correct strategies and no fallback content for any valid GenerateContext', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateSteering(ctx)

        // Must return exactly 4 files
        if (!Array.isArray(files) || files.length !== 4) {
          throw new Error(`Expected exactly 4 files, got ${files?.length}`)
        }

        // Find copilot-instructions.md
        const copilotFile = files.find((f) => f.relativePath === '.github/copilot-instructions.md')
        if (!copilotFile) {
          throw new Error('copilot-instructions.md not found in generateSteering output')
        }

        // copilot-instructions.md must use append-with-markers strategy
        if (copilotFile.writeStrategy !== 'append-with-markers') {
          throw new Error(
            `copilot-instructions.md should use "append-with-markers" strategy, got "${copilotFile.writeStrategy}"`
          )
        }

        // copilot-instructions.md must NOT contain fallback steering headings
        if (copilotFile.content.includes('### 任务开始前')) {
          throw new Error('copilot-instructions.md contains fallback content "### 任务开始前"')
        }
        if (copilotFile.content.includes('### 任务完成后')) {
          throw new Error('copilot-instructions.md contains fallback content "### 任务完成后"')
        }

        // 3 .instructions.md files must exist and use overwrite strategy
        const instructionFiles = files.filter((f) => f.relativePath.endsWith('.instructions.md'))
        if (instructionFiles.length !== 3) {
          throw new Error(`Expected 3 .instructions.md files, got ${instructionFiles.length}`)
        }

        for (const f of instructionFiles) {
          if (f.writeStrategy !== 'overwrite') {
            throw new Error(
              `.instructions.md file "${f.relativePath}" should use "overwrite" strategy, got "${f.writeStrategy}"`
            )
          }
        }

        // No file should have path containing gapa-stop.json
        for (const f of files) {
          if (f.relativePath.includes('gapa-stop.json')) {
            throw new Error(`Output should not contain gapa-stop.json, found "${f.relativePath}"`)
          }
        }

        // Verify expected paths
        const expectedPaths = [
          '.github/copilot-instructions.md',
          '.github/instructions/gapa-rules.instructions.md',
          '.github/instructions/gapa-context-load.instructions.md',
          '.github/instructions/gapa-evaluation.instructions.md',
        ]

        const actualPaths = files.map((f) => f.relativePath).sort()
        const sortedExpected = [...expectedPaths].sort()

        for (let i = 0; i < sortedExpected.length; i++) {
          if (actualPaths[i] !== sortedExpected[i]) {
            throw new Error(
              `Expected paths ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(actualPaths)}`
            )
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ─── Property 5 ───

/**
 * Property 5: Stop hook 条件输出
 *
 * 实际执行生成的 Stop hook 脚本，验证：
 * - `stop_hook_active === false` 时输出包含 `hookSpecificOutput.decision === "block"` 和非空 `hookSpecificOutput.reason`
 * - `stop_hook_active === true` 时输出 `{}`（防止无限循环）
 * - 无效 JSON 输入或空 stdin 时输出 `{}` 并以 exit code 0 退出
 *
 * Feature: vscode-hooks-support, Property 5: Stop hook 条件输出
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.7, 4.9, 10.4, 10.6, 10.7**
 */
describe('Feature: vscode-hooks-support, Property 5: Stop hook 条件输出', () => {
  /** Collect temp dirs for cleanup */
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('outputs block decision when stop_hook_active is false', () => {
    const ctx = makeCtx('en', '.gapa')
    const files = adapter.generateHooks(ctx)
    const stopFile = files.find((f) => f.relativePath === '.github/hooks/gapa-stop.mjs')

    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const genCtx = makeCtx(lang, gapaDir)
        const genFiles = adapter.generateHooks(genCtx)
        const genStopFile = genFiles.find((f) => f.relativePath === '.github/hooks/gapa-stop.mjs')

        const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-vscode-stop-test-'))
        tmpDirs.push(tmpDir)

        const scriptPath = join(tmpDir, 'gapa-stop.mjs')
        writeFileSync(scriptPath, genStopFile.content, 'utf-8')

        const stdinInput = JSON.stringify({ stop_hook_active: false })
        let stdout
        try {
          stdout = execSync(`node "${scriptPath}"`, {
            input: stdinInput,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch (e) {
          throw new Error(`Stop hook script failed: ${e.message}`)
        }

        let parsed
        try {
          parsed = JSON.parse(stdout)
        } catch (e) {
          throw new Error(`Stop hook output is not valid JSON: ${stdout}`)
        }

        // Must have hookSpecificOutput.decision === "block"
        if (!parsed.hookSpecificOutput || parsed.hookSpecificOutput.decision !== 'block') {
          throw new Error(
            `Expected hookSpecificOutput.decision === "block", got ${JSON.stringify(parsed)}`
          )
        }

        // Must have non-empty hookSpecificOutput.reason
        if (typeof parsed.hookSpecificOutput.reason !== 'string' || !parsed.hookSpecificOutput.reason.trim()) {
          throw new Error(
            `Expected non-empty hookSpecificOutput.reason, got ${JSON.stringify(parsed.hookSpecificOutput)}`
          )
        }
      }),
      { numRuns: 100 },
    )
  })

  it('outputs empty object when stop_hook_active is true', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateHooks(ctx)
        const stopFile = files.find((f) => f.relativePath === '.github/hooks/gapa-stop.mjs')

        const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-vscode-stop-test-'))
        tmpDirs.push(tmpDir)

        const scriptPath = join(tmpDir, 'gapa-stop.mjs')
        writeFileSync(scriptPath, stopFile.content, 'utf-8')

        const stdinInput = JSON.stringify({ stop_hook_active: true })
        let stdout
        try {
          stdout = execSync(`node "${scriptPath}"`, {
            input: stdinInput,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch (e) {
          throw new Error(`Stop hook script failed: ${e.message}`)
        }

        let parsed
        try {
          parsed = JSON.parse(stdout)
        } catch (e) {
          throw new Error(`Stop hook output is not valid JSON: ${stdout}`)
        }

        // Must be empty object
        const keys = Object.keys(parsed)
        if (keys.length !== 0) {
          throw new Error(
            `Expected empty object for stop_hook_active=true, got ${JSON.stringify(parsed)}`
          )
        }
      }),
      { numRuns: 100 },
    )
  })

  it('outputs empty object and exits with code 0 for invalid JSON or empty stdin', () => {
    // Generate a stop hook script once for this test
    const ctx = makeCtx('en', '.gapa')
    const files = adapter.generateHooks(ctx)
    const stopFile = files.find((f) => f.relativePath === '.github/hooks/gapa-stop.mjs')

    /** Generator for invalid stdin inputs */
    const invalidInputArb = fc.oneof(
      fc.constant(''),                                    // empty stdin
      fc.constant('not json at all'),                     // plain text
      fc.constant('{invalid json}'),                      // malformed JSON
      fc.constant('null'),                                // JSON null (no stop_hook_active field)
      fc.string({ minLength: 1, maxLength: 50 })         // random strings
        .filter((s) => { try { JSON.parse(s); return false } catch { return true } }), // ensure not valid JSON
    )

    fc.assert(
      fc.property(invalidInputArb, (invalidInput) => {
        const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-vscode-stop-test-'))
        tmpDirs.push(tmpDir)

        const scriptPath = join(tmpDir, 'gapa-stop.mjs')
        writeFileSync(scriptPath, stopFile.content, 'utf-8')

        let stdout
        try {
          stdout = execSync(`node "${scriptPath}"`, {
            input: invalidInput,
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch (e) {
          throw new Error(`Stop hook script should exit with code 0 for invalid input, but failed: ${e.message}`)
        }

        let parsed
        try {
          parsed = JSON.parse(stdout)
        } catch (e) {
          throw new Error(`Stop hook output is not valid JSON for invalid input: ${stdout}`)
        }

        // Must be empty object
        const keys = Object.keys(parsed)
        if (keys.length !== 0) {
          throw new Error(
            `Expected empty object for invalid input "${invalidInput}", got ${JSON.stringify(parsed)}`
          )
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ─── Property 6 ───

/**
 * Property 6: UserPromptSubmit hook 输出有效性
 *
 * 实际执行生成的 UserPromptSubmit hook 脚本，验证：
 * - stdout 输出为有效 JSON
 * - 包含 `systemMessage` 字符串字段
 * - `systemMessage` 非空
 * - 脚本以 exit code 0 退出
 * - zh 语言时 systemMessage 包含中文内容标记（包含 gapaDir 值）
 * - en 语言时 systemMessage 包含英文内容标记（包含 gapaDir 值）
 *
 * Feature: vscode-hooks-support, Property 6: UserPromptSubmit hook 输出有效性
 *
 * **Validates: Requirements 3.2, 3.4, 8.1, 8.2, 10.5**
 */
describe('Feature: vscode-hooks-support, Property 6: UserPromptSubmit hook 输出有效性', () => {
  /** Collect temp dirs for cleanup */
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('executes UserPromptSubmit hook and produces valid JSON with systemMessage for any valid GenerateContext', () => {
    fc.assert(
      fc.property(langArb, gapaDirArb, (lang, gapaDir) => {
        const ctx = makeCtx(lang, gapaDir)
        const files = adapter.generateHooks(ctx)

        // Find the prompt-submit hook script
        const promptSubmitFile = files.find(
          (f) => f.relativePath === '.github/hooks/gapa-prompt-submit.mjs'
        )
        if (!promptSubmitFile) {
          throw new Error('gapa-prompt-submit.mjs not found in generateHooks output')
        }

        // Write to temp directory and execute
        const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-vscode-prompt-submit-test-'))
        tmpDirs.push(tmpDir)

        const scriptPath = join(tmpDir, 'gapa-prompt-submit.mjs')
        writeFileSync(scriptPath, promptSubmitFile.content, 'utf-8')

        let stdout
        try {
          stdout = execSync(`node "${scriptPath}"`, {
            encoding: 'utf-8',
            timeout: 5000,
          })
        } catch (e) {
          throw new Error(`UserPromptSubmit hook script failed with non-zero exit code: ${e.message}`)
        }

        // Assert: output is valid JSON
        let parsed
        try {
          parsed = JSON.parse(stdout)
        } catch (e) {
          throw new Error(`UserPromptSubmit hook output is not valid JSON: ${stdout}`)
        }

        // Assert: output has `systemMessage` string field
        if (typeof parsed.systemMessage !== 'string') {
          throw new Error(
            `Expected systemMessage to be a string, got ${typeof parsed.systemMessage}: ${JSON.stringify(parsed)}`
          )
        }

        // Assert: systemMessage is non-empty
        if (!parsed.systemMessage.trim()) {
          throw new Error('systemMessage is empty')
        }

        // Assert: systemMessage contains gapaDir value (language-independent content marker)
        if (!parsed.systemMessage.includes(gapaDir)) {
          throw new Error(
            `systemMessage does not contain gapaDir value "${gapaDir}". Content: ${parsed.systemMessage.substring(0, 200)}...`
          )
        }

        // Assert: for zh lang, systemMessage contains Chinese content markers
        if (lang === 'zh') {
          // Chinese context-load prompt should contain Chinese characters
          const hasChinese = /[\u4e00-\u9fff]/.test(parsed.systemMessage)
          if (!hasChinese) {
            throw new Error(
              `For lang=zh, systemMessage should contain Chinese characters but does not. Content: ${parsed.systemMessage.substring(0, 200)}...`
            )
          }
        }

        // Assert: for en lang, systemMessage contains English content markers
        if (lang === 'en') {
          // English context-load prompt should contain common English words
          const hasEnglish = /[a-zA-Z]{3,}/.test(parsed.systemMessage)
          if (!hasEnglish) {
            throw new Error(
              `For lang=en, systemMessage should contain English words but does not. Content: ${parsed.systemMessage.substring(0, 200)}...`
            )
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})


// ─── Property 7 ───

/**
 * Property 7: getInstalledFiles 结构一致性
 *
 * 对任意项目根目录（随机创建部分文件），getInstalledFiles() 返回恰好 7 个条目，
 * 每个条目包含 relativePath（字符串）、exists（布尔值）、label（非空字符串），
 * 且 exists 与文件系统实际状态一致。返回的路径列表包含 7 个预期路径且不包含
 * .github/hooks/gapa-stop.json。
 *
 * Feature: vscode-hooks-support, Property 7: getInstalledFiles 结构一致性
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**
 */
describe('Feature: vscode-hooks-support, Property 7: getInstalledFiles 结构一致性', () => {
  /** Expected 7 file paths that getInstalledFiles should report */
  const EXPECTED_PATHS = [
    '.github/copilot-instructions.md',
    '.github/instructions/gapa-rules.instructions.md',
    '.github/instructions/gapa-context-load.instructions.md',
    '.github/instructions/gapa-evaluation.instructions.md',
    '.github/hooks/hooks.json',
    '.github/hooks/gapa-prompt-submit.mjs',
    '.github/hooks/gapa-stop.mjs',
  ]

  /** Collect temp dirs for cleanup */
  const tmpDirs = []

  afterEach(() => {
    for (const d of tmpDirs) {
      rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('returns exactly 7 entries with correct structure and exists matching filesystem for any subset of files', () => {
    fc.assert(
      fc.property(fc.subarray(EXPECTED_PATHS, { minLength: 0, maxLength: 7 }), (filesToCreate) => {
        // Create a temp directory as project root
        const tmpDir = mkdtempSync(join(tmpdir(), 'gapa-vscode-installed-test-'))
        tmpDirs.push(tmpDir)

        // Create the selected subset of files in the temp directory
        for (const relativePath of filesToCreate) {
          const fullPath = join(tmpDir, relativePath)
          mkdirSync(dirname(fullPath), { recursive: true })
          writeFileSync(fullPath, 'test content', 'utf-8')
        }

        // Call getInstalledFiles
        const result = adapter.getInstalledFiles(tmpDir)

        // Assert: returns exactly 7 entries
        if (!Array.isArray(result) || result.length !== 7) {
          throw new Error(`Expected exactly 7 entries, got ${result?.length}`)
        }

        // Assert: each entry has relativePath (string), exists (boolean), label (non-empty string)
        for (const entry of result) {
          if (typeof entry.relativePath !== 'string' || !entry.relativePath) {
            throw new Error(
              `Entry must have a non-empty string relativePath, got: ${JSON.stringify(entry)}`
            )
          }
          if (typeof entry.exists !== 'boolean') {
            throw new Error(
              `Entry must have a boolean exists field, got: ${JSON.stringify(entry)}`
            )
          }
          if (typeof entry.label !== 'string' || !entry.label.trim()) {
            throw new Error(
              `Entry must have a non-empty string label, got: ${JSON.stringify(entry)}`
            )
          }
        }

        // Assert: exists matches whether the file actually exists on the filesystem
        for (const entry of result) {
          const shouldExist = filesToCreate.includes(entry.relativePath)
          if (entry.exists !== shouldExist) {
            throw new Error(
              `Entry "${entry.relativePath}" has exists=${entry.exists} but file ${shouldExist ? 'was created' : 'was not created'}`
            )
          }
        }

        // Assert: no entry has relativePath containing 'gapa-stop.json'
        for (const entry of result) {
          if (entry.relativePath.includes('gapa-stop.json')) {
            throw new Error(
              `Entry should not contain "gapa-stop.json", found: "${entry.relativePath}"`
            )
          }
        }

        // Assert: expected paths include all 7 files
        const actualPaths = result.map((e) => e.relativePath).sort()
        const sortedExpected = [...EXPECTED_PATHS].sort()

        for (let i = 0; i < sortedExpected.length; i++) {
          if (actualPaths[i] !== sortedExpected[i]) {
            throw new Error(
              `Expected paths ${JSON.stringify(sortedExpected)}, got ${JSON.stringify(actualPaths)}`
            )
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
