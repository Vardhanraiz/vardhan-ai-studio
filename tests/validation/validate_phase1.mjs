import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const REQUIRED_DIRS = [
  "frontend/src/components",
  "frontend/src/pages",
  "frontend/src/layouts",
  "frontend/src/hooks",
  "frontend/src/services",
  "frontend/src/editor",
  "frontend/src/styles",
  "backend/app/api",
  "backend/app/core",
  "backend/app/models",
  "backend/app/schemas",
  "backend/app/services",
  "backend/app/agents",
  "backend/app/tools",
  "backend/app/database",
  "backend/app/security",
  "workspace",
  "tests/backend",
  "tests/frontend",
  "tests/validation",
  "docs",
  "scripts",
];

const REQUIRED_FILES = [
  "README.md",
  ".gitignore",
  ".env.example",
  "docs/PHASE_1_ENV_REPORT.md",
  "scripts/check_env.ps1",
];

test("Phase 1: all required architecture directories exist", () => {
  for (const relDir of REQUIRED_DIRS) {
    const fullPath = path.join(PROJECT_ROOT, relDir);
    assert.ok(fs.existsSync(fullPath), `Missing directory: ${relDir}`);
    assert.ok(fs.statSync(fullPath).isDirectory(), `Expected directory: ${relDir}`);
  }
});

test("Phase 1: required root and documentation files exist and are non-empty", () => {
  for (const relFile of REQUIRED_FILES) {
    const fullPath = path.join(PROJECT_ROOT, relFile);
    assert.ok(fs.existsSync(fullPath), `Missing file: ${relFile}`);
    const content = fs.readFileSync(fullPath, "utf8").trim();
    assert.ok(content.length > 0, `File is empty: ${relFile}`);
  }
});

test("Phase 1: .env.example configures local-first defaults without live secrets", () => {
  const envExample = fs.readFileSync(path.join(PROJECT_ROOT, ".env.example"), "utf8");
  assert.match(envExample, /AI_PROVIDER=ollama/);
  assert.match(envExample, /OLLAMA_DEFAULT_MODEL=qwen2\.5-coder:1\.5b/);
  assert.match(envExample, /DATABASE_URL=sqlite:/);
  assert.match(envExample, /WORKSPACE_ROOT=\.\/workspace/);
  assert.match(envExample, /OPENAI_COMPAT_API_KEY=\s*$/m);
});

test("Phase 1: .gitignore protects secrets, dependencies, databases, and workspace contents", () => {
  const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, ".gitignore"), "utf8");
  for (const pattern of [".env", "node_modules/", ".venv/", "__pycache__/", "*.db", "workspace/*"]) {
    assert.ok(gitignore.includes(pattern), `.gitignore missing pattern: ${pattern}`);
  }
});

test("Phase 1: README documents hardware constraints, prerequisites, and roadmap", () => {
  const readme = fs.readFileSync(path.join(PROJECT_ROOT, "README.md"), "utf8");
  assert.match(readme, /Vardhan AI Studio/);
  assert.match(readme, /8 GB RAM/);
  assert.match(readme, /qwen2\.5-coder:1\.5b/);
  assert.match(readme, /Phase 1/);
  assert.match(readme, /Phase 16/);
});
