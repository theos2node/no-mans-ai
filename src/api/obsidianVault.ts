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
  fromName: string;
  from: string;
  toName: string;
  to: string;
  body: string;
  summary: string;
  sourcePath: string;
  updatedAt: string;
}

export type VaultOfficeSystemKind = 'backlog' | 'client' | 'project' | 'finance' | 'internal_note';

export interface VaultOfficeSystemRecord {
  id: string;
  kind: VaultOfficeSystemKind;
  title: string;
  summary: string;
  status: string;
  priority: string;
  owner: string;
  lane: string;
  locationId: string;
  tags: string[];
  checklist: string[];
  sourcePath: string;
  updatedAt: string;
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

interface StoredAgentMemoryEntry extends AgentMemoryEntry {
  sourcePath: string;
  createdAt: string;
  updatedAt: string | null;
  occurrences: number;
}

interface TerminalEventEntry {
  title: string;
  summary: string;
  fromEmployee: string;
  priority: string;
}

interface SentEmailEntry {
  subject: string;
  toName: string;
  to: string;
  fromName: string;
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

interface OfficeSeedEntry {
  fileName: string;
  content: string;
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

function appendUniqueMarkdownSection(
  path: string,
  heading: string,
  body: string,
  fileTitle = basename(path, extname(path)),
  dedupeKey?: string,
) {
  const normalizedMarker = normalizeMemoryText(dedupeKey ?? body);
  if (normalizedMarker && fileExists(path)) {
    const current = normalizeMemoryText(readText(path));
    if (current.includes(normalizedMarker)) {
      return false;
    }
  }

  appendMarkdownSection(path, heading, body, fileTitle);
  return true;
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

function listRecentMarkdownFiles(path: string, limit: number) {
  return listMarkdownFiles(path).slice(-limit).reverse();
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
  const lines = content.split('\n');
  const filtered = lines.filter((line, index) => {
    const trimmed = line.trim();
    if (index === 0 && /^#\s+/i.test(trimmed)) {
      return false;
    }

    return !/^(from|to|subject|tags|source):/i.test(trimmed);
  });

  return filtered.join('\n').trim();
}

function inferNameFromEmail(email: string) {
  const localPart = email.split('@')[0]?.trim() ?? '';
  return localPart.replace(/[._-]+/g, ' ').trim() || 'Unknown sender';
}

function parseMailbox(value: string, fallbackEmail: string) {
  const normalized = value.trim();
  const mailboxMatch = normalized.match(/^(.*?)<([^>]+)>$/);
  if (mailboxMatch) {
    const name = mailboxMatch[1]?.trim().replace(/^"|"$/g, '') || inferNameFromEmail(mailboxMatch[2] ?? fallbackEmail);
    const email = mailboxMatch[2]?.trim() || fallbackEmail;
    return { name, email };
  }

  if (normalized.includes('@')) {
    return {
      name: inferNameFromEmail(normalized),
      email: normalized,
    };
  }

  return {
    name: normalized || inferNameFromEmail(fallbackEmail),
    email: fallbackEmail,
  };
}

function formatMailbox(name: string, email: string) {
  const normalizedName = name.trim();
  const normalizedEmail = email.trim();
  return normalizedName ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;
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

function normalizeMemoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapRatio(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

const AGENT_MEMORY_SEARCH_WINDOW = 320;
const AGENT_MEMORY_INDEX_WINDOW = 240;

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
  readonly officeSystemsPath: string;
  readonly officeBacklogPath: string;
  readonly officeClientsPath: string;
  readonly officeProjectsPath: string;
  readonly officeFinancePath: string;
  readonly officeNotesPath: string;

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
    this.officeSystemsPath = join(rootPath, 'Office Systems');
    this.officeBacklogPath = join(this.officeSystemsPath, 'Backlog');
    this.officeClientsPath = join(this.officeSystemsPath, 'Clients');
    this.officeProjectsPath = join(this.officeSystemsPath, 'Projects');
    this.officeFinancePath = join(this.officeSystemsPath, 'Finance');
    this.officeNotesPath = join(this.officeSystemsPath, 'Internal Notes');
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

  private officeSeedsForPath(path: string): OfficeSeedEntry[] {
    if (path === this.officeBacklogPath) {
      return [
        {
          fileName: 'implementation-lane-audit.md',
          content: [
            formatFrontmatter({
              type: 'office_backlog',
              status: 'active',
              priority: 'high',
              owner: 'Sam',
              lane: 'implementation',
              location: 'react-c',
              tags: 'implementation, coverage, frontend',
            }),
            '# Implementation lane audit',
            '',
            '## Overview',
            'React coverage needs a cleaner handoff between active customer work and internal implementation passes.',
            '',
            '## Checklist',
            '- [ ] Refresh the current implementation packet.',
            '- [ ] Review recent office notes for repeated blockers.',
            '- [ ] Propose the next implementation direction.',
            '',
            '## Handoff',
            'Keep the next pass small and visible so the other desk can pick it up without a reset.',
            '',
          ].join('\n'),
        },
        {
          fileName: 'customer-follow-up-gap.md',
          content: [
            formatFrontmatter({
              type: 'office_backlog',
              status: 'active',
              priority: 'medium',
              owner: 'Jeremy',
              lane: 'service',
              location: 'customer-relations',
              tags: 'customer, follow-up, response',
            }),
            '# Customer follow-up gap',
            '',
            '## Overview',
            'The office needs a repeatable follow-up packet for new signups and delivery updates while the service desk is unstaffed.',
            '',
            '## Checklist',
            '- [ ] Review recent customer-facing email outcomes.',
            '- [ ] Draft a standard follow-up rhythm.',
            '- [ ] Flag where a second opinion helps.',
            '',
            '## Handoff',
            'A reusable response rhythm matters more than speed on this packet.',
            '',
          ].join('\n'),
        },
        {
          fileName: 'coverage-playbook-cleanup.md',
          content: [
            formatFrontmatter({
              type: 'office_backlog',
              status: 'review',
              priority: 'medium',
              owner: 'Shared',
              lane: 'operations',
              location: 'war-room',
              tags: 'leadership, process, review',
            }),
            '# Coverage playbook cleanup',
            '',
            '## Overview',
            'Temporary office coverage rules are accumulating, and the latest version needs consolidation into one durable playbook.',
            '',
            '## Checklist',
            '- [ ] Compare the latest coverage notes.',
            '- [ ] Remove duplicate guidance.',
            '- [ ] Record the clean version for future shifts.',
            '',
            '## Handoff',
            'Do not rewrite the whole playbook if only one section changed.',
            '',
          ].join('\n'),
        },
      ];
    }

    if (path === this.officeClientsPath) {
      return [
        {
          fileName: 'northstar-outfitters.md',
          content: [
            formatFrontmatter({
              type: 'office_client',
              status: 'active',
              priority: 'high',
              owner: 'Customer Relations',
              lane: 'service',
              location: 'customer-relations',
              tags: 'client, shipping, onboarding',
            }),
            '# Northstar Outfitters',
            '',
            '## Overview',
            'Northstar Outfitters is waiting on a cleaner onboarding and delivery-update cadence after account creation.',
            '',
            '## Checklist',
            '- [ ] Review the latest welcome and delivery language.',
            '- [ ] Confirm response timing expectations.',
            '- [ ] Capture any exceptions for the next office pass.',
            '',
          ].join('\n'),
        },
        {
          fileName: 'signal-harbor.md',
          content: [
            formatFrontmatter({
              type: 'office_client',
              status: 'watch',
              priority: 'medium',
              owner: 'Shared',
              lane: 'service',
              location: 'customer-relations',
              tags: 'client, retention, support',
            }),
            '# Signal Harbor',
            '',
            '## Overview',
            'Signal Harbor has been stable, but the office wants a clearer retention note in case support volume spikes again.',
            '',
            '## Checklist',
            '- [ ] Review prior support tone.',
            '- [ ] Note any missing customer promises.',
            '- [ ] Keep a quick retention response ready.',
            '',
          ].join('\n'),
        },
      ];
    }

    if (path === this.officeProjectsPath) {
      return [
        {
          fileName: 'office-response-playbook.md',
          content: [
            formatFrontmatter({
              type: 'office_project',
              status: 'active',
              priority: 'high',
              owner: 'Sam',
              lane: 'implementation',
              location: 'react-c',
              tags: 'project, playbook, implementation',
            }),
            '# Office response playbook',
            '',
            '## Overview',
            'Build a stable internal response playbook so email, review requests, and handoffs feel like one office system.',
            '',
            '## Checklist',
            '- [ ] Review recent workflow reflections.',
            '- [ ] Fold the best habits into one project direction.',
            '- [ ] Share the next iteration with the other desk.',
            '',
          ].join('\n'),
        },
        {
          fileName: 'desk-pc-surface-pass.md',
          content: [
            formatFrontmatter({
              type: 'office_project',
              status: 'active',
              priority: 'medium',
              owner: 'Jeremy',
              lane: 'implementation',
              location: 'react-d',
              tags: 'project, tooling, desk-pc',
            }),
            '# Desk PC surface pass',
            '',
            '## Overview',
            'The desk PC should expose the office systems directly so workers can browse tasks, clients, finance packets, and notes without leaving the desk.',
            '',
            '## Checklist',
            '- [ ] Audit what the desk PC already shows.',
            '- [ ] Keep the layout lightweight.',
            '- [ ] Make the office artifacts easy to scan.',
            '',
          ].join('\n'),
        },
      ];
    }

    if (path === this.officeFinancePath) {
      return [
        {
          fileName: 'refund-watch.md',
          content: [
            formatFrontmatter({
              type: 'office_finance',
              status: 'review',
              priority: 'high',
              owner: 'Coordinator',
              lane: 'finance',
              location: 'coordinator',
              tags: 'finance, refund, reconciliation',
            }),
            '# Refund watch',
            '',
            '## Overview',
            'A small set of customer promises may create refund pressure if response timing slips again.',
            '',
            '## Checklist',
            '- [ ] Review the current exception packet.',
            '- [ ] Compare it with the playbook threshold.',
            '- [ ] Record whether owner approval is likely.',
            '',
          ].join('\n'),
        },
        {
          fileName: 'ledger-reconciliation.md',
          content: [
            formatFrontmatter({
              type: 'office_finance',
              status: 'active',
              priority: 'medium',
              owner: 'Shared',
              lane: 'finance',
              location: 'coordinator',
              tags: 'finance, ledger, operations',
            }),
            '# Ledger reconciliation',
            '',
            '## Overview',
            'Coordination notes and finance packets need a cleaner end-of-cycle reconciliation before the office scales up again.',
            '',
            '## Checklist',
            '- [ ] Pull the latest packet.',
            '- [ ] Check for mismatched statuses.',
            '- [ ] Record the next reconciliation step.',
            '',
          ].join('\n'),
        },
      ];
    }

    return [
      {
        fileName: 'office-rhythm-notes.md',
        content: [
          formatFrontmatter({
            type: 'office_internal_note',
            status: 'active',
            priority: 'medium',
            owner: 'Shared',
            lane: 'operations',
            location: 'war-room',
            tags: 'notes, workflow, handoff',
          }),
          '# Office rhythm notes',
          '',
          '## Overview',
          'Capture what makes the two-desk office feel smooth so it can keep running for long stretches.',
          '',
          '## Checklist',
          '- [ ] Keep notes on good handoffs.',
          '- [ ] Capture where the office stalled.',
          '- [ ] Turn repeated wins into office habits.',
          '',
        ].join('\n'),
      },
      {
        fileName: 'handoff-packet-template.md',
        content: [
          formatFrontmatter({
            type: 'office_internal_note',
            status: 'reference',
            priority: 'low',
            owner: 'Shared',
            lane: 'operations',
            location: 'archives',
            tags: 'notes, handoff, template',
          }),
          '# Handoff packet template',
          '',
          '## Overview',
          'A minimal template for leaving the other desk enough context to continue a task without replaying the whole office day.',
          '',
          '## Checklist',
          '- [ ] What changed',
          '- [ ] What still needs doing',
          '- [ ] What to avoid repeating',
          '',
        ].join('\n'),
      },
    ];
  }

  private ensureSeededOfficeSystems() {
    const seedDirectories = [
      this.officeBacklogPath,
      this.officeClientsPath,
      this.officeProjectsPath,
      this.officeFinancePath,
      this.officeNotesPath,
    ];

    for (const directory of seedDirectories) {
      if (listMarkdownFiles(directory).length > 0) {
        continue;
      }

      for (const seed of this.officeSeedsForPath(directory)) {
        writeText(join(directory, seed.fileName), seed.content);
      }
    }
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
    ensureDir(this.officeSystemsPath);
    ensureDir(this.officeBacklogPath);
    ensureDir(this.officeClientsPath);
    ensureDir(this.officeProjectsPath);
    ensureDir(this.officeFinancePath);
    ensureDir(this.officeNotesPath);
    this.ensureSeededOfficeSystems();
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

  loadOfficeSystemRecords(kind: VaultOfficeSystemKind, limit = 12) {
    const directory =
      kind === 'backlog'
        ? this.officeBacklogPath
        : kind === 'client'
          ? this.officeClientsPath
          : kind === 'project'
            ? this.officeProjectsPath
            : kind === 'finance'
              ? this.officeFinancePath
              : this.officeNotesPath;
    const files = listMarkdownFiles(directory).slice(0, limit);

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      const overview = extractSection(content, 'Overview');

      return {
        id: slugify(`${kind}-${basename(path, '.md')}`),
        kind,
        title,
        summary: (overview || extractSummary(content)).slice(0, 280),
        status: extractFrontmatterField(content, 'status') || 'active',
        priority: extractFrontmatterField(content, 'priority') || 'medium',
        owner: extractFrontmatterField(content, 'owner') || 'Shared',
        lane: extractFrontmatterField(content, 'lane') || 'operations',
        locationId: extractFrontmatterField(content, 'location') || '',
        tags: extractFrontmatterList(content, 'tags'),
        checklist: extractChecklist(extractSection(content, 'Checklist')),
        sourcePath: path,
        updatedAt: statSync(path).mtime.toISOString(),
      } satisfies VaultOfficeSystemRecord;
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
    const files = listRecentMarkdownFiles(
      this.longTermMemoryPath(employeeName),
      Math.max(limit * 12, AGENT_MEMORY_SEARCH_WINDOW),
    );
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
    const deduped = new Map<string, VaultAgentMemorySummary & { score: number }>();

    for (const item of filtered.sort((left, right) => right.score - left.score || right.createdAt.localeCompare(left.createdAt))) {
      const key = normalizeMemoryText(`${item.title} ${item.summary}`);
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, item);
        continue;
      }

      const existingRecency = existing.createdAt || existing.sourcePath;
      const itemRecency = item.createdAt || item.sourcePath;
      if (item.score > existing.score || (item.score === existing.score && itemRecency > existingRecency)) {
        deduped.set(key, item);
      }
    }

    return [...deduped.values()]
      .slice(0, limit)
      .map(({ score: _score, ...item }) => item);
  }

  appendAgentLog(entry: AgentLogEntry) {
    this.ensureEmployeeWorkspace(entry.employeeName);
    const employeeDir = this.agentLogPath(entry.employeeName);
    const dailyPath = join(employeeDir, `${new Date().toISOString().slice(0, 10)}.md`);
    appendMarkdownSection(dailyPath, `${new Date().toISOString()} — ${entry.heading}`, entry.body, `${entry.employeeName} Log`);
  }

  private renderAgentMemoryContent(
    entry: AgentMemoryEntry,
    timestamps: { createdAt: string; updatedAt: string | null; occurrences: number },
  ) {
    return [
      formatFrontmatter({
        type: 'agent_memory',
        agent: entry.employeeName,
        kind: entry.kind,
        created_at: timestamps.createdAt,
        updated_at: timestamps.updatedAt ?? '',
        occurrences: timestamps.occurrences,
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
  }

  private loadStoredAgentMemories(employeeName: string, limit = 200) {
    this.ensureEmployeeWorkspace(employeeName);
    const files = listRecentMarkdownFiles(this.longTermMemoryPath(employeeName), Math.min(limit, AGENT_MEMORY_INDEX_WINDOW));
    return files.map((path) => {
      const content = readText(path);
      return {
        employeeName,
        title: extractTitle(content, basename(path, '.md')),
        summary: extractSection(content, 'Summary') || extractSummary(content),
        details: extractSection(content, 'Details') || splitFrontmatter(content).body,
        kind: extractFrontmatterField(content, 'kind') || 'note',
        tags: extractFrontmatterList(content, 'tags'),
        referenceId: extractFrontmatterField(content, 'reference_id') || null,
        importance: Number.parseInt(extractFrontmatterField(content, 'importance') || '1', 10) || 1,
        relatedLocationId: extractFrontmatterField(content, 'related_location') || null,
        relatedEmployeeName: extractFrontmatterField(content, 'related_employee') || null,
        sourcePath: path,
        createdAt: extractFrontmatterField(content, 'created_at') || statSync(path).mtime.toISOString(),
        updatedAt: extractFrontmatterField(content, 'updated_at') || null,
        occurrences: Number.parseInt(extractFrontmatterField(content, 'occurrences') || '1', 10) || 1,
      } satisfies StoredAgentMemoryEntry;
    });
  }

  private findReusableAgentMemory(entry: AgentMemoryEntry) {
    const normalizedTitle = normalizeMemoryText(entry.title);
    const normalizedSummary = normalizeMemoryText(entry.summary);
    const normalizedDetails = normalizeMemoryText(entry.details);

    for (const existing of this.loadStoredAgentMemories(entry.employeeName)) {
      const sameTitle = normalizeMemoryText(existing.title) === normalizedTitle;
      const sameReference = Boolean(entry.referenceId && existing.referenceId && entry.referenceId === existing.referenceId);
      if (!sameTitle && !sameReference) {
        continue;
      }

      const existingSummary = normalizeMemoryText(existing.summary);
      const existingDetails = normalizeMemoryText(existing.details);
      const exactDuplicate = sameTitle && existingSummary === normalizedSummary && existingDetails === normalizedDetails;
      if (exactDuplicate) {
        return { mode: 'skip' as const, existing };
      }

      const summaryOverlap = tokenOverlapRatio(existing.summary, entry.summary);
      const detailsOverlap = tokenOverlapRatio(existing.details, entry.details);
      if (sameReference || (sameTitle && (summaryOverlap >= 0.72 || detailsOverlap >= 0.72))) {
        return { mode: 'update' as const, existing };
      }
    }

    return null;
  }

  appendAgentMemory(entry: AgentMemoryEntry) {
    this.ensureEmployeeWorkspace(entry.employeeName);
    const timestamp = new Date().toISOString();
    const reusable = this.findReusableAgentMemory(entry);

    if (reusable?.mode === 'skip') {
      return {
        mode: 'skipped' as const,
        sourcePath: reusable.existing.sourcePath,
      };
    }

    if (reusable?.mode === 'update') {
      const mergedTags = [...new Set([...(reusable.existing.tags ?? []), ...(entry.tags ?? [])])];
      const mergedSummary =
        normalizeMemoryText(reusable.existing.summary) === normalizeMemoryText(entry.summary) ||
        reusable.existing.summary.length >= entry.summary.length
          ? reusable.existing.summary
          : entry.summary;
      const newDetailBlock = entry.details.trim();
      const existingDetails = reusable.existing.details.trim();
      const mergedDetails =
        normalizeMemoryText(existingDetails).includes(normalizeMemoryText(newDetailBlock)) || newDetailBlock.length === 0
          ? existingDetails
          : `${existingDetails}\n\n### Update ${timestamp}\n${newDetailBlock}`;
      const updatedEntry: AgentMemoryEntry = {
        ...entry,
        title: reusable.existing.title,
        summary: mergedSummary,
        details: mergedDetails,
        tags: mergedTags,
        importance: Math.max(reusable.existing.importance ?? 1, entry.importance ?? 1),
        referenceId: entry.referenceId ?? reusable.existing.referenceId ?? null,
        relatedLocationId: entry.relatedLocationId ?? reusable.existing.relatedLocationId ?? null,
        relatedEmployeeName: entry.relatedEmployeeName ?? reusable.existing.relatedEmployeeName ?? null,
      };
      writeText(
        reusable.existing.sourcePath,
        this.renderAgentMemoryContent(updatedEntry, {
          createdAt: reusable.existing.createdAt,
          updatedAt: timestamp,
          occurrences: reusable.existing.occurrences + 1,
        }),
      );
      return {
        mode: 'updated' as const,
        sourcePath: reusable.existing.sourcePath,
      };
    }

    const notePath = join(this.longTermMemoryPath(entry.employeeName), `${timestamp.replace(/[:]/g, '-')}-${slugify(entry.title)}.md`);
    const content = this.renderAgentMemoryContent(entry, {
      createdAt: timestamp,
      updatedAt: null,
      occurrences: 1,
    });
    writeText(notePath, content);
    return {
      mode: 'created' as const,
      sourcePath: notePath,
    };
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
    appendUniqueMarkdownSection(notePath, `${new Date().toISOString()} — ${entry.title}`, body, entry.title, `${entry.summary}\n${entry.details}`);
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
    appendUniqueMarkdownSection(notePath, `${new Date().toISOString()} — Proposal`, body, entry.title, entry.recommendation);
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
      const fromMailbox = parseMailbox(extractField(content, 'From') || 'unknown@example.com', 'unknown@example.com');
      const toMailbox = parseMailbox(extractField(content, 'To') || 'office@no-mans-ai.local', 'office@no-mans-ai.local');
      const body = stripMetadata(content);

      return {
        id: slugify(`${basename(path, '.md')}-${subject}`),
        title,
        subject,
        fromName: fromMailbox.name,
        from: fromMailbox.email,
        toName: toMailbox.name,
        to: toMailbox.email,
        body,
        summary: extractSummary(content),
        sourcePath: path,
        updatedAt: statSync(path).mtime.toISOString(),
      } satisfies VaultEmail;
    });
  }

  loadSentEmails(limit = 24) {
    const files = listMarkdownFiles(this.emailSentPath).slice(-limit);

    return files.map((path) => {
      const content = readText(path);
      const title = extractTitle(content, basename(path, '.md'));
      const subject = extractField(content, 'Subject') || title;
      const fromMailbox = parseMailbox(extractField(content, 'From') || 'office@no-mans-ai.local', 'office@no-mans-ai.local');
      const toMailbox = parseMailbox(extractField(content, 'To') || 'unknown@example.com', 'unknown@example.com');
      const body = stripMetadata(content);

      return {
        id: slugify(`${basename(path, '.md')}-${subject}`),
        title,
        subject,
        fromName: fromMailbox.name,
        from: fromMailbox.email,
        toName: toMailbox.name,
        to: toMailbox.email,
        body,
        summary: extractSummary(content),
        sourcePath: path,
        updatedAt: statSync(path).mtime.toISOString(),
      } satisfies VaultEmail;
    });
  }

  appendSentEmail(entry: SentEmailEntry) {
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const notePath = join(this.emailSentPath, `${timestamp}-${slugify(entry.subject)}.md`);
    const content = [
      `# ${entry.subject}`,
      `From: ${formatMailbox(entry.fromName, entry.from)}`,
      `To: ${formatMailbox(entry.toName, entry.to)}`,
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
