import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VaultPlaybookRule {
  id: string;
  title: string;
  summary: string;
  sourcePath: string;
}

export interface VaultKnowledgeSummary {
  id: string;
  title: string;
  summary: string;
  sourcePath: string;
}

export interface VaultAgentMemorySummary {
  id: string;
  title: string;
  summary: string;
  sourcePath: string;
  createdAt: string;
  tags: string[];
}

export interface VaultAgentLiveMemory {
  sourcePath: string;
  updatedAt: string | null;
  status: string;
  focus: string;
  objective: string;
  checklist: string[];
  openLoops: string[];
  recentContext: string[];
}

export interface VaultEmail {
  id: string;
  title: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  summary: string;
  sourcePath: string;
}

interface AgentLogEntry {
  employeeName: string;
  heading: string;
  body: string;
}

interface SharedKnowledgeEntry {
  title: string;
  summary: string;
  details: string;
  sourceEmployee: string;
  tags?: string[];
}

interface PlaybookProposalEntry {
  title: string;
  context: string;
  recommendation: string;
  sourceEmployee: string;
}

interface AgentMemoryEntry {
  employeeName: string;
  title: string;
  summary: string;
  details: string;
  kind: string;
  tags?: string[];
  referenceId?: string | null;
  importance?: number;
  relatedLocationId?: string | null;
  relatedEmployeeName?: string | null;
}

interface TerminalEventEntry {
  title: string;
  summary: string;
  fromEmployee: string;
  priority: string;
}

interface SentEmailEntry {
  subject: string;
  to: string;
  from: string;
  body: string;
  sentBy: string;
  sourceEmailId?: string | null;
}

interface LiveMemoryEntry {
  employeeName: string;
  status: string;
  focus: string;
  objective: string;
  checklist: string[];
  openLoops: string[];
  recentContext?: string[];
}

const DEFAULT_VAULT_ROOT = fileURLToPath(new URL("../../the archives/No man's AI", import.meta.url));

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function fileExists(path: string) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function dirExists(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

function writeText(path: string, content: string) {
  writeFileSync(path, content, 'utf8');
}

function appendMarkdownSection(path: string, heading: string, body: string, fileTitle = basename(path, extname(path))) {
  const section = `\n## ${heading}\n${body.trim()}\n`;
  if (!fileExists(path)) {
    writeText(path, `# ${fileTitle}\n${section}`);
    return;
  }

  const current = readText(path).trimEnd();
  writeText(path, `${current}${section}`);
}

function listMarkdownFiles(path: string) {
  if (!dirExists(path)) {
    return [] as string[];
  }

  return readdirSync(path)
    .map((entry) => join(path, entry))
    .filter((entry) => fileExists(entry) && extname(entry).toLowerCase() === '.md')
    .sort();
}

function extractTitle(content: string, fallback: string) {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  return headingMatch?.[1]?.trim() || fallback;
}

function extractSummary(content: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('---') && !line.includes(':'));

  return lines.slice(0, 3).join(' ').slice(0, 280) || 'No summary available.';
}

function extractField(content: string, field: string) {
  const match = content.match(new RegExp(`^${field}:\\s*(.+)$`, 'mi'));
  return match?.[1]?.trim() ?? '';
}

function stripMetadata(content: string) {
  return content
    .split('\n')
    .filter((line) => !/^(from|to|subject|tags|source):/i.test(line.trim()))
    .join('\n')
    .trim();
}

function splitFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return {
      frontmatter: '',
      body: normalized,
    };
  }

  const endIndex = normalized.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return {
      frontmatter: '',
      body: normalized,
    };
  }

  return {
    frontmatter: normalized.slice(4, endIndex),
    body: normalized.slice(endIndex + 5),
  };
}

function extractFrontmatterField(content: string, field: string) {
  const { frontmatter } = splitFrontmatter(content);
  return extractField(frontmatter, field);
}

