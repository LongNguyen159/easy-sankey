import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { CategoryManagerComponent } from '../../category-manager/category-manager.component';

@Component({
  selector: 'app-manage-categories-dialog',
  imports: [MatButtonModule, MatDialogModule, CategoryManagerComponent],
  template: `
    <h2 mat-dialog-title>Manage categories</h2>
    <mat-dialog-content>
      <app-category-manager [showHeading]="false"></app-category-manager>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close>Done</button>
    </mat-dialog-actions>
  `,
})
export class ManageCategoriesDialogComponent {}
