import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { WbsNode, WbsNodeType } from '../../../../core/api/api.models';
import { LanguageService } from '../../../../core/i18n/language.service';
import { HoursPipe, MoneyPipe, Percent100Pipe } from '../../../../shared/format/money';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import { WbsNodeDialog, WbsNodeDialogData } from './wbs-node-dialog';
import { WbsTreeNode } from './wbs-node';
import { PlacedNode, WbsStore } from './wbs.store';

/**
 * WBS tab (feature 07): the work breakdown as an accessible tree (WAI-ARIA tree pattern: arrow
 * keys move and expand, Home/End jump, Enter edits, Delete removes, Alt+arrows reorder, indent and
 * outdent). The toolbar acts on the selected node, so every command also has a button.
 */
@Component({
  selector: 'kora-wbs-tab',
  imports: [
    EmptyState,
    ErrorState,
    HoursPipe,
    LoadingState,
    MatButton,
    MatIcon,
    MoneyPipe,
    Percent100Pipe,
    TranslocoPipe,
    WbsTreeNode,
  ],
  providers: [WbsStore],
  templateUrl: './wbs-tab.html',
  styleUrl: './wbs-tab.scss',
})
export class WbsTab {
  protected readonly store = inject(WbsStore);
  protected readonly project = inject(ProjectStore);
  protected readonly language = inject(LanguageService);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly canEdit = computed(() => this.project.canEdit());
  /** Whether keyboard focus is in the tree; selection changes then move focus with them. */
  private treeHasFocus = false;

  constructor() {
    void this.store.load();
    // Keep DOM focus on the selected node (after keyboard moves, reloads and undo).
    effect(() => {
      const id = this.store.selectedId();
      this.store.tree();
      if (id && untracked(() => this.treeHasFocus)) this.focusNode(id);
    });
  }

  protected onFocusIn(): void {
    this.treeHasFocus = true;
  }

  protected onFocusOut(event: FocusEvent): void {
    const tree = event.currentTarget as HTMLElement;
    this.treeHasFocus = tree.contains(event.relatedTarget as Node | null);
  }

  /** Keyboard support for the tree (https://www.w3.org/WAI/ARIA/apg/patterns/treeview/). */
  protected onKeydown(event: KeyboardEvent): void {
    const selected = this.store.selected();
    const visible = this.store.visible();
    if (!selected || visible.length === 0) return;
    const at = visible.findIndex((p) => p.node.id === selected.node.id);
    const go = (entry: PlacedNode | undefined) => {
      if (entry) this.store.select(entry.node.id);
    };
    const { node } = selected;
    const open = this.store.expanded().includes(node.id);

    if (event.altKey && this.canEdit()) {
      const handled = this.keyboardMove(event.key, selected);
      if (handled) event.preventDefault();
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        go(visible[at + 1]);
        break;
      case 'ArrowUp':
        go(visible[at - 1]);
        break;
      case 'Home':
        go(visible[0]);
        break;
      case 'End':
        go(visible[visible.length - 1]);
        break;
      case 'ArrowRight':
        if (node.children.length && !open) this.store.expand(node.id);
        else if (node.children.length) go(this.store.placed().get(node.children[0].id));
        break;
      case 'ArrowLeft':
        if (node.children.length && open) this.store.collapse(node.id);
        else if (selected.parentId) go(this.store.placed().get(selected.parentId));
        break;
      case '*':
        this.store.expandAll();
        break;
      case 'Enter':
      case 'F2':
        if (!this.canEdit()) return;
        this.edit(node);
        break;
      case 'Delete':
        if (!this.canEdit()) return;
        this.remove(selected);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ---------- Commands (toolbar and keyboard) ----------

  protected add(parent: WbsNode | null, type: WbsNodeType): void {
    this.openDialog({ parent, type });
  }

  protected edit(node: WbsNode): void {
    this.openDialog({ node });
  }

  protected remove(entry: PlacedNode): void {
    const count = this.descendants(entry.node);
    const params = { code: entry.node.code, name: entry.node.name, count };
    this.confirmDialog
      .confirm({
        title: this.transloco.translate('wbs.deleteTitle', params),
        message: this.transloco.translate(
          count ? 'wbs.deleteMessageWithChildren' : 'wbs.deleteMessage',
          params,
        ),
        confirmLabel: this.transloco.translate('common.delete'),
        destructive: true,
      })
      .subscribe((confirmed) => {
        if (confirmed) void this.store.remove(entry);
      });
  }

  protected moveUp(entry: PlacedNode): void {
    void this.store.moveUp(entry);
  }

  protected moveDown(entry: PlacedNode): void {
    void this.store.moveDown(entry);
  }

  protected indent(entry: PlacedNode): void {
    const target = this.store.indentTarget(entry);
    if (target) void this.store.indent(entry, target);
  }

  protected outdent(entry: PlacedNode): void {
    void this.store.outdent(entry);
  }

  private keyboardMove(key: string, entry: PlacedNode): boolean {
    if (this.store.busy()) return true;
    switch (key) {
      case 'ArrowUp':
        if (this.store.canMoveUp(entry)) this.moveUp(entry);
        return true;
      case 'ArrowDown':
        if (this.store.canMoveDown(entry)) this.moveDown(entry);
        return true;
      case 'ArrowRight':
        this.indent(entry);
        return true;
      case 'ArrowLeft':
        if (this.store.canOutdent(entry)) this.outdent(entry);
        return true;
      default:
        return false;
    }
  }

  private openDialog(data: Omit<WbsNodeDialogData, 'create' | 'update'>): void {
    const ref = this.dialog.open<WbsNodeDialog, WbsNodeDialogData, boolean>(WbsNodeDialog, {
      data: {
        ...data,
        create: (request) => this.store.create(request),
        update: (node, body) => this.store.update(node, body),
      },
    });
    void firstValueFrom(ref.afterClosed()).then(() => {
      // Back to the tree on the (new or edited) node.
      this.treeHasFocus = true;
      const id = this.store.selectedId();
      if (id) this.focusNode(id);
    });
  }

  private descendants(node: WbsNode): number {
    return node.children.reduce((total, child) => total + 1 + this.descendants(child), 0);
  }

  private focusNode(id: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#wbs-${CSS.escape(id)}`)?.focus(),
      { injector: this.injector },
    );
  }
}
