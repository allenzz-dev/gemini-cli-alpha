# Hooks System

Hooks allow you to intercept and customize Gemini CLI behavior at specific
lifecycle events.

## Configuration

Hooks are configured in `settings.json` under the `hooks` key. **Always start by
configuring and testing hooks in your project-level `settings.json` or
`.gemini/hooks/` directory to ensure you have proper permissions and can iterate
quickly.**

```json
"hooks": {
  "BeforeTool": [
    {
      "matcher": "read_file",
      "sequential": true,
      "hooks": [
        {
          "type": "command",
          "command": "node my-hook.js",
          "name": "My Custom Hook"
        }
      ]
    }
  ]
}
```

- **matcher** (string, optional): A glob pattern to filter when the hooks run
  (e.g., matching a tool name).
- **sequential** (boolean, optional): If `true`, hooks in the array run one
  after another, and the output of one hook is applied to the input of the next.
  This enables **hook chaining** where multiple scripts can cooperatively modify
  the same prompt or tool call. If `false` (default), hooks run in parallel and
  all receive the original input.

## Supported Events

- `BeforeTool` / `AfterTool`: Intercept or process tool calls/results.
- `BeforeAgent` / `AfterAgent`: Setup context or summarize agent loops.
- `BeforeModel` / `AfterModel`: Modify prompts or responses.
- `SessionStart` / `SessionEnd`: Initialize or cleanup session resources.
- `Notification`: Respond to CLI notifications.
- `PreCompress`: Handle context compression events.

## Communication Protocol

- **Input (stdin)**: Hook receives a JSON object with event details
  (`session_id`, `hook_event_name`, `tool_name`, etc.).
- **Output (stdout)**: Hook should emit a JSON object with a `decision` or other
  instructions.
- **Exit Codes**:
  - `0`: Success. `stdout` is parsed as JSON.
  - `2`: Blocking Error. Interrupts operation, shows `stderr` to user.

## Common Output Fields

- `decision`: `allow`, `deny`, `block`, `ask`, `approve`.
- `reason`: Explanation shown to the **agent** (if denied/blocked).
- `systemMessage`: Message shown to the **user**.
- `continue`: `boolean`. If `false`, terminates the agent loop.
- `hookSpecificOutput`:
  - `additionalContext`: Appends text to the agent's context.
  - `llm_request` / `llm_response`: Overrides for model interactions.

## In Extensions

Extensions provide hooks in `hooks/hooks.json` (not `gemini-extension.json`).

```json
{
  "hooks": {
    "before_agent": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${extensionPath}/scripts/setup.js",
            "name": "Extension Setup"
          }
        ]
      }
    ]
  }
}
```

## Verification

To verify that your hooks are executing correctly headlessly:

1.  **Instrument your Hook**: Add a debug statement to your hook script that
    writes to `stderr` (e.g., `console.error('Hook triggered!')` in JS).
2.  **Targeted Trigger**: Run a headless prompt designed to trigger the event.
    - **Command**:
      `gemini --debug --allowed-tools <minimal_tools> "your targeted prompt"`
    - **Note**: `read_file` does not need to be in `--allowed-tools` for
      read-only headless operations.
3.  **Verification Choice**: **Ask the user first** if they want to verify
    **manually** (interactive session) or have **you** (the agent) verify it on
    their behalf. Mention that agent-led verification involves the agent
    invoking itself headlessly and will require extra confirmations.
4.  **Security WARNING & Invocation**: If the user chooses agent-led
    verification, provide a **WARNING** that you will be invoking Gemini CLI on
    their behalf and will need to allow-list the tools required for verification
    (meaning those tools will run without further confirmation _within that
    headless process_). Immediately follow this warning with the tool call to
    execute the headless command (e.g.,
    `gemini --debug --allowed-tools <tools> "..."`).
5.  **Inspect Logs**: Check debug output for your hook's `stderr` and
    `HookRunner` logs.

For manual verification, **the user** can view registered hooks and their status
in an interactive session:

- **Command**: `/hooks panel` (or `/hooks list`)

## Documentation

For more information, visit the
[official hooks documentation](https://geminicli.com/docs/hooks).
