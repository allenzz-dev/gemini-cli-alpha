# Plan: Implement Agent Skills Specification

This plan outlines the implementation of the
[Agent Skills Specification](SkillSpecification.md) within Gemini CLI.

## 1. Goal

Enable Gemini CLI to discover, index, and activate "Agent Skills" (specialized
knowledge and procedural instructions bundled in a directory with a `SKILL.md`
file).

## 2. Technical Overview

### 2.1 Skill Discovery

We will implement a `SkillDiscoveryService` responsible for:

- Scanning configured directories for skills.
- Detecting a skill: A directory containing a `SKILL.md` file.
- Parsing `SKILL.md` frontmatter (YAML) for `name` and `description`.
- Default discovery paths:
  - `${CWD}/.gemini/skills/`
  - `${HOME}/.gemini/skills/`

### 2.2 Indexing (Metadata Injection)

Metadata for all discovered skills will be injected into the system prompt of
the **main agent**.

- **Format**: XML as recommended by the spec.
  ```xml
  <available_skills>
    <skill>
      <name>skill-name</name>
      <description>Skill description...</description>
      <location>/absolute/path/to/skill-name/SKILL.md</location>
    </skill>
  </available_skills>
  ```
- **Injection Point**: `packages/core/src/core/prompts.ts`:
  `getCoreSystemPrompt`.

### 2.3 Activation & Execution

- **Activation**: The agent identifies a relevant skill from the metadata and
  "activates" it by reading the `SKILL.md` file using `read_file`.
- **Execution**: The agent follows instructions in `SKILL.md`. It may use
  existing tools like `read_file` or `run_shell_command` to access resources
  (`scripts/`, `references/`, `assets/`) mentioned in the instructions.

## 3. Implementation Checklist

### Phase 1: Infrastructure

- [x] **Add Dependency**: Add `js-yaml` to `packages/core` to parse `SKILL.md`
      frontmatter.
- [x] **Create `SkillDiscoveryService`**:
  - Location: `packages/core/src/services/skillDiscoveryService.ts`.
  - Functionality: `discoverSkills(paths: string[]): Promise<SkillMetadata[]>`.
- [x] **Update `Config`**:
  - Add `SkillDiscoveryService` to `Config`.
  - Initialize discovery in `Config.initialize()`.
  - Store discovered skills in `Config`.

### Phase 2: System Prompt Updates

- [x] **Update `getCoreSystemPrompt`**:
  - Append `<available_skills>` section to the base prompt for the main agent.

### Phase 3: Verification

- [x] **Unit Tests**:
  - [x] Test `SkillDiscoveryService` with various directory structures and YAML
        frontmatter.
  - [x] Test `getCoreSystemPrompt` to ensure XML injection is correct and
        handled properly when no skills are found.
- [x] **Manual Verification (Interactive)**:
  - [x] Create a dummy skill in `.gemini/skills/`.
  - [x] Run the CLI and verify the agent can see and "activate" the skill.
- [x] **Headless Verification (Non-Interactive)**:
  - [x] Run the system in non-interactive mode (without `--interactive`).
  - [x] Ensure YOLO mode is disabled (default).
  - [x] Validate that the agent can still discover and use skills to answer
        prompts.

## 4. Things to Cross-check

- [ ] **Path handling**: Ensure absolute paths are used for `location` in the
      XML, especially when running in a sandbox.
- [ ] **Performance**: Ensure skill discovery doesn't significantly slow down
      CLI startup (limit search depth).
- [ ] **Security**: Skills might contain scripts. Ensure the model follows
      standard confirmation procedures for shell execution.
- [ ] **Extensions**: Acknowledge that while extensions can bundle skills, it is
      out of scope for this initial implementation.
- [ ] **Subagents**: Implementation is explicitly excluded for subagents in this
      phase.
