/**
 * Unit tests for lib/utils/migration.mjs
 *
 * Validates: Requirements 3.4
 *
 * - Verify old files correctly migrate to `.gapa/`
 * - Verify `.kiro/steering/gapa-preferences.md` becomes a pointer file after migration
 * - Verify `.gapa/.gitignore` content is correct
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  detectLegacyInstall,
  migrateLegacy,
  stripFrontMatter,
  createPointerFile,
} from '../../lib/utils/migration.mjs'
import { createGitignore } from '../../lib/core/shared-data.mjs'

// ─── Helpers ───

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), 'migration-test-'))
}

function writeFile(base, relPath, content) {
  const full = join(base, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

// ─── stripFrontMatter ───

describe('stripFrontMatter()', () => {
  it('removes YAML front-matter from content', () => {
    const input = '---\ninclusion: auto\n---\n\n# My Content\nHello'
    const result = stripFrontMatter(input)
    expect(result).toBe('# My Content\nHello')
  })

  it('returns content unchanged if no front-matter', () => {
    const input = '# No Front Matter\nJust content'
    expect(stripFrontMatter(input)).toBe(input)
  })

  it('handles front-matter with multiple fields', () => {
    const input = '---\ninclusion: manual\ntitle: GAPA\n---\n\nBody text'
    const result = stripFrontMatter(input)
    expect(result).toBe('Body text')
  })
})

// ─── createPointerFile ───

describe('createPointerFile()', () => {
  it('contains inclusion: auto in front-matter', () => {
    const content = createPointerFile()
    expect(content).toMatch(/^---\n/)
    expect(content).toContain('inclusion: auto')
  })

  it('references .gapa/preferences.md', () => {
    const content = createPointerFile('.gapa')
    expect(content).toContain('.gapa/preferences.md')
  })

  it('uses custom gapaDir in path reference', () => {
    const content = createPointerFile('.custom-gapa')
    expect(content).toContain('.custom-gapa/preferences.md')
  })
})

// ─── detectLegacyInstall ───

describe('detectLegacyInstall()', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when neither .kiro/steering/ nor .gapa/ exist', () => {
    expect(detectLegacyInstall(tmpDir)).toBe(false)
  })

  it('returns false when .gapa/ already exists', () => {
    writeFile(tmpDir, '.kiro/steering/gapa-memory.md', '# Memory')
    mkdirSync(join(tmpDir, '.gapa'), { recursive: true })
    expect(detectLegacyInstall(tmpDir)).toBe(false)
  })

  it('returns true when gapa-*.md files exist and .gapa/ does not', () => {
    writeFile(tmpDir, '.kiro/steering/gapa-memory.md', '# Memory')
    expect(detectLegacyInstall(tmpDir)).toBe(true)
  })

  it('returns true when gapa-preferences.md exists and .gapa/ does not', () => {
    writeFile(tmpDir, '.kiro/steering/gapa-preferences.md', '# Prefs')
    expect(detectLegacyInstall(tmpDir)).toBe(true)
  })

  it('returns false when .kiro/steering/ has no gapa-*.md files', () => {
    writeFile(tmpDir, '.kiro/steering/other.md', '# Other')
    expect(detectLegacyInstall(tmpDir)).toBe(false)
  })
})

// ─── migrateLegacy ───

describe('migrateLegacy()', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('migrates gapa-memory.md to .gapa/memory.md with front-matter stripped', () => {
    const memoryContent = '---\ninclusion: auto\n---\n\n# GAPA Memory\n\n### GAPA-001 | test'
    writeFile(tmpDir, '.kiro/steering/gapa-memory.md', memoryContent)

    const result = migrateLegacy(tmpDir)

    const dest = readFileSync(join(tmpDir, '.gapa', 'memory.md'), 'utf-8')
    expect(dest).toBe('# GAPA Memory\n\n### GAPA-001 | test')
    expect(result.migrated).toContain('.kiro/steering/gapa-memory.md → .gapa/memory.md')
  })

  it('migrates gapa-preferences.md to .gapa/preferences.md with front-matter stripped', () => {
    const prefsContent = '---\ninclusion: auto\n---\n\n# Preferences\n\n## 沟通偏好\n- 中文'
    writeFile(tmpDir, '.kiro/steering/gapa-preferences.md', prefsContent)

    const result = migrateLegacy(tmpDir)

    const dest = readFileSync(join(tmpDir, '.gapa', 'preferences.md'), 'utf-8')
    expect(dest).toBe('# Preferences\n\n## 沟通偏好\n- 中文')
    expect(result.migrated).toContain('.kiro/steering/gapa-preferences.md → .gapa/preferences.md')
  })

  it('replaces gapa-preferences.md with a pointer file after migration', () => {
    const prefsContent = '---\ninclusion: auto\n---\n\n# Preferences\n\n## 沟通偏好'
    writeFile(tmpDir, '.kiro/steering/gapa-preferences.md', prefsContent)

    migrateLegacy(tmpDir)

    const pointerContent = readFileSync(
      join(tmpDir, '.kiro', 'steering', 'gapa-preferences.md'),
      'utf-8'
    )
    expect(pointerContent).toContain('inclusion: auto')
    expect(pointerContent).toContain('.gapa/preferences.md')
    expect(pointerContent).not.toContain('## 沟通偏好')
  })

  it('migrates .kiro/skills/*.md to .gapa/skills/*.md', () => {
    writeFile(tmpDir, '.kiro/skills/my-skill.md', '# Skill: My Skill\n\n## 触发场景')
    writeFile(tmpDir, '.kiro/skills/another.md', '# Skill: Another')
    // Need at least one gapa-*.md for the steering dir to exist
    writeFile(tmpDir, '.kiro/steering/gapa-memory.md', '# Memory')

    const result = migrateLegacy(tmpDir)

    expect(existsSync(join(tmpDir, '.gapa', 'skills', 'my-skill.md'))).toBe(true)
    expect(existsSync(join(tmpDir, '.gapa', 'skills', 'another.md'))).toBe(true)
    const skillContent = readFileSync(join(tmpDir, '.gapa', 'skills', 'my-skill.md'), 'utf-8')
    expect(skillContent).toBe('# Skill: My Skill\n\n## 触发场景')
  })

  it('creates .gapa/ directory if it does not exist', () => {
    writeFile(tmpDir, '.kiro/steering/gapa-memory.md', '# Memory')

    migrateLegacy(tmpDir)

    expect(existsSync(join(tmpDir, '.gapa'))).toBe(true)
  })

  it('reports skipped items when source files are missing', () => {
    // Create steering dir but no gapa files
    mkdirSync(join(tmpDir, '.kiro', 'steering'), { recursive: true })

    const result = migrateLegacy(tmpDir)

    expect(result.skipped.length).toBeGreaterThan(0)
    expect(result.migrated.length).toBe(0)
  })

  it('handles content without front-matter gracefully', () => {
    writeFile(tmpDir, '.kiro/steering/gapa-memory.md', '# Plain Memory\nNo front-matter here')

    migrateLegacy(tmpDir)

    const dest = readFileSync(join(tmpDir, '.gapa', 'memory.md'), 'utf-8')
    expect(dest).toBe('# Plain Memory\nNo front-matter here')
  })
})

// ─── .gapa/.gitignore content (Task 15.2 verification) ───

describe('.gapa/.gitignore content', () => {
  it('excludes memory.md', () => {
    const content = createGitignore()
    expect(content).toContain('memory.md')
  })

  it('contains comment about personal data', () => {
    const content = createGitignore()
    expect(content).toMatch(/personal data/i)
  })

  it('mentions team-shareable files in comments', () => {
    const content = createGitignore()
    expect(content).toContain('preferences.md')
    expect(content).toContain('skills/')
    expect(content).toContain('.gaparc.json')
  })
})
