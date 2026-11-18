import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { DemoChartComponent } from '../../components/charts/demo-chart/demo-chart.component';
import { GraphicTextComponent } from "../../components/charts/graphic-text/graphic-text.component";
import { RoutePath } from '../../components/models';

@Component({
    selector: 'app-welcome-page',
    imports: [DemoChartComponent, MatButtonModule, MatIconModule, RouterModule, GraphicTextComponent],
    templateUrl: './welcome-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './welcome-page.component.scss'
})
export class WelcomePageComponent {
  constructor(private router: Router) {}


  navigateToDocs() {
    this.router.navigate([RoutePath.Docs]);
  }

  navigateToHighlightedFeatures() {
    this.router.navigate([RoutePath.HighlightedFeaturesPage]);
  }
}
