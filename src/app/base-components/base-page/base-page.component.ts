import { Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';

@Component({
    selector: 'app-base-page',
    imports: [],
    templateUrl: './base-page.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './base-page.component.scss'
})
export class BasePageComponent implements OnDestroy {
  protected componentDestroyed$ = new Subject<void>()

  constructor() {}

  ngOnDestroy(): void {
    this.componentDestroyed$.next()
    this.componentDestroyed$.unsubscribe()
  }
}
