import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Portfolio, Program } from '../../core/api/api.models';
import { PortfoliosApi } from '../../core/api/portfolios.api';
import { Notifier } from '../../core/notify/notifier';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog';
import { PortfolioDialog, PortfolioDialogData } from './portfolio-dialog';
import { ProgramDialog, ProgramDialogData } from './program-dialog';

/**
 * Portfolio and program commands for the pages: opens the dialogs, calls the API, announces the
 * result. Resolves with the saved entity, or `undefined` when the user cancelled or it failed
 * (failures outside forms are toasted by the error interceptor).
 */
@Injectable({ providedIn: 'root' })
export class PortfolioFacade {
  private readonly api = inject(PortfoliosApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);

  createPortfolio(): Promise<Portfolio | undefined> {
    return this.openPortfolioDialog({
      save: (request) => firstValueFrom(this.api.create(request)),
    }).then((saved) => this.announce(saved, 'portfolios.created'));
  }

  editPortfolio(portfolio: Portfolio): Promise<Portfolio | undefined> {
    return this.openPortfolioDialog({
      portfolio,
      save: (request) => firstValueFrom(this.api.update(portfolio.id, request, portfolio.version)),
    }).then((saved) => this.announce(saved, 'portfolios.saved'));
  }

  /** Archive (read-only) or reactivate. */
  async setArchived(portfolio: Portfolio, archived: boolean): Promise<Portfolio | undefined> {
    const key = archived ? 'archive' : 'reactivate';
    const t = (name: string) => this.transloco.translate(name, { name: portfolio.name });
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: t(`portfolios.${key}Title`),
        message: t(`portfolios.${key}Message`),
        confirmLabel: t(`portfolios.${key}`),
      }),
    );
    if (!confirmed) return undefined;
    try {
      const saved = await firstValueFrom(
        this.api.update(
          portfolio.id,
          { status: archived ? 'ARCHIVED' : 'ACTIVE' },
          portfolio.version,
        ),
      );
      return this.announce(saved, archived ? 'portfolios.archived' : 'portfolios.reactivated');
    } catch {
      return undefined;
    }
  }

  /** Deletes an empty portfolio after confirmation; resolves `true` when it's gone. */
  async deletePortfolio(portfolio: Portfolio): Promise<boolean> {
    const t = (name: string) => this.transloco.translate(name, { name: portfolio.name });
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: t('portfolios.deleteTitle'),
        message: t('portfolios.deleteMessage'),
        confirmLabel: t('common.delete'),
        destructive: true,
      }),
    );
    if (!confirmed) return false;
    try {
      await firstValueFrom(this.api.delete(portfolio.id));
      this.notifier.success(t('portfolios.deleted'));
      return true;
    } catch {
      return false;
    }
  }

  createProgram(portfolio: Portfolio): Promise<Program | undefined> {
    return this.openProgramDialog({
      save: (request) => firstValueFrom(this.api.createProgram(portfolio.id, request)),
    }).then((saved) => this.announce(saved, 'programs.created'));
  }

  editProgram(program: Program): Promise<Program | undefined> {
    return this.openProgramDialog({
      program,
      save: (request) =>
        firstValueFrom(this.api.updateProgram(program.id, request, program.version)),
    }).then((saved) => this.announce(saved, 'programs.saved'));
  }

  private openPortfolioDialog(data: PortfolioDialogData): Promise<Portfolio | undefined> {
    return firstValueFrom(
      this.dialog
        .open<PortfolioDialog, PortfolioDialogData, Portfolio>(PortfolioDialog, { data })
        .afterClosed(),
    );
  }

  private openProgramDialog(data: ProgramDialogData): Promise<Program | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ProgramDialog, ProgramDialogData, Program>(ProgramDialog, { data })
        .afterClosed(),
    );
  }

  private announce<T extends { name: string }>(saved: T | undefined, key: string): T | undefined {
    if (saved) this.notifier.success(this.transloco.translate(key, { name: saved.name }));
    return saved;
  }
}
