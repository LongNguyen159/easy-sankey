import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { UiService } from '../../services/ui.service';
import { MatCardModule } from '@angular/material/card';
import { RoutePath } from '../../components/models';
import { ReleaseFeaturesComponent } from '../../components/release-features/release-features.component';
import type { FeaturePreview } from '../../components/release-features/release-features.component';

/**
 * TODO: UPDATE THIS PAGE EVERY TIME A NEW RELEASE IS MADE.
 */
@Component({
    selector: 'app-whats-new-page',
    imports: [NavbarComponent, MatButtonModule,
        RouterModule, MatCardModule, ReleaseFeaturesComponent
    ],
    templateUrl: './whats-new-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './whats-new-page.component.scss'
})
export class WhatsNewPageComponent {
  uiService = inject(UiService)

  RoutePath = RoutePath

  protected readonly features: readonly FeaturePreview[] = [
    {
      title: 'Custom Categories',
      description: 'Open Categories from the menu to create or edit expense categories with your own names, colours and icons.',
      image: 'whats-new/categories',
      alt: 'Edit category dialog with a live preview, colour palette and icon picker',
    },
    {
      title: 'Spending Budgets',
      description: 'Assign expenses to a budget in Edit input. In the month’s Budgets section, see how much you have left or how far you’re over.',
      image: 'whats-new/budgets',
      withBorder: true,
      alt: 'Monthly budget radar chart and progress bars comparing spending with three budget limits',
    },
    {
      title: 'Import and Export',
      description: 'Go to Settings → App data to export a full JSON backup or import one to restore your data.',
      image: 'whats-new/backup',
      alt: 'App data section in Settings with Export full backup and Import full backup buttons',
    },
  ];
}
