import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { StorageManagerComponent } from '../../components/storage-manager/storage-manager.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { ColorService } from '../../services/color.service';
import { RoutePath } from '../../components/models';

@Component({
  selector: 'app-storage-page',
  imports: [StorageManagerComponent, NavbarComponent],
  templateUrl: './storage-page.component.html',
  host: { '(window:scroll)': 'onScroll()' },
  styles: [`
    :host { display: block; }

    .finance-content {
      --finance-summary-top: var(--finance-navbar-height);
    }

    .navbar {
      transform: translateY(0);
    }

    .navbar-hidden:not(:focus-within) + .finance-content {
      --finance-summary-top: 0px;
    }

    .navbar-hidden:not(:focus-within) {
      transform: translateY(-100%);
    }

    @media (prefers-reduced-motion: no-preference) {
      .navbar {
        transition: transform 160ms ease;
      }
    }
  `],
})
export class StoragePageComponent {
  private readonly document = inject(DOCUMENT);
  protected readonly colorService = inject(ColorService);
  protected readonly RoutePath = RoutePath;
  protected navbarHidden = false;
  private lastScrollTop = 0;

  protected onScroll(): void {
    const scrollTop = Math.max(0, this.document.documentElement.scrollTop);
    const delta = scrollTop - this.lastScrollTop;
    if (scrollTop <= 64) {
      this.navbarHidden = false;
    } else if (Math.abs(delta) >= 8) {
      this.navbarHidden = delta > 0;
    } else {
      return;
    }
    this.lastScrollTop = scrollTop;
  }
}
