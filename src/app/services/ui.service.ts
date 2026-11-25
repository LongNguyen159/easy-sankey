import { Component, inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MAT_SNACK_BAR_DATA, MatSnackBar, MatSnackBarModule, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { ConfirmDialogComponent, ConfirmDialogData } from '../components/dialogs/confirm-dialog/confirm-dialog.component';

@Component({
  imports: [MatSnackBarModule, MatButtonModule],
  template: `
    <span matSnackBarLabel>{{ message }}</span>
    <div matSnackBarActions>
      <button matButton="tonal" matSnackBarAction type="button" (click)="ref.dismissWithAction()">Undo</button>
      <button mat-button matSnackBarAction type="button" (click)="ref.dismiss()">Dismiss</button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    [matSnackBarLabel] {
      min-width: 0;
    }

    [matSnackBarActions] {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
      margin: 0;
      padding: 0.5rem 0.75rem;
    }
  `,
})
class UndoSnackBarComponent {
  protected readonly message = inject<string>(MAT_SNACK_BAR_DATA);
  protected readonly ref = inject(MatSnackBarRef<UndoSnackBarComponent>);
}

@Injectable({
  providedIn: 'root'
})

/** Service that handles showing UI components like snackbar, confirm dialog, etc. to notify or prompt user. */
export class UiService {

  private _snackBar = inject(MatSnackBar);
  private _dialog = inject(MatDialog)
  constructor() { }


  showSnackBar(message: string, action: string = 'Dismiss', duration: number = 3000) {
    this._snackBar.open(message, action, {
      duration: duration
    });
  }


  showUndoSnackBar(message: string, undo: () => Promise<void>): void {
    this._snackBar.openFromComponent(UndoSnackBarComponent, {
      data: message,
      announcementMessage: message,
      duration: 20_000,
    }).onAction().subscribe(() => void undo());
  }

  /** Open confirm dialog with given data.
   * @param dialogData Data to be displayed in the dialog
   * @returns Observable<boolean> that emits true if confirmed, false if canceled.
   */
  openConfirmDialog(dialogData: ConfirmDialogData, width: string = '50vw', height: string = '14rem') {
    const dialogRef = this._dialog.open(ConfirmDialogComponent, {
      width: width,
      height: height,
      maxHeight: '80vh',
      data: dialogData
    });


    return dialogRef.afterClosed();
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }


  scrollUpBy70vh() {
    const scrollAmount = Math.min(window.innerHeight * 0.80, 800);
    window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
  }

  scrollDownBy70vh() {
    const scrollAmount = Math.min(window.innerHeight * 0.80, 800);
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
  }
}
