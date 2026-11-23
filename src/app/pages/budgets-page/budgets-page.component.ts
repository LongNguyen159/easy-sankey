import { Component } from '@angular/core';
import { GlobalEnvelopeManagerComponent } from '../../components/global-envelope-manager/global-envelope-manager.component';
import { RoutePath } from '../../components/models';
import { NavbarComponent } from '../../components/navbar/navbar.component';

@Component({
  selector: 'app-budgets-page',
  imports: [NavbarComponent, GlobalEnvelopeManagerComponent],
  template: `
    <app-navbar class="navbar" [backLink]="mainPage" backLabel="Main" [showLogo]="false"></app-navbar>
    <div class="mx-auto max-w-5xl p-4">
      <app-global-envelope-manager></app-global-envelope-manager>
    </div>
  `,
})
export class BudgetsPageComponent {
  protected readonly mainPage = RoutePath.MainPage;
}
