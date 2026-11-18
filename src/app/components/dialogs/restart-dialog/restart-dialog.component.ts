
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
    selector: 'app-restart-dialog',
    imports: [MatDialogModule, MatButtonModule],
    templateUrl: './restart-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './restart-dialog.component.scss'
})
export class RestartDialogComponent {

}
