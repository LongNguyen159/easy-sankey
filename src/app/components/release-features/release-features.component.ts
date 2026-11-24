import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ColorService } from '../../services/color.service';

@Component({
  selector: 'app-release-features',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (feature of features; track feature.image) {
      <section class="feature-card">
        <div class="feature-copy">
          <h2 class="mb-3 text-3xl font-bold">{{ feature.title }}</h2>
          <p>{{ feature.description }}</p>
        </div>
        <img
          [class.with-border]="feature.withBorder"
          [src]="'assets/images/whats-new/' + feature.image + '-' + (colorService.isDarkMode() ? 'dark' : 'light') + '.png'"
          [alt]="feature.alt"
          loading="lazy"
        >
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: clamp(2.5rem, 8vw, 7rem);
      width: min(100%, 1240px);
    }

    .feature-card {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      grid-template-areas: "copy image";
      align-items: center;
      gap: clamp(1rem, 4vw, 3rem);
    }

    .feature-copy {
      grid-area: copy;
      max-width: 28rem;
    }

    img {
      grid-area: image;
      display: block;
      justify-self: center;
      max-width: 100%;
      max-height: 44rem;
      object-fit: contain;
    }

    img.with-border {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 1.25rem;
    }

    @media (width > 720px) {
      .feature-card:nth-child(even) {
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        grid-template-areas: "image copy";
      }
    }

    @media (max-width: 720px) {
      .feature-card {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: "copy" "image";
      }
    }
  `,
})
export class ReleaseFeaturesComponent {
  protected readonly colorService = inject(ColorService);

  protected readonly features = [
    {
      title: 'Custom Categories',
      description: 'Open Categories from the menu to create or edit expense categories with your own names, colours and icons.',
      image: 'categories',
      alt: 'Edit category dialog with a live preview, colour palette and icon picker',
    },
    {
      title: 'Spending Budgets',
      description: 'Assign expenses to a budget in Edit input. In the month’s Budgets section, see how much you have left or how far you’re over.',
      image: 'budgets',
      withBorder: true,
      alt: 'Monthly budget radar chart and progress bars comparing spending with three budget limits',
    },
    {
      title: 'Import and Export',
      description: 'Go to Settings → App data to export a full JSON backup or import one to restore your data.',
      image: 'backup',
      alt: 'App data section in Settings with Export full backup and Import full backup buttons',
    },
  ];
}
