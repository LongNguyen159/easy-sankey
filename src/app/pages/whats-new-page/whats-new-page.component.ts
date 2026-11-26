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
      title: 'Track Investments and Savings',
      description: 'Mark a category as an investment contribution to see how much you invested, how much cash is left, and how much you saved overall. Open Finance Manager to see how your savings and savings rate change over time.',
    },
    {
      title: 'Resize the Sankey Chart',
      description: 'Drag the handle below the chart up or down to adjust its height. You can also focus the handle and use the Up and Down arrow keys.',
      image: 'whats-new/sankey-resize',
      withBorder: true,
      alt: 'Sankey chart with a centred resize handle on the horizontal line below it',
    },
    {
      title: 'Copy & Paste entries',
      description: 'Copy and Paste your income/expenses through out the app. Just right click on the entry or on the dialog to show the menu.',
      image: 'whats-new/entry-copy',
      withBorder: true,
      alt: 'Copy and Paste menu',
    },
  ];
}
