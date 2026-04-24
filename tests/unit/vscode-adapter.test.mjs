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

  it('formatVersion is "3.1"', () => {
    expect(adapter.formatVersion).toBe('3.1')
  })

  it('configDir is ".github"', () => {
    expect(adapter.configDir).toBe('.github')
  })

  it('supportsHooks is false', () => {
    expect(adapter.supportsHooks).toBe(false)
  })
})

// ─── generateSteering ───

describe('VSCodeAdapter.generateSteering()', () => {
  it('returns 5 files (4 instructions + 1 hook)', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(5)
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

  it('generates gapa-stop.json hook file', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath === '.github/hooks/gapa-stop.json')
    expect(f).toBeDefined()
    expect(f.writeStrategy).toBe('overwrite')
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

  it('copilot-instructions.md contains fallback steering', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('### 任务开始前')
    expect(content).toContain('### 任务完成后')
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

  it('hook file is valid JSON with Stop event', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath === '.github/hooks/gapa-stop.json')
    const parsed = JSON.parse(f.content)
    expect(parsed.hooks).toHaveProperty('Stop')
    expect(parsed.hooks.Stop).toBeInstanceOf(Array)
    expect(parsed.hooks.Stop.length).toBeGreaterThan(0)
    expect(parsed.hooks.Stop[0].type).toBe('command')
  })

  it('hook file contains gapaDir path', () => {
    const files = adapter.generateSteering(makeCtx())
    const f = files.find(f => f.relativePath === '.github/hooks/gapa-stop.json')
    expect(f.content).toContain('.gapa/')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(5)
    const rulesFile = files.find(f => f.relativePath.includes('gapa-rules.instructions.md'))
    expect(rulesFile.content).toContain("name: 'GAPA Evaluation Rules'")
    const hookFile = files.find(f => f.relativePath === '.github/hooks/gapa-stop.json')
    expect(hookFile.content).toContain('evaluation')
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

// ─── generateFallbackSteering ───

describe('VSCodeAdapter.generateFallbackSteering()', () => {
  it('returns same output as generateSteering', () => {
    const ctx = makeCtx()
    const steeringFiles = adapter.generateSteering(ctx)
    const fallbackFiles = adapter.generateFallbackSteering(ctx)
    expect(fallbackFiles).toHaveLength(steeringFiles.length)
    for (let i = 0; i < steeringFiles.length; i++) {
      expect(fallbackFiles[i].relativePath).toBe(steeringFiles[i].relativePath)
      expect(fallbackFiles[i].content).toBe(steeringFiles[i].content)
    }
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

  it('returns 5 files in the list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    expect(files).toHaveLength(5)
  })

  it('includes all expected file paths', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map(f => f.relativePath)
    expect(paths).toContain('.github/copilot-instructions.md')
    expect(paths).toContain('.github/instructions/gapa-rules.instructions.md')
    expect(paths).toContain('.github/instructions/gapa-context-load.instructions.md')
    expect(paths).toContain('.github/instructions/gapa-evaluation.instructions.md')
    expect(paths).toContain('.github/hooks/gapa-stop.json')
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
