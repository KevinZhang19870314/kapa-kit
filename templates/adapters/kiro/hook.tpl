{
  "enabled": true,
  "name": "{{slot:hookName}}",
  "description": "{{slot:hookDescription}}",
  "version": "1",
  "when": {
    "type": "{{slot:triggerType}}"
  },
  "then": {
    "type": "askAgent",
    "prompt": "{{slot:prompt}}"
  }
}
