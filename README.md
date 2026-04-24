# GAPA Kit — Generalized Action and Prompt Adaptation

[![npm version](https://img.shields.io/npm/v/gapa-kit.svg)](https://www.npmjs.com/package/gapa-kit)

[中文文档](./README.zh-CN.md)

GAPA is a cross-IDE self-learning framework for AI Agents, supporting **Kiro**, **Cursor**, **Claude Code**, **VS Code (Copilot)**, **Windsurf**, and **TRAE**.

Core capabilities:

- **Task Evaluation** — Automatically evaluates performance after each substantial task
- **Workflow Refinement** — Distills recurring high-value workflows into reusable Skills
- **Preference Adaptation** — Continuously observes user habits and accumulates personalized preferences

## Quick Start

```bash
# Auto-detect the IDE used in the current project and install
npx gapa-kit init

# Specify target IDE
npx gapa-kit init --target kiro

# Specify target IDE + English templates
npx gapa-kit init --target cursor --lang en

# Install for multiple IDEs at once
npx gapa-kit init --target kiro --target cursor --target claude-code
```

## Commands

### `gapa init`

Initialize the GAPA framework. Generates IDE-specific steering/rules files and the shared `.gapa/` data directory.

```bash
gapa init [--target <ide>] [--lang <zh|en>]
```

- `--target` — Target IDE, can be specified multiple times. Supported: `kiro`, `cursor`, `claude-code`, `vscode`, `windsurf`, `trae`
- `--lang` — Template and CLI message language, defaults to `zh`. Supported: `zh`, `en`
- When `--target` is not specified, auto-detects existing IDE config directories; prompts for interactive selection when multiple are found

### `gapa update`

Update framework files (steering/rules/hooks) while preserving user data (memory.md, preferences.md).

```bash
gapa update [--target <ide>]
```

- Reads installed IDE list and language settings from `.gaparc.json`
- For files using GAPA markers (CLAUDE.md, copilot-instructions.md), only replaces content within marker regions
- When `--target` is not specified, updates all installed IDEs

### `gapa status`

Check GAPA installation status, count Memory entries and Skill files.

```bash
gapa status [--target <ide>]
```

### Other Commands

| Command | Description |
|---------|-------------|
| `gapa version` | Show version number |
| `gapa help` | Show help information |

## IDE Usage Examples

### Kiro

```bash
npx gapa-kit init --target kiro
```

Generated files:

```
.kiro/
├── steering/
│   ├── gapa.md                        # Framework rules (inclusion: manual)
│   └── gapa-preferences.md            # Preferences guide (inclusion: auto)
└── hooks/
    ├── gapa-context-load.kiro.hook    # Pre-task context loading (promptSubmit trigger)
    └── gapa-evaluation.kiro.hook      # Post-task evaluation (agentStop trigger)
```

Kiro is the only IDE with native Hook support. Other IDEs achieve the same effect through behavioral guidelines in steering/rules files.

### Cursor

```bash
npx gapa-kit init --target cursor
```

Generated files:

```
.cursor/rules/
└── gapa-framework.mdc    # MDC format, alwaysApply: true
```

GAPA rules and behavioral guidelines (context loading + evaluation prompts) are embedded in the MDC rules file.

### Claude Code

```bash
npx gapa-kit init --target claude-code
```

Generated files:

```
CLAUDE.md    # Appends GAPA section (wrapped in <!-- GAPA:START --> / <!-- GAPA:END --> markers)
```

If `CLAUDE.md` already exists, GAPA content is appended to the end without affecting existing content. `update` only replaces content within the marker region.

### VS Code (Copilot)

```bash
npx gapa-kit init --target vscode
```

Generated files:

```
.github/
└── copilot-instructions.md    # Appends GAPA section (wrapped in GAPA markers)
```

Similar to Claude Code, uses GAPA markers for appending and idempotent updates.

### Windsurf

```bash
npx gapa-kit init --target windsurf
```

Generated files:

```
.windsurf/rules/
└── gapa-framework.md    # YAML front-matter, trigger: always_on
```

### TRAE

```bash
npx gapa-kit init --target trae
```

Generated files:

```
.trae/
├── rules/
│   └── gapa-framework.md       # Pure Markdown global rules
└── skills/gapa/
    └── SKILL.md                # YAML front-matter (name + description), Model-invoked skill
```

## `.gapa/` Shared Directory Structure

All IDEs share a single data directory, avoiding sync issues across multiple copies:

```
.gapa/
├── memory.md          # Task evaluation records (auto-maintained, personal data)
├── preferences.md     # User preferences (auto-learned, team-shareable)
├── skills/            # Skill files (team-shareable)
│   └── _example.md    # Example Skill template
├── .gaparc.json       # GAPA config (installed IDEs, language, version)
└── .gitignore         # Excludes memory.md, keeps preferences.md and skills/
```

`.gaparc.json` example:

```json
{
  "version": "0.2.0",
  "lang": "en",
  "installedAdapters": {
    "kiro": { "formatVersion": "1.0", "installedAt": "2025-07-10T..." },
    "cursor": { "formatVersion": "1.0", "installedAt": "2025-07-10T..." }
  }
}
```

## Customization

### Evaluation Dimensions

Edit the dimension line in the corresponding steering/rules file under `.gapa/`:

```markdown
**Dimensions:** Accuracy | Efficiency | Code Quality | Context Utilization | Communication
```

### Preferences

Edit `.gapa/preferences.md` with your preferences (communication style, code style, project-specific habits). The Agent will automatically supplement and refine them in subsequent interactions.

### Creating Custom Skills

Use the `.gapa/skills/_example.md` template to create Skill files. GAPA will also automatically create Skills when it identifies reusable patterns.

## Migrating from v0.1.0 to v0.2.0

v0.2.0 introduces cross-IDE support and the shared data directory `.gapa/`.

### Key Changes

| Item | v0.1.0 | v0.2.0 |
|------|--------|--------|
| Supported IDEs | Kiro only | Kiro + Cursor + Claude Code + VS Code + Windsurf + TRAE |
| Data directory | `.kiro/steering/` | `.gapa/` (shared across IDEs) |
| CLI arguments | None | `--target <ide>` + `--lang <zh\|en>` |
| Template language | Chinese only | Chinese + English |

### Automatic Migration

When running `gapa init`, if a legacy installation is detected (`.kiro/steering/gapa-*.md` exists and `.gapa/` does not), the CLI will prompt for migration:

- `.kiro/steering/gapa-memory.md` → `.gapa/memory.md`
- `.kiro/steering/gapa-preferences.md` → `.gapa/preferences.md`
- Skill files under `.kiro/skills/` → `.gapa/skills/`

After migration, `.kiro/steering/gapa-preferences.md` is replaced with a pointer file referencing `.gapa/preferences.md`.

### Manual Migration

If you prefer to migrate manually:

```bash
# 1. Create shared directory
mkdir -p .gapa/skills

# 2. Migrate data files
cp .kiro/steering/gapa-memory.md .gapa/memory.md
cp .kiro/steering/gapa-preferences.md .gapa/preferences.md
cp .kiro/skills/*.md .gapa/skills/

# 3. Reinstall
npx gapa-kit init --target kiro
```

## How It Works

```
User submits task
    ↓
[Context Load] → Read .gapa/memory.md + .gapa/skills/ → Apply to current task
    ↓
Agent executes task
    ↓
[Evaluation] → 5-dimension evaluation → Append memory → Refine Skills → Update preferences
    ↓
Next task benefits automatically
```

IDEs with Hook support (Kiro) trigger automatically via native Hooks; IDEs without Hook support achieve the same effect through behavioral guidelines in steering/rules.

## Uninstall

```bash
# Remove shared data directory
rm -rf .gapa/

# Remove IDE-specific files (as needed)
rm -rf .kiro/steering/gapa*.md .kiro/hooks/gapa-*.kiro.hook
rm -rf .cursor/rules/gapa-framework.mdc
# Claude Code: manually remove content between GAPA:START and GAPA:END in CLAUDE.md
# VS Code: manually remove content between GAPA:START and GAPA:END in copilot-instructions.md
rm -rf .windsurf/rules/gapa-framework.md
rm -rf .trae/rules/gapa-framework.md .trae/skills/gapa/
```

## License

[MIT](LICENSE)
