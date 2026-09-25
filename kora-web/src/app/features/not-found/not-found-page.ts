import { Component } from '@angular/core';
import { MatAnchor } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'kora-not-found-page',
  imports: [EmptyState, MatAnchor, PageHeader, RouterLink, TranslocoPipe],
  template: `
    <kora-page-header [heading]="'notFound.title' | transloco" />
    <kora-empty-state icon="search" [heading]="'notFound.message' | transloco">
      <a mat-flat-button routerLink="/dashboard">{{ 'notFound.back' | transloco }}</a>
    </kora-empty-state>
  `,
})
export class NotFoundPage {}
