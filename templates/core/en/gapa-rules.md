# GAPA — Generalized Action and Prompt Adaptation

GAPA is an Agent self-learning system: task evaluation → workflow extraction → preference adaptation. Triggered by hooks, no need to load on every conversation.

## Task Evaluation

**Trigger:** After completing substantive tasks (code/bug/feature/config). Simple Q&A does not trigger.

**Dimensions:** Accuracy | Efficiency | Code Quality | Context Utilization | Communication

**Format (append to `{{gapaDir}}/memory.md`):**

```markdown
### GAPA-{number} | {date} | {task summary}
- **Done well:** {specifics}
- **Can improve:** {specifics}
- **Action items:** {actionable improvement measures}
- **Extract skill:** {name if applicable, otherwise "none"}
- **Preference update:** {content if applicable, otherwise "none"}
- **Score:** {1-5}/5
```

## Workflow Extraction → Skill

**Extraction criteria:** Same type of task 2+ times / single but highly reusable / user explicitly requests

**Skill file:** `{{gapaDir}}/skills/{name}.md`, keep within 40 lines.

## Preference Adaptation

Continuously observe user habits, write to `{{gapaDir}}/preferences.md`. Append for new entries, rewrite for same category, delete when outdated, keep within 80 lines.

## File Update Strategy

- **memory.md:** append, archive old records as one-line summaries when exceeding 20 entries
- **preferences.md:** primarily rewrite, keep concise
- **skill files:** primarily rewrite, single file ≤ 40 lines

## Principles

- Evaluate honestly, action items must be specific and actionable, be conservative with skill extraction, preferences based on observation not assumption
