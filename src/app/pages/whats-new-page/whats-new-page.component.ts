import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { UiService } from '../../services/ui.service';
import { MatCardModule } from '@angular/material/card';
import { RoutePath } from '../../components/models';
import { ReleaseFeaturesComponent } from '../../components/release-features/release-features.component';

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
}
