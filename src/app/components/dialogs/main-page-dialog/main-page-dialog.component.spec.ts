import { emptyMonth } from '../../../testing/fixtures';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainPageDialogComponent } from './main-page-dialog.component';

describe('MainPageDialogComponent', () => {
  let component: MainPageDialogComponent;
  let fixture: ComponentFixture<MainPageDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: emptyMonth }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage }],
      imports: [MainPageDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MainPageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
