/**
 * Unit tests for lib/adapters/claude-code-adapter.mjs
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import { writeWithStrategy, GAPA_START_MARKER, GAPA_END_MARKER } from '../../lib/utils/fs-helpers.mjs'
import ClaudeCodeAdapter from '../../lib/adapters/claude-code-adapter.mjs'

const adapter = new ClaudeCodeAdapter()

/** Helper: create a GenerateContext for the given lang */
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

describe('ClaudeCodeAdapter metadata', () => {
  it('name is "claude-code"', () => {
    expect(adapter.name).toBe('claude-code')
  })

  it('formatVersion is "1.0"', () => {
    expect(adapter.formatVersion).toBe('1.0')
  })

  it('configDir is ".claude"', () => {
    expect(adapter.configDir).toBe('.claude')
  })

  it('supportsHooks is false', () => {
    expect(adapter.supportsHooks).toBe(false)
  })
})


// ─── generateSteering ───

describe('ClaudeCodeAdapter.generateSteering()', () => {
  it('returns 1 file', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(1)
  })

  it('generates correct file path (CLAUDE.md)', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].relativePath).toBe('CLAUDE.md')
  })

  it('file has append-with-markers writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].writeStrategy).toBe('append-with-markers')
  })

  it('content does NOT contain GAPA markers (fs-helpers adds them)', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).not.toContain(GAPA_START_MARKER)
    expect(content).not.toContain(GAPA_END_MARKER)
  })

  it('contains GAPA Framework heading', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('# GAPA Framework')
  })

  it('contains GAPA rules content', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('.gapa/')
  })

  it('contains fallback steering with context-load prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('.gapa/skills/')
  })

  it('contains fallback steering with evaluation prompt', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('.gapa/gapa-rules.md')
    expect(content).toContain('.gapa/preferences.md')
  })

  it('contains section headers for fallback steering', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('## 自动行为指引')
    expect(content).toContain('### 任务开始前')
    expect(content).toContain('### 任务完成后')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(1)
    const content = files[0].content
    expect(content).toContain('.gapa/')
    expect(content).toContain('# GAPA Framework')
  })

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).not.toMatch(/\{\{\s*gapaDir\s*\}\}/)
    expect(content).not.toMatch(/\{\{\s*configDir\s*\}\}/)
    expect(content).not.toMatch(/\{\{\s*slot:\s*\w+\s*\}\}/)
  })
})

// ─── GAPA marker integration (append-with-markers) ───

describe('ClaudeCodeAdapter GAPA marker integration', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-marker-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('GAPA markers appear when content is written via writeWithStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    const filePath = join(tmpDir, 'CLAUDE-new.md')
    writeWithStrategy(filePath, files[0].content, files[0].writeStrategy)
    const written = readFileSync(filePath, 'utf-8')
    expect(written).toContain(GAPA_START_MARKER)
    expect(written).toContain(GAPA_END_MARKER)
  })

  it('preserves existing user content when appending with markers', () => {
    const userContent = '# My Project\n\nThis is my custom CLAUDE.md content.\n'
    const filePath = join(tmpDir, 'CLAUDE-existing.md')
    writeFileSync(filePath, userContent, 'utf-8')

    const files = adapter.generateSteering(makeCtx())
    writeWithStrategy(filePath, files[0].content, files[0].writeStrategy)

    const written = readFileSync(filePath, 'utf-8')
    // User content preserved
    expect(written).toContain('# My Project')
    expect(written).toContain('This is my custom CLAUDE.md content.')
    // GAPA content appended with markers
    expect(written).toContain(GAPA_START_MARKER)
    expect(written).toContain(GAPA_END_MARKER)
    expect(written).toContain('# GAPA Framework')
  })

  it('update replaces marker region content, preserving user content', () => {
    // First write: create file with user content + GAPA markers
    const userBefore = '# My Project\n\nUser content before GAPA.\n'
    const userAfter = '\n\nUser content after GAPA.\n'
    const filePath = join(tmpDir, 'CLAUDE-update.md')

    // Simulate initial install
    const files1 = adapter.generateSteering(makeCtx('zh'))
    writeFileSync(filePath, userBefore, 'utf-8')
    writeWithStrategy(filePath, files1[0].content, files1[0].writeStrategy)

    // Append user content after GAPA markers
    const currentContent = readFileSync(filePath, 'utf-8')
    writeFileSync(filePath, currentContent + userAfter, 'utf-8')

    // Simulate update: replace marker region
    const files2 = adapter.generateSteering(makeCtx('en'))
    writeWithStrategy(filePath, files2[0].content, files2[0].writeStrategy)

    const updated = readFileSync(filePath, 'utf-8')
    // User content before markers preserved
    expect(updated).toContain('User content before GAPA.')
    // User content after markers preserved
    expect(updated).toContain('User content after GAPA.')
    // GAPA markers still present
    expect(updated).toContain(GAPA_START_MARKER)
    expect(updated).toContain(GAPA_END_MARKER)
    // Content was replaced (en version)
    expect(updated).toContain('# GAPA Framework')
  })
})


// ─── generateFallbackSteering ───

describe('ClaudeCodeAdapter.generateFallbackSteering()', () => {
  it('returns same output as generateSteering', () => {
    const ctx = makeCtx()
    const steeringFiles = adapter.generateSteering(ctx)
    const fallbackFiles = adapter.generateFallbackSteering(ctx)
    expect(fallbackFiles).toHaveLength(steeringFiles.length)
    expect(fallbackFiles[0].relativePath).toBe(steeringFiles[0].relativePath)
    expect(fallbackFiles[0].content).toBe(steeringFiles[0].content)
  })

  it('fallback contains context-load and evaluation prompts', () => {
    const files = adapter.generateFallbackSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('memory.md')
    expect(content).toContain('skills/')
    expect(content).toContain('gapa-rules.md')
    expect(content).toContain('preferences.md')
  })
})

// ─── detect ───

describe('ClaudeCodeAdapter.detect()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-detect-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when neither CLAUDE.md nor .claude/ exists', () => {
    expect(adapter.detect(tmpDir)).toBe(false)
  })

  it('returns true when CLAUDE.md exists', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test', 'utf-8')
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, 'CLAUDE.md'))
  })

  it('returns true when .claude/ directory exists', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.claude'), { recursive: true, force: true })
  })
})

// ─── getInstalledFiles ───

describe('ClaudeCodeAdapter.getInstalledFiles()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-installed-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns expected file list with CLAUDE.md', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('CLAUDE.md')
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

  it('reports CLAUDE.md as existing when present', () => {
    writeFileSync(join(tmpDir, 'CLAUDE.md'), '# Test', 'utf-8')
    const files = adapter.getInstalledFiles(tmpDir)
    const claudeFile = files.find((f) => f.relativePath === 'CLAUDE.md')
    expect(claudeFile.exists).toBe(true)
    rmSync(join(tmpDir, 'CLAUDE.md'))
  })
})
