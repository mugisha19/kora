import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StakeholderGrid as Grid, StakeholderQuadrant } from '../../../../core/api/api.models';
import { GRID_LAYOUT } from './stakeholder-look';

/**
 * The power/interest grid (feature 13): four labelled quadrants — power rises upwards, interest to
 * the right — each a heading and a list of people. Every person is a button (Tab moves through
 * them in reading order) marked with how much more engagement they need; a quadrant's heading
 * button filters the register to it.
 */
@Component({
  selector: 'kora-stakeholder-grid',
  imports: [TranslocoPipe],
  template: `
    <div class="frame">
      <p class="axis power" aria-hidden="true">{{ 'stakeholders.fields.power' | transloco }} ↑</p>
      <div class="grid">
        @for (quadrant of quadrants(); track quadrant.quadrant) {
          <section
            [class]="'quadrant ' + quadrant.quadrant.toLowerCase()"
            [attr.aria-labelledby]="'q-' + quadrant.quadrant"
          >
            <h3 [id]="'q-' + quadrant.quadrant">
              <button
                type="button"
                class="heading"
                [attr.aria-pressed]="selected() === quadrant.quadrant"
                (click)="filtered.emit(selected() === quadrant.quadrant ? null : quadrant.quadrant)"
              >
                {{ 'stakeholderQuadrant.' + quadrant.quadrant | transloco }}
                <span class="count">({{ quadrant.stakeholders.length }})</span>
              </button>
            </h3>
            <p class="rule">{{ 'stakeholderQuadrantHint.' + quadrant.quadrant | transloco }}</p>
            @if (quadrant.stakeholders.length) {
              <ul>
                @for (person of quadrant.stakeholders; track person.id) {
                  <li>
                    <button type="button" class="person" (click)="opened.emit(person.id)">
                      {{ person.name }}
                      @if (person.engagementGap > 0) {
                        <span class="gap">
                          <span aria-hidden="true">+{{ person.engagementGap }}</span>
                          <span class="visually-hidden">{{
                            'stakeholders.gapLabel' | transloco: { count: person.engagementGap }
                          }}</span>
                        </span>
                      }
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="kora-muted">{{ 'stakeholders.nobody' | transloco }}</p>
            }
          </section>
        }
      </div>
      <p class="axis interest" aria-hidden="true">
        {{ 'stakeholders.fields.interest' | transloco }} →
      </p>
    </div>
  `,
  styles: `
    .frame {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto auto;
      gap: var(--kora-space-1);
    }
    .axis {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .power {
      writing-mode: vertical-rl;
      rotate: 180deg;
      text-align: center;
    }
    .interest {
      grid-column: 2;
      text-align: center;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--kora-space-2);
    }
    .quadrant {
      padding: var(--kora-space-3);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
      min-block-size: 120px;
    }
    .manage_closely {
      background: var(--kora-danger-bg);
    }
    .keep_satisfied {
      background: var(--kora-warning-bg);
    }
    .keep_informed {
      background: var(--kora-info-bg);
    }
    .monitor {
      background: var(--kora-neutral-bg);
    }
    h3 {
      margin: 0;
      font: var(--mat-sys-title-small);
    }
    .heading {
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
      text-decoration: underline dotted;
    }
    .heading[aria-pressed='true'] {
      text-decoration: underline solid 2px;
    }
    .rule {
      margin: 0 0 var(--kora-space-2);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    ul {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .person {
      display: inline-flex;
      align-items: center;
      gap: var(--kora-space-1);
      padding: 4px 10px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 999px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .person:hover {
      background: var(--mat-sys-surface-container-high);
    }
    button:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .gap {
      padding: 0 6px;
      border-radius: 999px;
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
      font: var(--mat-sys-label-small);
      font-weight: 700;
    }
    @media (max-width: 599px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class StakeholderGrid {
  readonly grid = input.required<Grid>();
  readonly selected = input<StakeholderQuadrant | null>(null);
  readonly opened = output<string>();
  readonly filtered = output<StakeholderQuadrant | null>();

  /** Laid out as the classic grid, whatever order the API sends. */
  protected readonly quadrants = computed(() =>
    GRID_LAYOUT.map(
      (q) =>
        this.grid().quadrants.find((x) => x.quadrant === q) ?? { quadrant: q, stakeholders: [] },
    ),
  );
}
