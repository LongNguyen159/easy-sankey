import { Component } from '@angular/core';
import { CategoryManagerComponent } from '../../components/category-manager/category-manager.component';
import { RoutePath } from '../../components/models';
import { NavbarComponent } from '../../components/navbar/navbar.component';

@Component({
  selector: 'app-categories-page',
  imports: [NavbarComponent, CategoryManagerComponent],
  template: `
    <app-navbar class="navbar" [backLink]="mainPage" backLabel="Main" [showLogo]="false"></app-navbar>
    <div class="mx-auto max-w-5xl p-4">
      <app-category-manager></app-category-manager>
    </div>
  `,
})
export class CategoriesPageComponent {
  protected readonly mainPage = RoutePath.MainPage;
}
