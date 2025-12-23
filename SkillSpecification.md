# Agent Skills Specification

Agent Skills are a standardized, open format for providing AI agents with
specialized knowledge, procedural instructions, and bundled resources. They
enable "progressive disclosure" of context, keeping agents efficient while
allowing them to access deep expertise on demand.

## 1. Directory Structure

A skill is defined by a directory containing a required `SKILL.md` file at its
root. It may optionally include other directories for organization.

```text
skill-name/
├── SKILL.md          # Required: instructions + metadata
├── scripts/          # Optional: executable code (Python, Bash, etc.)
├── references/       # Optional: additional documentation (REFERENCE.md, etc.)
└── assets/           # Optional: static resources (templates, images, data)
```

## 2. SKILL.md Format

The `SKILL.md` file uses YAML frontmatter for metadata and standard Markdown for
instructions.

### 2.1 Frontmatter Fields

| Field           | Required | Constraints                                                                                      |
| :-------------- | :------- | :----------------------------------------------------------------------------------------------- |
| `name`          | Yes      | 1-64 characters. Lowercase letters, numbers, and hyphens only. Must match parent directory name. |
| `description`   | Yes      | 1-1024 characters. Describes functionality and activation triggers.                              |
| `license`       | No       | License name or reference to a bundled license file.                                             |
| `compatibility` | No       | Environment requirements (e.g., system packages, network access).                                |
| `metadata`      | No       | Arbitrary key-value mapping for client-specific data.                                            |
| `allowed-tools` | No       | (Experimental) List of pre-approved tools the skill may use.                                     |

**Example:**

```yaml
---
name: pdf-processing
description:
  Extracts text and tables from PDF files. Use when the user mentions PDFs or
  document extraction.
license: Apache-2.0
metadata:
  author: example-org
  version: '1.0'
---
# PDF Processing Instructions
```

### 2.2 Body Content

The Markdown body following the frontmatter contains the procedural knowledge
for the agent. It is recommended to include:

- Step-by-step instructions.
- Example inputs and outputs.
- Edge cases and error handling guidance.

## 3. Resource Management

### 3.1 Optional Directories

- **scripts/**: Executable logic (e.g., `scripts/extract.py`). Agents should
  document dependencies.
- **references/**: Deep-dive documentation (e.g., `references/API.md`) to avoid
  cluttering the main `SKILL.md`.
- **assets/**: Static files like templates or schemas.

### 3.2 File References

Within `SKILL.md`, reference bundled files using relative paths from the skill
root (e.g., `[Reference](references/GUIDE.md)`).

## 4. Lifecycle & Progressive Disclosure

Agents manage skills through three phases to optimize context usage:

1.  **Discovery**: At startup, the agent scans configured directories for
    `SKILL.md` files.
2.  **Indexing (Metadata Load)**: The agent parses only the `name` and
    `description` of every discovered skill and injects them into the system
    prompt (typically ~100 tokens per skill).
3.  **Activation**: When the agent identifies a task matching a skill's
    description, it "activates" the skill by reading the full content of
    `SKILL.md` into the conversation context.
4.  **Execution**: The agent follows the instructions, optionally reading
    specific reference files or executing scripts as needed.

## 5. Implementation for Tools

### 5.1 Filesystem-based Integration

For agents with shell access (e.g., Claude Code, Goose), skills are discovered
via path configuration. Metadata is injected into the system prompt with a
`location` field pointing to the absolute path of `SKILL.md`. The model
activates the skill using standard shell commands (e.g., `cat`).

### 5.2 Tool-based Integration

For agents without direct filesystem access, the host application provides tools
to:

- List available skill metadata.
- Read the instructions for a specific skill.
- Access or execute bundled resources.

### 5.3 Context Injection Example (XML)

It is recommended to provide metadata to the model in a structured format:

```xml
<available_skills>
  <skill>
    <name>pdf-processing</name>
    <description>Extracts text and tables from PDF files.</description>
    <location>/absolute/path/to/pdf-processing/SKILL.md</location>
  </skill>
</available_skills>
```

## 6. Security & Safety

- **Sandboxing**: Scripts should be executed in isolated environments.
- **Confirmation**: High-risk operations (e.g., modifying files, network access)
  should require user approval.
- **Auditability**: All skill activations and script executions should be
  logged.