function extractFrontmatterList(content: string, field: string) {
  const raw = extractFrontmatterField(content, field);
  if (!raw) {
    return [] as string[];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSection(content: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^##\\s+${escapedHeading}\\n([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function extractChecklist(section: string) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- \[[ x]\]/i.test(line))
    .slice(0, 6);
}

function extractBullets(section: string) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .slice(0, 6);
}

function formatFrontmatter(fields: Record<string, string | number | null | undefined>) {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
  return ['---', ...lines, '---', ''].join('\n');
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreQuery(text: string, tokens: string[]) {
  const haystack = text.toLowerCase();
  return tokens.reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
}

export class ObsidianVault {
  readonly rootPath: string;
  readonly agentsPath: string;
  readonly playbookPath: string;
  readonly playbookProposalPath: string;
  readonly knowledgePath: string;
  readonly sharedKnowledgePath: string;
  readonly emailPath: string;
  readonly emailInboxPath: string;
  readonly emailProcessedPath: string;
  readonly emailSentPath: string;

  constructor(rootPath = DEFAULT_VAULT_ROOT) {
    this.rootPath = rootPath;
    this.agentsPath = join(rootPath, 'Agents');
    this.playbookPath = join(rootPath, 'Playbook');
    this.playbookProposalPath = join(this.playbookPath, 'Proposals');
    this.knowledgePath = join(rootPath, 'Knowledge Base');
    this.sharedKnowledgePath = join(this.knowledgePath, 'Shared Knowledge');
    this.emailPath = join(rootPath, 'Email Simulator');
    this.emailInboxPath = join(this.emailPath, 'Inbox');
    this.emailProcessedPath = join(this.emailPath, 'Processed Inbox');
    this.emailSentPath = join(this.emailPath, 'Sent');
    this.ensureStructure();
  }

  private employeeWorkspacePath(employeeName: string) {
    return join(this.agentsPath, employeeName);
  }

  private agentLogPath(employeeName: string) {
    return join(this.employeeWorkspacePath(employeeName), 'agent-log');
  }

  private liveMemoryPath(employeeName: string) {
    return join(this.employeeWorkspacePath(employeeName), 'live-memory.md');
  }

  private longTermMemoryPath(employeeName: string) {
    return join(this.employeeWorkspacePath(employeeName), 'long-term-memory');
  }

  private legacyNotesPath(employeeName: string) {
    return join(this.employeeWorkspacePath(employeeName), 'legacy-notes');
  }

  ensureStructure() {
    ensureDir(this.rootPath);
    ensureDir(this.agentsPath);
    ensureDir(this.playbookPath);
    ensureDir(this.playbookProposalPath);
    ensureDir(this.knowledgePath);
    ensureDir(this.sharedKnowledgePath);
    ensureDir(this.emailPath);
    ensureDir(this.emailInboxPath);
    ensureDir(this.emailProcessedPath);
    ensureDir(this.emailSentPath);
  }

  ensureEmployeeWorkspace(employeeName: string) {
    ensureDir(this.employeeWorkspacePath(employeeName));
    ensureDir(this.agentLogPath(employeeName));
    ensureDir(this.longTermMemoryPath(employeeName));
    ensureDir(this.legacyNotesPath(employeeName));

    const liveMemoryPath = this.liveMemoryPath(employeeName);
    if (!fileExists(liveMemoryPath)) {
      this.writeAgentLiveMemory({
        employeeName,
        status: 'idle',
        focus: 'Awaiting the next concrete task.',
        objective: 'No active plan.',
        checklist: [],
        openLoops: [],
        recentContext: [],
      });
    }
  }

  loadPlaybookRules() {
    const files = listMarkdownFiles(this.playbookPath).filter((path) => !path.includes(`${this.playbookProposalPath}`));

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      return {
        id: slugify(title),
        title,
        summary: extractSummary(content),
        sourcePath: path,
      } satisfies VaultPlaybookRule;
    });
  }

  loadKnowledgeSummaries(limit = 8) {
    const directories = [this.knowledgePath, this.sharedKnowledgePath];
    const files = directories.flatMap((directory) => listMarkdownFiles(directory)).slice(0, limit);

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      return {
        id: slugify(title),
        title,
        summary: extractSummary(content),
        sourcePath: path,
      } satisfies VaultKnowledgeSummary;
    });
  }

  loadAgentLiveMemory(employeeName: string): VaultAgentLiveMemory {
    this.ensureEmployeeWorkspace(employeeName);
    const sourcePath = this.liveMemoryPath(employeeName);
    const content = readText(sourcePath);
    return {
      sourcePath,
      updatedAt: extractFrontmatterField(content, 'updated_at') || null,
      status: extractFrontmatterField(content, 'status') || 'idle',
      focus: extractSection(content, 'Focus') || 'Awaiting the next concrete task.',
      objective: extractSection(content, 'Objective') || 'No active plan.',
      checklist: extractChecklist(extractSection(content, 'Checklist')),
      openLoops: extractBullets(extractSection(content, 'Open Loops')),
      recentContext: extractBullets(extractSection(content, 'Recent Context')),
    };
  }

  writeAgentLiveMemory(entry: LiveMemoryEntry) {
    ensureDir(this.employeeWorkspacePath(entry.employeeName));
    ensureDir(this.agentLogPath(entry.employeeName));
    ensureDir(this.longTermMemoryPath(entry.employeeName));
    ensureDir(this.legacyNotesPath(entry.employeeName));
    const path = this.liveMemoryPath(entry.employeeName);
    const content = [
      formatFrontmatter({
        type: 'agent_live_memory',
        agent: entry.employeeName,
        updated_at: new Date().toISOString(),
        status: entry.status,
      }),
      `# ${entry.employeeName} Live Memory`,
      '',
      '## Focus',
      entry.focus.trim() || 'Awaiting the next concrete task.',
      '',
      '## Objective',
      entry.objective.trim() || 'No active plan.',
      '',
      '## Checklist',
      ...(entry.checklist.length > 0 ? entry.checklist.map((item) => (item.startsWith('- ') ? item : `- ${item}`)) : ['- none']),
      '',
      '## Open Loops',
      ...(entry.openLoops.length > 0 ? entry.openLoops.map((item) => `- ${item}`) : ['- none']),
      '',
      '## Recent Context',
      ...(entry.recentContext && entry.recentContext.length > 0 ? entry.recentContext.map((item) => `- ${item}`) : ['- none']),
      '',
    ].join('\n');
    writeText(path, content);
  }

  countAgentMemories(employeeName: string) {
    this.ensureEmployeeWorkspace(employeeName);
    return listMarkdownFiles(this.longTermMemoryPath(employeeName)).length;
  }

  searchAgentMemories(employeeName: string, query: string, limit = 6) {
    this.ensureEmployeeWorkspace(employeeName);
    const files = listMarkdownFiles(this.longTermMemoryPath(employeeName));
    const tokens = tokenize(query);

    const ranked = files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      const summary = extractSection(content, 'Summary') || extractSummary(content);
      const body = extractSection(content, 'Details') || splitFrontmatter(content).body;
      const tags = extractFrontmatterList(content, 'tags');
      const createdAt = extractFrontmatterField(content, 'created_at') || '';
      const score =
        scoreQuery(title, tokens) * 4 +
        scoreQuery(summary, tokens) * 3 +
        scoreQuery(tags.join(' '), tokens) * 3 +
        scoreQuery(body, tokens);

      return {
        id: slugify(`${employeeName}-${title}-${createdAt}`),
        title,
        summary: summary.slice(0, 280) || 'No summary available.',
        sourcePath: path,
        createdAt,
        tags,
        score,
      } satisfies VaultAgentMemorySummary & { score: number };
    });

    const filtered = tokens.length > 0 ? ranked.filter((item) => item.score > 0) : ranked;

    return filtered
      .sort((left, right) => right.score - left.score || right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map(({ score: _score, ...item }) => item);
  }

  appendAgentLog(entry: AgentLogEntry) {
    this.ensureEmployeeWorkspace(entry.employeeName);
    const employeeDir = this.agentLogPath(entry.employeeName);
    const dailyPath = join(employeeDir, `${new Date().toISOString().slice(0, 10)}.md`);
    appendMarkdownSection(dailyPath, `${new Date().toISOString()} — ${entry.heading}`, entry.body, `${entry.employeeName} Log`);
  }

  appendAgentMemory(entry: AgentMemoryEntry) {
    this.ensureEmployeeWorkspace(entry.employeeName);
    const timestamp = new Date().toISOString();
    const notePath = join(this.longTermMemoryPath(entry.employeeName), `${timestamp.replace(/[:]/g, '-')}-${slugify(entry.title)}.md`);
    const content = [
      formatFrontmatter({
        type: 'agent_memory',
        agent: entry.employeeName,
        kind: entry.kind,
        created_at: timestamp,
        importance: entry.importance ?? 1,
        reference_id: entry.referenceId ?? '',
        related_location: entry.relatedLocationId ?? '',
        related_employee: entry.relatedEmployeeName ?? '',
        tags: (entry.tags ?? []).join(', '),
      }),
      `# ${entry.title}`,
      '',
      '## Summary',
      entry.summary.trim(),
      '',
      '## Details',
      entry.details.trim(),
      '',
    ].join('\n');
    writeText(notePath, content);
  }

  appendPrivateNote(entry: {
    employeeName: string;
    title: string;
    summary: string;
    details: string;
    tags?: string[];
  }) {
    this.appendAgentMemory({
      employeeName: entry.employeeName,
      title: entry.title,
      summary: entry.summary,
      details: entry.details,
      tags: entry.tags,
      kind: 'note',
      importance: 2,
    });
  }

  loadPrivateNoteSummaries(employeeName: string, limit = 6) {
    return this.searchAgentMemories(employeeName, '', limit);
  }

  appendSharedKnowledge(entry: SharedKnowledgeEntry) {
    const notePath = join(this.sharedKnowledgePath, `${slugify(entry.title)}.md`);
    const tags = entry.tags?.length ? `\nTags: ${entry.tags.join(', ')}` : '';
    const body = [
      `Summary: ${entry.summary}`,
      `Source: ${entry.sourceEmployee}`,
      tags,
      '',
      entry.details,
    ]
      .filter(Boolean)
      .join('\n');
    appendMarkdownSection(notePath, `${new Date().toISOString()} — ${entry.title}`, body, entry.title);
  }

  upsertPlaybookProposal(entry: PlaybookProposalEntry) {
    const notePath = join(this.playbookProposalPath, `${slugify(entry.title)}.md`);
    const body = [
      `Source: ${entry.sourceEmployee}`,
      '',
      '### Context',
      entry.context,
      '',
      '### Recommended Rule',
      entry.recommendation,
    ].join('\n');
    appendMarkdownSection(notePath, `${new Date().toISOString()} — Proposal`, body, entry.title);
  }

  appendTerminalEvent(entry: TerminalEventEntry) {
    const notePath = join(this.knowledgePath, 'Red Terminal Events.md');
    const body = [
      `Priority: ${entry.priority}`,
      `From: ${entry.fromEmployee}`,
      '',
      entry.summary,
    ].join('\n');
    appendMarkdownSection(notePath, `${new Date().toISOString()} — ${entry.title}`, body);
  }

  loadInboxEmails(limit = 12) {
    const files = listMarkdownFiles(this.emailInboxPath).slice(0, limit);

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      const subject = extractField(content, 'Subject') || title;
      const from = extractField(content, 'From') || 'unknown@example.com';
      const to = extractField(content, 'To') || 'office@no-mans-ai.local';
      const body = stripMetadata(content);

      return {
        id: slugify(`${basename(path, '.md')}-${subject}`),
        title,
        subject,
        from,
        to,
        body,
        summary: extractSummary(content),
        sourcePath: path,
      } satisfies VaultEmail;
    });
  }

  loadSentEmails(limit = 24) {
    const files = listMarkdownFiles(this.emailSentPath).slice(-limit);

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      const subject = extractField(content, 'Subject') || title;
      const from = extractField(content, 'From') || 'office@no-mans-ai.local';
      const to = extractField(content, 'To') || 'unknown@example.com';
      const body = stripMetadata(content);

      return {
        id: slugify(`${basename(path, '.md')}-${subject}`),
        title,
        subject,
        from,
        to,
        body,
        summary: extractSummary(content),
        sourcePath: path,
      } satisfies VaultEmail;
    });
  }

  appendSentEmail(entry: SentEmailEntry) {
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const notePath = join(this.emailSentPath, `${timestamp}-${slugify(entry.subject)}.md`);
    const content = [
      `# ${entry.subject}`,
      `From: ${entry.from}`,
      `To: ${entry.to}`,
      `Source: ${entry.sentBy}`,
      entry.sourceEmailId ? `Tags: sent, ${entry.sourceEmailId}` : 'Tags: sent',
      '',
      entry.body.trim(),
      '',
    ].join('\n');
    writeText(notePath, content);
  }

  markInboxEmailProcessed(email: VaultEmail) {
    const sourcePath = email.sourcePath;
    if (!fileExists(sourcePath)) {
      return;
    }

    const destinationPath = join(this.emailProcessedPath, basename(sourcePath));
    renameSync(sourcePath, destinationPath);
  }
}

export function createObsidianVault(rootPath?: string) {
  return new ObsidianVault(rootPath);
}
