/**
 * Unit tests for lib/adapters/trae-adapter.mjs
 *
 * Validates: Requirements 12.1, 12.2, 12.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import TraeAdapter from '../../lib/adapters/trae-adapter.mjs'

const adapter = new TraeAdapter()

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

describe('TraeAdapter metadata', () => {
  it('name is "trae"', () => {
    expect(adapter.name).toBe('trae')
  })

  it('formatVersion is "1.0"', () => {
    expect(adapter.formatVersion).toBe('1.0')
  })

  it('configDir is ".trae"', () => {
    expect(adapter.configDir).toBe('.trae')
  })

  it('supportsHooks is false', () => {
    expect(adapter.supportsHooks).toBe(false)
  })
})

// ─── generateSteering ───

describe('TraeAdapter.generateSteering()', () => {
  it('returns 2 files', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(2)
  })

  it('generates rules file at .trae/rules/gapa-framework.md', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].relativePath).toBe('.trae/rules/gapa-framework.md')
  })

  it('generates skill file at .trae/skills/gapa/SKILL.md', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[1].relativePath).toBe('.trae/skills/gapa/SKILL.md')
  })

  it('both files have overwrite writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].writeStrategy).toBe('overwrite')
    expect(files[1].writeStrategy).toBe('overwrite')
  })

  // ── Rules file: pure Markdown (no YAML front-matter) ──

  it('rules file is pure Markdown — does NOT start with ---', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).not.toMatch(/^---/)
  })

  it('rules file contains GAPA Framework heading', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].content).toContain('# GAPA Framework')
  })

  it('rules file contains fallback steering sections', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('### 任务开始前')
    expect(content).toContain('### 任务完成后')
  })

  it('rules file references .gapa/ paths', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('.gapa/skills/')
  })

  // ── SKILL.md: YAML front-matter format ──

  it('SKILL.md starts with --- (YAML front-matter)', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[1].content
    expect(content).toMatch(/^---\s*\n/)
  })

  it('SKILL.md has properly delimited YAML front-matter', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[1].content
    const parts = content.split('---')
    expect(parts.length).toBeGreaterThanOrEqual(3)
  })

  it('SKILL.md front-matter contains name field', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[1].content
    const frontMatter = content.split('---')[1]
    expect(frontMatter).toMatch(/^name:\s*.+/m)
  })

  it('SKILL.md front-matter contains description field', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[1].content
    const frontMatter = content.split('---')[1]
    expect(frontMatter).toMatch(/^description:\s*.+/m)
  })

  it('SKILL.md body contains evaluation workflow', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[1].content
    expect(content).toContain('.gapa/memory.md')
    expect(content).toContain('.gapa/preferences.md')
  })

  // ── No unreplaced placeholders ──

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    for (const file of files) {
      expect(file.content).not.toMatch(/\{\{\s*gapaDir\s*\}\}/)
      expect(file.content).not.toMatch(/\{\{\s*configDir\s*\}\}/)
      expect(file.content).not.toMatch(/\{\{\s*slot:/)
    }
  })

  // ── English language ──

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(2)
    expect(files[0].content).toContain('.gapa/')
    expect(files[1].content).toMatch(/^---/)
  })
})


// ─── generateFallbackSteering ───

describe('TraeAdapter.generateFallbackSteering()', () => {
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

describe('TraeAdapter.detect()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'trae-adapter-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when no trae config exists', () => {
    expect(adapter.detect(tmpDir)).toBe(false)
  })

  it('returns true when .trae/rules/ directory exists', () => {
    mkdirSync(join(tmpDir, '.trae', 'rules'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.trae'), { recursive: true, force: true })
  })

  it('returns true when .trae/skills/ directory exists', () => {
    mkdirSync(join(tmpDir, '.trae', 'skills'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.trae'), { recursive: true, force: true })
  })

  it('returns false when .trae exists but neither rules/ nor skills/ exists', () => {
    mkdirSync(join(tmpDir, '.trae'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(false)
    rmSync(join(tmpDir, '.trae'), { recursive: true, force: true })
  })
})

// ─── getInstalledFiles ───

describe('TraeAdapter.getInstalledFiles()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'trae-installed-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns expected file list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.trae/rules/gapa-framework.md')
    expect(paths).toContain('.trae/skills/gapa/SKILL.md')
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
})
