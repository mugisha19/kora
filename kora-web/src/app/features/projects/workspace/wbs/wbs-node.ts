import { Component, computed, forwardRef, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { WbsNode } from '../../../../core/api/api.models';
import { LanguageService } from '../../../../core/i18n/language.service';
import { HoursPipe, MoneyPipe, Percent100Pipe } from '../../../../shared/format/money';
import { WbsStore } from './wbs.store';

/**
 * One WBS node and, when expanded, its children, each rendered by this same component (the
 * Composite pattern on the screen, mirroring `WbsComponent` on the API). The host `<li>` is the
 * ARIA treeitem; its name is just the code and name (not the text of its descendants), and its
 * figures are read as the description.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- the host must be the <li role="treeitem"> itself (ARIA tree ownership)
  selector: 'li[kora-wbs-node]',
  imports: [
    HoursPipe,
    MatIcon,
    MoneyPipe,
    Percent100Pipe,
    TranslocoPipe,
    forwardRef(() => WbsTreeNode),
  ],
  host: {
    role: 'treeitem',
    '[id]': 'domId()',
    '[attr.aria-level]': 'level()',
    '[attr.aria-setsize]': 'setSize()',
    '[attr.aria-posinset]': 'position()',
    '[attr.aria-expanded]': 'hasChildren() ? expanded() : null',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-labelledby]': 'domId() + "-label"',
    '[attr.aria-describedby]': 'domId() + "-figures"',
    '[tabindex]': 'selected() ? 0 : -1',
    '(click)': 'onClick($event)',
    '(focus)': 'onFocus()',
  },
  template: `
    <div class="row" [class]="'level-' + level()" [class.selected]="selected()">
      <span class="name">
        @if (hasChildren()) {
          <mat-icon
            class="toggle"
            [svgIcon]="expanded() ? 'keyboard_arrow_down' : 'chevron_right'"
            aria-hidden="true"
            (click)="toggle($event)"
          />
        } @else {
          <span class="toggle" aria-hidden="true"></span>
        }
        <span [id]="domId() + '-label'">
          <span class="code">{{ node().code }}</span>
          {{ node().name }}
        </span>
      </span>
      <span class="type" aria-hidden="true">
        <mat-icon
          [svgIcon]="node().type === 'DELIVERABLE' ? 'inventory_2' : 'work'"
          aria-hidden="true"
        />
        <span class="type-label">{{ 'wbsType.' + node().type | transloco }}</span>
      </span>
      <span class="num effort" aria-hidden="true">
        {{ node().plannedEffortHours | hours: language.current() }}
      </span>
      <span class="num cost" aria-hidden="true">
        {{ node().plannedCost | money: language.current() }}
      </span>
      <span class="progress" aria-hidden="true">
        <progress max="100" [value]="node().percentComplete"></progress>
        <span class="num">{{ node().percentComplete | percent100: language.current() }}</span>
      </span>
      <span class="visually-hidden" [id]="domId() + '-figures'">
        {{ 'wbsType.' + node().type | transloco }}.
        {{
          'wbs.describe'
            | transloco
              : {
                  effort: (node().plannedEffortHours | hours: language.current()),
                  cost: (node().plannedCost | money: language.current()),
                  percent: (node().percentComplete | percent100: language.current()),
                  source: ('wbs.source.' + node().percentCompleteSource | transloco),
                }
        }}
      </span>
    </div>
    @if (hasChildren() && expanded()) {
      <ul role="group">
        @for (child of node().children; track child.id; let i = $index) {
          <li
            kora-wbs-node
            [node]="child"
            [level]="level() + 1"
            [position]="i + 1"
            [setSize]="node().children.length"
          ></li>
        }
      </ul>
    }
  `,
  styleUrl: './wbs-node.scss',
})
export class WbsTreeNode {
  readonly node = input.required<WbsNode>();
  readonly level = input.required<number>();
  readonly position = input.required<number>();
  readonly setSize = input.required<number>();

  private readonly store = inject(WbsStore);
  protected readonly language = inject(LanguageService);

  protected readonly domId = computed(() => `wbs-${this.node().id}`);
  protected readonly hasChildren = computed(() => this.node().children.length > 0);
  protected readonly expanded = computed(() => this.store.expanded().includes(this.node().id));
  protected readonly selected = computed(() => this.store.selectedId() === this.node().id);

  protected onClick(event: Event): void {
    // Nested treeitems: only the innermost one handles the click.
    event.stopPropagation();
    this.store.select(this.node().id);
  }

  /** Focus and selection move together (single-select tree), however focus arrived. */
  protected onFocus(): void {
    if (!this.selected()) this.store.select(this.node().id);
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.store.select(this.node().id);
    this.store.toggle(this.node().id);
  }
}
