import {DATABASE_CLIENT} from '../../data/database';
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { UserManualComponent } from '../../components/user-manual/user-manual.component';
import { NavbarComponent } from "../../components/navbar/navbar.component";
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {MatSnackBar, MatSnackBarModule} from '@angular/material/snack-bar';

@Component({
    selector: 'app-docs-page',
    imports: [
        MatButtonModule, MatIconModule, MatMenuModule,
        UserManualComponent, NavbarComponent, MatSnackBarModule
    ],
    templateUrl: './docs-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './docs-page.component.scss'
})
export class DocsPageComponent {
  private readonly database = inject(DATABASE_CLIENT);
  private _snackBar = inject(MatSnackBar);


  async clearLocalStorage() {
    await this.database.reset();
    this._snackBar.open('Saved data cleared', 'Dismiss', {
      duration: 2000,
    })
  }
}
