import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ColorService } from '../../services/color.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-user-manual',
    templateUrl: './user-manual.component.html',
    styleUrl: './user-manual.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatIconModule]
})
export class UserManualComponent {
    private readonly colorService = inject(ColorService);
    protected readonly imageTheme = computed(() => this.colorService.isDarkMode() ? 'dark' : 'light');
}
