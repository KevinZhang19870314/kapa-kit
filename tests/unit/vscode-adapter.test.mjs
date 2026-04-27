/**
 * Unit tests for lib/adapters/vscode-adapter.mjs
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 * v3.1: split instructions + simplified Stop hook, no custom agent
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import { writeWithStrategy, GAPA_START_MARKER, GAPA_END_MARKER } from '../../lib/utils/fs-helpers.mjs'
import VSCodeAdapter from '../../lib/adapters/vscode-adapter.mjs'

const adapter = new VSCodeAdapter()

function makeCtx(lang = 'zh') {
  return {
    projectRoot: '/tmp/test',
    lang,
    gapaDir: '.gapa',
    templates: loadTemplates(lang),
    isUpdate: false,
  }
}

// ─── Adapter metadata ───

describe('VSCodeAdapter metadata', () => {
  it('name is "vscode"', () => {
    expect(adapter.name).toBe('vscode')
  })

  it('formatVersion is "4.0"', () => {
    expect(adapter.formatVersion).toBe('4.0')
  })

  it('configDir is ".github"', () => {
    expect(adapter.configDir).toBe('.github')
  })

  it('supportsHooks is true', () => {
    expect(adapter.supportsHooks).toBe(true)
  })
})

// ─── generateSteering ───

describe('VSCodeAdapter.generateSteering()', () => {
  it('returns 4 files (4 instructions)', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(4)
  })

  it('generates copilot-instructions.md as first file', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].relativePath).toBe('.github/copilot-instructions.md')
  })

  it('generates gapa-rules.instructions.md', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-rules.instructions.md'))
    expect(f).toBeDefined()
  })

  it('generates gapa-context-load.instructions.md', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-context-load.instructions.md'))
    expect(f).toBeDefined()
  })

  it('generates gapa-evaluation.instructions.md', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-evaluation.instructions.md'))
    expect(f).toBeDefined()
  })

  it('copilot-instructions.md has append-with-markers writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].writeStrategy).toBe('append-with-markers')
  })

  it('instruction files have overwrite writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    const instrFiles = files.filter(f => f.relativePath.includes('/instructions/'))
    for (const file of instrFiles) {
      expect(file.writeStrategy).toBe('overwrite')
    }
  })

  it('copilot-instructions.md does NOT contain GAPA markers', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].content).not.toContain(GAPA_START_MARKER)
    expect(files[0].content).not.toContain(GAPA_END_MARKER)
  })

  it('copilot-instructions.md contains mandatory language', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('GAPA')
    expect(content).toContain('.gapa/')
  })

  it('copilot-instructions.md does NOT contain fallback steering content', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).not.toContain('### 任务开始前')
    expect(content).not.toContain('### 任务完成后')
  })

  it('instruction files contain YAML frontmatter with applyTo', () => {
    const files = adapter.generateSteering(makeCtx())
    const instrFiles = files.filter(f => f.relativePath.includes('/instructions/'))
    for (const file of instrFiles) {
      expect(file.content).toMatch(/^---\r?\n/)
      expect(file.content).toContain("applyTo: '**'")
    }
  })

  it('instruction files contain name and description', () => {
    const files = adapter.generateSteering(makeCtx())
    const instrFiles = files.filter(f => f.relativePath.includes('/instructions/'))
    for (const file of instrFiles) {
      expect(file.content).toMatch(/name: '.*'/)
      expect(file.content).toMatch(/description: '.*'/)
    }
  })

  it('gapa-rules instruction contains full rules content', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-rules.instructions.md'))
    expect(f.content).toContain('.gapa/memory.md')
    expect(f.content).toContain('.gapa/skills/')
    expect(f.content).toContain('.gapa/preferences.md')
  })

  it('context-load instruction contains context-load prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-context-load.instructions.md'))
    expect(f.content).toContain('.gapa/memory.md')
    expect(f.content).toContain('.gapa/skills/')
  })

  it('evaluation instruction contains evaluation prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath.includes('gapa-evaluation.instructions.md'))
    expect(f.content).toContain('.gapa/gapa-rules.md')
    expect(f.content).toContain('.gapa/memory.md')
    expect(f.content).toContain('.gapa/preferences.md')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(4)
    const rulesFile = files.find(f => f.relativePath.includes('gapa-rules.instructions.md'))
    expect(rulesFile.content).toContain("name: 'GAPA Evaluation Rules'")
  })

  it('zh language uses Chinese frontmatter names', () => {
    const files = adapter.generateSteering(makeCtx('zh'))
    const f = files.find(f => f.relativePath.includes('gapa-rules.instructions.md'))
    expect(f.content).toContain("name: 'GAPA 评估规则'")
  })

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{\s*gapaDir\s*\}\}/)
      expect(file.content).not.toMatch(/\{\{\s*configDir\s*\}\}/)
      expect(file.content).not.toMatch(/\{\{\s*slot:\s*\w+\s*\}\}/)
    }
  })
})

// ─── GAPA marker integration ───

describe('VSCodeAdapter GAPA marker integration', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vscode-marker-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('GAPA markers appear when written via writeWithStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    const filePath = join(tmpDir, '.github', 'copilot-instructions-new.md')
    writeWithStrategy(filePath, files[0].content, files[0].writeStrategy)
    const written = readFileSync(filePath, 'utf-8')
    expect(written).toContain(GAPA_START_MARKER)
    expect(written).toContain(GAPA_END_MARKER)
  })

  it('preserves existing user content when appending', () => {
    const userContent = '# My Copilot Instructions\n\nCustom instructions.\n'
    const dir = join(tmpDir, '.github-existing')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'copilot-instructions.md')
    writeFileSync(filePath, userContent, 'utf-8')

    const files = adapter.generateSteering(makeCtx())
    writeWithStrategy(filePath, files[0].content, files[0].writeStrategy)

    const written = readFileSync(filePath, 'utf-8')
    expect(written).toContain('# My Copilot Instructions')
    expect(written).toContain(GAPA_START_MARKER)
    expect(written).toContain(GAPA_END_MARKER)
    expect(written).toContain('GAPA')
  })

  it('update replaces marker region, preserving user content', () => {
    const userBefore = '# My Instructions\n\nBefore GAPA.\n'
    const userAfter = '\n\nAfter GAPA.\n'
    const dir = join(tmpDir, '.github-update')
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'copilot-instructions.md')

    const files1 = adapter.generateSteering(makeCtx('zh'))
    writeFileSync(filePath, userBefore, 'utf-8')
    writeWithStrategy(filePath, files1[0].content, files1[0].writeStrategy)

    const currentContent = readFileSync(filePath, 'utf-8')
    writeFileSync(filePath, currentContent + userAfter, 'utf-8')

    const files2 = adapter.generateSteering(makeCtx('en'))
    writeWithStrategy(filePath, files2[0].content, files2[0].writeStrategy)

    const updated = readFileSync(filePath, 'utf-8')
    expect(updated).toContain('Before GAPA.')
    expect(updated).toContain('After GAPA.')
    expect(updated).toContain(GAPA_START_MARKER)
    expect(updated).toContain(GAPA_END_MARKER)
  })
})

// ─── generateHooks ───

describe('VSCodeAdapter.generateHooks()', () => {
  it('returns exactly 3 files', () => {
    const files = adapter.generateHooks(makeCtx())
    expect(files).toHaveLength(3)
  })

  it('generates correct file paths', () => {
    const files = adapter.generateHooks(makeCtx())
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.github/hooks/hooks.json')
    expect(paths).toContain('.github/hooks/gapa-prompt-submit.mjs')
    expect(paths).toContain('.github/hooks/gapa-stop.mjs')
  })

  it('all files have overwrite writeStrategy', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      expect(file.writeStrategy).toBe('overwrite')
    }
  })

  // ── hooks.json structure ──

  it('hooks.json is valid JSON', () => {
    const files = adapter.generateHooks(makeCtx())
    const hooksFile = files.find((f) => f.relativePath === '.github/hooks/hooks.json')
    expect(() => JSON.parse(hooksFile.content)).not.toThrow()
  })

  it('hooks.json has no version field', () => {
    const files = adapter.generateHooks(makeCtx())
    const parsed = JSON.parse(
      files.find((f) => f.relativePath === '.github/hooks/hooks.json').content
    )
    expect(parsed).not.toHaveProperty('version')
  })

  it('hooks.json uses PascalCase event names (UserPromptSubmit and Stop)', () => {
    const files = adapter.generateHooks(makeCtx())
    const parsed = JSON.parse(
      files.find((f) => f.relativePath === '.github/hooks/hooks.json').content
    )
    expect(parsed.hooks).toHaveProperty('UserPromptSubmit')
    expect(parsed.hooks).toHaveProperty('Stop')
    expect(parsed.hooks.UserPromptSubmit).toBeInstanceOf(Array)
    expect(parsed.hooks.Stop).toBeInstanceOf(Array)
    expect(parsed.hooks.UserPromptSubmit.length).toBeGreaterThan(0)
    expect(parsed.hooks.Stop.length).toBeGreaterThan(0)
  })

  it('each hook entry has type "command", valid command string, and timeout of 10', () => {
    const files = adapter.generateHooks(makeCtx())
    const parsed = JSON.parse(
      files.find((f) => f.relativePath === '.github/hooks/hooks.json').content
    )
    for (const entry of [...parsed.hooks.UserPromptSubmit, ...parsed.hooks.Stop]) {
      expect(entry.type).toBe('command')
      expect(typeof entry.command).toBe('string')
      expect(entry.command).toMatch(/^node \.github\/hooks\/.*\.mjs$/)
      expect(entry.timeout).toBe(10)
    }
  })

  // ── UserPromptSubmit hook script ──

  it('UserPromptSubmit hook script contains context-load prompt content', () => {
    const files = adapter.generateHooks(makeCtx())
    const script = files.find((f) =>
      f.relativePath.includes('gapa-prompt-submit.mjs')
    )
    expect(script.content).toContain('.gapa/memory.md')
    expect(script.content).toContain('systemMessage')
  })

  // ── Stop hook script ──

  it('Stop hook script contains evaluation prompt content', () => {
    const files = adapter.generateHooks(makeCtx())
    const script = files.find((f) =>
      f.relativePath.includes('gapa-stop.mjs')
    )
    expect(script.content).toContain('.gapa/gapa-rules.md')
    expect(script.content).toContain('stop_hook_active')
  })

  // ── Language support ──

  it('works with en language - hook scripts contain English content', () => {
    const files = adapter.generateHooks(makeCtx('en'))
    expect(files).toHaveLength(3)
    const promptScript = files.find((f) => f.relativePath.includes('gapa-prompt-submit.mjs'))
    const stopScript = files.find((f) => f.relativePath.includes('gapa-stop.mjs'))
    // English templates should not contain Chinese-specific content
    expect(promptScript.content).toContain('.gapa/memory.md')
    expect(stopScript.content).toContain('.gapa/gapa-rules.md')
  })

  it('works with zh language - hook scripts contain Chinese content', () => {
    const files = adapter.generateHooks(makeCtx('zh'))
    const promptScript = files.find((f) => f.relativePath.includes('gapa-prompt-submit.mjs'))
    const stopScript = files.find((f) => f.relativePath.includes('gapa-stop.mjs'))
    expect(promptScript.content).toContain('.gapa/memory.md')
    expect(stopScript.content).toContain('.gapa/gapa-rules.md')
  })

  it('hooks.json is language-independent (same structure for zh and en)', () => {
    const zhFiles = adapter.generateHooks(makeCtx('zh'))
    const enFiles = adapter.generateHooks(makeCtx('en'))
    const zhHooks = zhFiles.find((f) => f.relativePath === '.github/hooks/hooks.json')
    const enHooks = enFiles.find((f) => f.relativePath === '.github/hooks/hooks.json')
    expect(zhHooks.content).toBe(enHooks.content)
  })

  // ── No unreplaced placeholders ──

  it('no unreplaced template placeholders in any output file', () => {
    const files = adapter.generateHooks(makeCtx())
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{.*?\}\}/)
    }
  })
})

// ─── generateFallbackSteering ───

describe('VSCodeAdapter.generateFallbackSteering()', () => {
  it('throws error when called (supports native hooks)', () => {
    expect(() => adapter.generateFallbackSteering(makeCtx())).toThrow(/supports native hooks/)
  })
})

// ─── detect ───

describe('VSCodeAdapter.detect()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vscode-detect-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when no config exists', () => {
    expect(adapter.detect(tmpDir)).toBe(false)
  })

  it('returns true when .github/copilot-instructions.md exists', () => {
    const dir = join(tmpDir, '.github')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'copilot-instructions.md'), '# Test', 'utf-8')
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns true when .github/instructions/ exists', () => {
    mkdirSync(join(tmpDir, '.github', 'instructions'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.github'), { recursive: true, force: true })
  })

  it('returns true when .github/hooks/ exists', () => {
    mkdirSync(join(tmpDir, '.github', 'hooks'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.github'), { recursive: true, force: true })
  })
})

// ─── getInstalledFiles ───

describe('VSCodeAdapter.getInstalledFiles()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vscode-installed-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 7 files in the list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    expect(files).toHaveLength(7)
  })

  it('includes all expected file paths', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map(f => f.relativePath)
    expect(paths).toContain('.github/copilot-instructions.md')
    expect(paths).toContain('.github/instructions/gapa-rules.instructions.md')
    expect(paths).toContain('.github/instructions/gapa-context-load.instructions.md')
    expect(paths).toContain('.github/instructions/gapa-evaluation.instructions.md')
    expect(paths).toContain('.github/hooks/hooks.json')
    expect(paths).toContain('.github/hooks/gapa-prompt-submit.mjs')
    expect(paths).toContain('.github/hooks/gapa-stop.mjs')
  })

  it('does NOT include gapa-stop.json', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map(f => f.relativePath)
    expect(paths).not.toContain('.github/hooks/gapa-stop.json')
  })

  it('each file has exists and label properties', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    for (const file of files) {
      expect(file).toHaveProperty('exists')
      expect(typeof file.exists).toBe('boolean')
      expect(file).toHaveProperty('label')
      expect(typeof file.label).toBe('string')
    }
  })

  it('reports files as not existing in empty directory', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    for (const file of files) {
      expect(file.exists).toBe(false)
    }
  })

  it('reports copilot-instructions.md as existing when present', () => {
    const dir = join(tmpDir, '.github')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'copilot-instructions.md'), '# Test', 'utf-8')
    const files = adapter.getInstalledFiles(tmpDir)
    const f = files.find(f => f.relativePath === '.github/copilot-instructions.md')
    expect(f.exists).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports instruction files as existing when present', () => {
    const dir = join(tmpDir, '.github', 'instructions')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'gapa-rules.instructions.md'), '# Test', 'utf-8')
    const files = adapter.getInstalledFiles(tmpDir)
    const f = files.find(f => f.relativePath.includes('gapa-rules.instructions.md'))
    expect(f.exists).toBe(true)
    rmSync(join(tmpDir, '.github'), { recursive: true, force: true })
  })
})
