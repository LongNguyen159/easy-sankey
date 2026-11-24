import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { UiService } from '../../services/ui.service';
import { ColorService } from '../../services/color.service';
import { RoutePath } from '../../components/models';
import { ReleaseFeaturesComponent } from '../../components/release-features/release-features.component';

@Component({
    selector: 'app-highlighted-features-page',
    imports: [NavbarComponent, CommonModule, MatButtonModule,
        RouterModule, MatCardModule, ReleaseFeaturesComponent
    ],
    templateUrl: './highlighted-features-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './highlighted-features-page.component.scss'
})
export class HighlightedFeaturesPageComponent {
  colorService = inject(ColorService)
  uiService = inject(UiService)

  RoutePath = RoutePath

}
