import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { MatButtonModule } from '@angular/material/button';
import { UiService } from '../../services/ui.service';
import { RoutePath } from '../../components/models';
import { ReleaseFeaturesComponent } from '../../components/release-features/release-features.component';
import type { FeaturePreview } from '../../components/release-features/release-features.component';

@Component({
    selector: 'app-highlighted-features-page',
    imports: [NavbarComponent, MatButtonModule,
        RouterModule, MatCardModule, ReleaseFeaturesComponent
    ],
    templateUrl: './highlighted-features-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './highlighted-features-page.component.scss'
})
export class HighlightedFeaturesPageComponent {
  uiService = inject(UiService)

  RoutePath = RoutePath

  protected readonly features: readonly FeaturePreview[] = [
    {
      title: 'Easy Sankey - Creating Sankey Should Be Simple',
      description: 'Add your income and expenses to see where your money goes. Click an entry in the Sankey chart to edit it directly.',
      image: 'sankey',
      alt: 'Sankey chart showing how income flows into expenses and surplus',
      withBorder: true,
    },
    {
      title: 'Organise Spending Your Way',
      description: 'Open Categories from the menu to create your own spending groups and give each one a colour and icon.',
      image: 'whats-new/categories',
      alt: 'Edit category dialog with a live preview, colour palette and icon picker',
    },
    {
      title: 'See What’s Left in Your Budget',
      description: 'Assign expenses to budgets in Edit input, then check the month’s Budgets section to see what’s left or what went over.',
      image: 'whats-new/budgets',
      alt: 'Monthly budget radar chart and progress bars comparing spending with three budget limits',
      withBorder: true,
    },
    {
      title: 'See How Your Finances Change Over Time',
      description: 'Open Finance Manager to compare income, spending and surplus across months. Click a chart point to open that month’s details.',
      image: 'manager',
      alt: 'Finance Manager with a surplus and balance chart and a monthly breakdown',
      withBorder: true,
    },
    {
      title: 'Inline Calculator',
      description: 'In Edit input, type a sum like 135 + 20 + 2.5 straight into the Amount field. Easy Sankey calculates the total for you.',
      image: 'inline-calc',
      alt: 'Amount field with the calculation 135 plus 20 plus 2.5',
      withBorder: true,
    },
  ];
}
