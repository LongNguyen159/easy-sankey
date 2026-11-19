import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PERSISTENT_STORAGE } from '../../storage/app-storage';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoragePageComponent } from './storage-page.component';

describe('StoragePageComponent', () => {
  let component: StoragePageComponent;
  let fixture: ComponentFixture<StoragePageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, { provide: PERSISTENT_STORAGE, useValue: localStorage }],
      imports: [StoragePageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StoragePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
