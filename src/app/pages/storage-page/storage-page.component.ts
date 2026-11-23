import { Component, inject } from '@angular/core';
import { StorageManagerComponent } from '../../components/storage-manager/storage-manager.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { ColorService } from '../../services/color.service';
import { RoutePath } from '../../components/models';

@Component({
  selector: 'app-storage-page',
  imports: [StorageManagerComponent, NavbarComponent],
  templateUrl: './storage-page.component.html',
})
export class StoragePageComponent {
  protected readonly colorService = inject(ColorService);
  protected readonly RoutePath = RoutePath;
}
