import { Component } from '@angular/core';
import { FixCostInputComponent } from '../../components/fix-cost-input/fix-cost-input.component';
import { RoutePath } from '../../components/models';
import { NavbarComponent } from '../../components/navbar/navbar.component';

@Component({
  selector: 'app-fix-costs-page',
  imports: [NavbarComponent, FixCostInputComponent],
  template: `
    <app-navbar class="navbar" [backLink]="mainPage" backLabel="Main" [showLogo]="false"></app-navbar>
    <div class="mx-auto max-w-5xl p-4">
      <app-fix-cost-input></app-fix-cost-input>
    </div>
  `,
})
export class FixCostsPageComponent {
  protected readonly mainPage = RoutePath.MainPage;
}
