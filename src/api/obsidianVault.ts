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

export interface VaultPrivateNoteSummary {
  id: string;
  title: string;
  summary: string;
  sourcePath: string;
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

interface PrivateNoteEntry {
  employeeName: string;
  title: string;
  summary: string;
  details: string;
  tags?: string[];
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
    .filter((line) => line && !line.startsWith('#'));

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

export class ObsidianVault {
  readonly rootPath: string;
  readonly playbookPath: string;
  readonly playbookProposalPath: string;
  readonly knowledgePath: string;
  readonly sharedKnowledgePath: string;
  readonly privateDeskPath: string;
  readonly agentLogsPath: string;
  readonly emailPath: string;
  readonly emailInboxPath: string;
  readonly emailProcessedPath: string;
  readonly emailSentPath: string;

  constructor(rootPath = DEFAULT_VAULT_ROOT) {
    this.rootPath = rootPath;
    this.playbookPath = join(rootPath, 'Playbook');
    this.playbookProposalPath = join(this.playbookPath, 'Proposals');
    this.knowledgePath = join(rootPath, 'Knowledge Base');
    this.sharedKnowledgePath = join(this.knowledgePath, 'Shared Knowledge');
    this.privateDeskPath = join(rootPath, 'Private Desks');
    this.agentLogsPath = join(rootPath, 'Agent Logs');
    this.emailPath = join(rootPath, 'Email Simulator');
    this.emailInboxPath = join(this.emailPath, 'Inbox');
    this.emailProcessedPath = join(this.emailPath, 'Processed Inbox');
    this.emailSentPath = join(this.emailPath, 'Sent');
    this.ensureStructure();
  }

  ensureStructure() {
    ensureDir(this.rootPath);
    ensureDir(this.playbookPath);
    ensureDir(this.playbookProposalPath);
    ensureDir(this.knowledgePath);
    ensureDir(this.sharedKnowledgePath);
    ensureDir(this.privateDeskPath);
    ensureDir(this.agentLogsPath);
    ensureDir(this.emailPath);
    ensureDir(this.emailInboxPath);
    ensureDir(this.emailProcessedPath);
    ensureDir(this.emailSentPath);
  }

  ensureEmployeeWorkspace(employeeName: string) {
    ensureDir(join(this.privateDeskPath, employeeName));
    ensureDir(join(this.agentLogsPath, employeeName));
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

  appendAgentLog(entry: AgentLogEntry) {
    this.ensureEmployeeWorkspace(entry.employeeName);
    const employeeDir = join(this.agentLogsPath, entry.employeeName);
    const dailyPath = join(employeeDir, `${new Date().toISOString().slice(0, 10)}.md`);
    appendMarkdownSection(dailyPath, `${new Date().toISOString()} — ${entry.heading}`, entry.body, `${entry.employeeName} Log`);
  }

  loadPrivateNoteSummaries(employeeName: string, limit = 6) {
    const employeeDir = join(this.privateDeskPath, employeeName);
    const files = listMarkdownFiles(employeeDir).slice(0, limit);

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      return {
        id: slugify(`${employeeName}-${title}`),
        title,
        summary: extractSummary(content),
        sourcePath: path,
      } satisfies VaultPrivateNoteSummary;
    });
  }

  appendPrivateNote(entry: PrivateNoteEntry) {
    this.ensureEmployeeWorkspace(entry.employeeName);
    const employeeDir = join(this.privateDeskPath, entry.employeeName);
    const notePath = join(employeeDir, `${slugify(entry.title)}.md`);
    const tags = entry.tags?.length ? `\nTags: ${entry.tags.join(', ')}` : '';
    const body = [
      `Summary: ${entry.summary}`,
      tags,
      '',
      entry.details,
    ]
      .filter(Boolean)
      .join('\n');
    appendMarkdownSection(notePath, `${new Date().toISOString()} — ${entry.title}`, body, entry.title);
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
