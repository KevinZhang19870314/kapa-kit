/**
 * Unit tests for lib/adapters/windsurf-adapter.mjs
 *
 * Validates: Requirements 7.1, 7.3, 7.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTemplates } from '../../lib/core/template-engine.mjs'
import WindsurfAdapter from '../../lib/adapters/windsurf-adapter.mjs'

const adapter = new WindsurfAdapter()

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

describe('WindsurfAdapter metadata', () => {
  it('name is "windsurf"', () => {
    expect(adapter.name).toBe('windsurf')
  })

  it('formatVersion is "1.0"', () => {
    expect(adapter.formatVersion).toBe('1.0')
  })

  it('configDir is ".windsurf"', () => {
    expect(adapter.configDir).toBe('.windsurf')
  })

  it('supportsHooks is false', () => {
    expect(adapter.supportsHooks).toBe(false)
  })
})

// ─── generateSteering ───

describe('WindsurfAdapter.generateSteering()', () => {
  it('returns 1 file', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files).toHaveLength(1)
  })

  it('generates correct file path (.windsurf/rules/gapa-framework.md)', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].relativePath).toBe('.windsurf/rules/gapa-framework.md')
  })

  it('file has overwrite writeStrategy', () => {
    const files = adapter.generateSteering(makeCtx())
    expect(files[0].writeStrategy).toBe('overwrite')
  })

  it('contains YAML front-matter with trigger: always_on', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // YAML front-matter starts with ---
    expect(content).toMatch(/^---\s*\n/)
    expect(content).toContain('trigger: always_on')
  })

  it('contains YAML front-matter with description field', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toMatch(/description:\s*".*"/)
  })

  it('YAML front-matter is properly delimited', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    // Should have opening and closing --- delimiters
    const parts = content.split('---')
    // parts[0] is empty (before first ---), parts[1] is front-matter, parts[2+] is body
    expect(parts.length).toBeGreaterThanOrEqual(3)
  })

  it('contains GAPA rules content', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).toContain('# GAPA Framework')
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
    expect(content).toContain('### 任务开始前')
    expect(content).toContain('### 任务完成后')
  })

  it('works with en language', () => {
    const files = adapter.generateSteering(makeCtx('en'))
    expect(files).toHaveLength(1)
    const content = files[0].content
    expect(content).toContain('trigger: always_on')
    expect(content).toContain('.gapa/')
  })

  it('no unreplaced template placeholders remain', () => {
    const files = adapter.generateSteering(makeCtx())
    const content = files[0].content
    expect(content).not.toMatch(/\{\{\s*gapaDir\s*\}\}/)
    expect(content).not.toMatch(/\{\{\s*configDir\s*\}\}/)
  })
})

// ─── generateFallbackSteering ───

describe('WindsurfAdapter.generateFallbackSteering()', () => {
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

describe('WindsurfAdapter.detect()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'windsurf-adapter-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when no windsurf config exists', () => {
    expect(adapter.detect(tmpDir)).toBe(false)
  })

  it('returns true when .windsurfrules file exists', () => {
    writeFileSync(join(tmpDir, '.windsurfrules'), '')
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.windsurfrules'), { force: true })
  })

  it('returns true when .windsurf/rules/ directory exists', () => {
    mkdirSync(join(tmpDir, '.windsurf', 'rules'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(true)
    rmSync(join(tmpDir, '.windsurf'), { recursive: true, force: true })
  })

  it('returns false when .windsurf exists but .windsurf/rules/ does not', () => {
    mkdirSync(join(tmpDir, '.windsurf'), { recursive: true })
    expect(adapter.detect(tmpDir)).toBe(false)
    rmSync(join(tmpDir, '.windsurf'), { recursive: true, force: true })
  })
})

// ─── getInstalledFiles ───

describe('WindsurfAdapter.getInstalledFiles()', () => {
  let tmpDir

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'windsurf-installed-test-'))
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns expected file list', () => {
    const files = adapter.getInstalledFiles(tmpDir)
    const paths = files.map((f) => f.relativePath)
    expect(paths).toContain('.windsurf/rules/gapa-framework.md')
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
