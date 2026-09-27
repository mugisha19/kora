import { Charter, CharterStatus } from '../../../../core/api/api.models';
import { formatMoney } from '../../../../shared/format/money';
import { StatusTone } from '../../../../shared/ui/status-chip';

export type CharterSectionKey =
  | 'purpose'
  | 'businessCase'
  | 'objectives'
  | 'inScope'
  | 'outOfScope'
  | 'assumptions'
  | 'constraints'
  | 'highLevelRisks'
  | 'milestones'
  | 'summaryBudget'
  | 'sponsor';

export interface CharterSection {
  key: CharterSectionKey;
  /** Lists render as lists; the others as paragraphs. */
  list: boolean;
  items: string[];
}

export interface Formatters {
  date: (isoDate: string) => string;
  locale: string;
}

/**
 * A charter as display sections (the read view, the print view and the version diff all use
 * this, so they can't disagree on what a charter says).
 */
export function charterSections(charter: Charter, format: Formatters): CharterSection[] {
  const text = (key: CharterSectionKey, value: string | undefined): CharterSection => ({
    key,
    list: false,
    items: value ? [value] : [],
  });
  const list = (key: CharterSectionKey, items: string[]): CharterSection => ({
    key,
    list: true,
    items,
  });
  return [
    text('purpose', charter.purpose),
    text('businessCase', charter.businessCase),
    list(
      'objectives',
      charter.objectives.map((o) => `${o.text} — ${o.successMetric}`),
    ),
    list('inScope', charter.inScope),
    list('outOfScope', charter.outOfScope),
    list('assumptions', charter.assumptions),
    list('constraints', charter.constraints),
    list('highLevelRisks', charter.highLevelRisks),
    list(
      'milestones',
      charter.milestones.map((m) => `${m.name} — ${format.date(m.targetDate)}`),
    ),
    text('summaryBudget', formatMoney(charter.summaryBudget, format.locale) || undefined),
    text('sponsor', charter.sponsor?.fullName),
  ];
}

export type DiffMark = 'same' | 'added' | 'removed';

export interface SectionDiff {
  key: CharterSectionKey;
  changed: boolean;
  before: { text: string; mark: DiffMark }[];
  after: { text: string; mark: DiffMark }[];
}

/** Section-by-section comparison of two versions: items only in `before` are removed, only in `after` added. */
export function diffCharters(before: CharterSection[], after: CharterSection[]): SectionDiff[] {
  return before.map((section, index) => {
    const next = after[index];
    const beforeItems = section.items.map((text) => ({
      text,
      mark: (next.items.includes(text) ? 'same' : 'removed') as DiffMark,
    }));
    const afterItems = next.items.map((text) => ({
      text,
      mark: (section.items.includes(text) ? 'same' : 'added') as DiffMark,
    }));
    const changed =
      section.items.length !== next.items.length ||
      section.items.some((text, i) => text !== next.items[i]);
    return { key: section.key, changed, before: beforeItems, after: afterItems };
  });
}

export const CHARTER_STATUS_LOOK: Record<CharterStatus, { tone: StatusTone; icon: string }> = {
  DRAFT: { tone: 'neutral', icon: 'edit' },
  SUBMITTED: { tone: 'info', icon: 'send' },
  APPROVED: { tone: 'success', icon: 'check_circle' },
  SUPERSEDED: { tone: 'neutral', icon: 'history' },
};
