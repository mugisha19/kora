import { Charter } from '../../../../core/api/api.models';
import { charterSections, diffCharters } from './charter-sections';

const format = { locale: 'en', date: (d: string) => `on ${d}` };

function charter(overrides: Partial<Charter> = {}): Charter {
  return {
    projectId: 'p',
    versionNumber: 1,
    status: 'APPROVED',
    purpose: 'Bank from phones',
    objectives: [{ text: 'Launch', successMetric: 'In stores' }],
    inScope: ['Balances', 'Transfers'],
    outOfScope: [],
    assumptions: [],
    constraints: [],
    highLevelRisks: [],
    milestones: [{ name: 'Beta', targetDate: '2026-10-17' }],
    summaryBudget: { amount: '150000000', currency: 'RWF' },
    sponsor: { userId: 'u', fullName: 'Jean-Paul Habimana' },
    version: 1,
    ...overrides,
  };
}

describe('charter sections', () => {
  it('turns a charter into display sections, in document order', () => {
    const sections = charterSections(charter(), format);

    expect(sections.map((s) => s.key)).toEqual([
      'purpose',
      'businessCase',
      'objectives',
      'inScope',
      'outOfScope',
      'assumptions',
      'constraints',
      'highLevelRisks',
      'milestones',
      'summaryBudget',
      'sponsor',
    ]);
    expect(sections[1].items).toEqual([]);
    expect(sections[2].items).toEqual(['Launch — In stores']);
    expect(sections[8].items).toEqual(['Beta — on 2026-10-17']);
    expect(sections[9].items.map((i) => i.replace(/\s/g, ' '))).toEqual(['RWF 150,000,000']);
  });

  it('marks what changed between two versions, item by item', () => {
    const before = charterSections(charter(), format);
    const after = charterSections(
      charter({ versionNumber: 2, inScope: ['Balances', 'Bill payments'] }),
      format,
    );

    const diff = diffCharters(before, after);
    const scope = diff.find((d) => d.key === 'inScope');

    expect(diff.filter((d) => d.changed).map((d) => d.key)).toEqual(['inScope']);
    expect(scope?.before).toEqual([
      { text: 'Balances', mark: 'same' },
      { text: 'Transfers', mark: 'removed' },
    ]);
    expect(scope?.after).toEqual([
      { text: 'Balances', mark: 'same' },
      { text: 'Bill payments', mark: 'added' },
    ]);
  });

  it('treats a reorder as a change', () => {
    const diff = diffCharters(
      charterSections(charter(), format),
      charterSections(charter({ inScope: ['Transfers', 'Balances'] }), format),
    );

    expect(diff.find((d) => d.key === 'inScope')?.changed).toBe(true);
  });
});
