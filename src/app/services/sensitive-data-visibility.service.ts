import { DOCUMENT } from '@angular/common';
import { inject, Injectable, NgZone, signal } from '@angular/core';

const sensitiveText = [
  '[data-sensitive-data]',
  '[echarts] svg text',
  '.app-chart-tooltip',
  '.mat-mdc-tooltip',
  '.mat-calendar-body-cell-content',
  '.mat-calendar-body-label',
  '.mat-calendar-period-button .mdc-button__label',
  '.mdc-slider__value-indicator',
  '.mat-mdc-snack-bar-label',
].join(', ');

// Material icon fonts use text ligatures, including names such as lightbulb_2.
const materialIcon = 'mat-icon, .material-icons, .material-symbols-outlined, .material-symbols-rounded, .material-symbols-sharp';

function redactNumbers(text: string): string {
  return text.replace(/\p{Nd}+(?:[.,'’\u00a0\u202f]\p{Nd}+)*/gu, '****');
}

@Injectable({ providedIn: 'root' })
export class SensitiveDataVisibilityService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly hidden = signal(false);
  private readonly originals = new Map<Text, string>();
  private observer?: MutationObserver;
  readonly isHidden = this.hidden.asReadonly();

  toggle(): void {
    const hidden = !this.hidden();
    this.document.documentElement.classList.toggle('app-hide-sensitive-data', hidden);
    this.zone.runOutsideAngular(() => {
      if (hidden) {
        this.startRedacting();
      } else {
        this.restoreText();
      }
    });
    this.hidden.set(hidden);
  }

  private startRedacting(): void {
    this.redactWithin(this.document.body);
    this.observer = new MutationObserver(records => {
      this.observer?.disconnect();
      for (const record of records) {
        if (record.type === 'characterData') {
          this.redactText(record.target as Text);
        } else {
          record.addedNodes.forEach(node => this.redactWithin(node));
        }
      }
      if (records.some(record => record.removedNodes.length)) {
        // Restore detached content before Angular or ECharts can reuse it.
        for (const [node, original] of this.originals) {
          if (!node.isConnected) this.restoreNode(node, original);
        }
      }
      this.observe();
    });
    this.observe();
  }

  private observe(): void {
    this.observer?.observe(this.document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  private redactWithin(node: Node): void {
    if (node instanceof Text) {
      this.redactText(node);
      return;
    }
    const walker = this.document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) this.redactText(walker.currentNode as Text);
  }

  private redactText(node: Text): void {
    const parent = node.parentElement;
    if (!parent?.closest(sensitiveText) || parent.closest(materialIcon)) return;
    const original = this.originals.get(node);
    if (original !== undefined && node.data === redactNumbers(original)) return;

    const redacted = redactNumbers(node.data);
    if (redacted === node.data) {
      this.originals.delete(node);
      return;
    }
    this.originals.set(node, node.data);
    node.data = redacted;
  }

  private restoreText(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const [node, original] of this.originals) {
      this.restoreNode(node, original);
    }
  }

  private restoreNode(node: Text, original: string): void {
    if (node.data === redactNumbers(original)) node.data = original;
    this.originals.delete(node);
  }
}
