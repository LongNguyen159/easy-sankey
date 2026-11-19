import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTestDatabase } from '../../testing/database';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocsPageComponent } from './docs-page.component';

describe('DocsPageComponent', () => {
  let component: DocsPageComponent;
  let fixture: ComponentFixture<DocsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [DatePipe, provideNoopAnimations(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: {} }, { provide: MatDialogRef, useValue: { close: () => {} } }, ...provideTestDatabase()],
      imports: [DocsPageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DocsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
