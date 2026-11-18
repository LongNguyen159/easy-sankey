
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
    selector: 'app-restart-dialog',
    imports: [MatDialogModule, MatButtonModule],
    templateUrl: './restart-dialog.component.html',
    styleUrl: './restart-dialog.component.scss'
})
export class RestartDialogComponent {

}
