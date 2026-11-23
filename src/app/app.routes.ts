import {inject} from '@angular/core';
import {DataService} from './services/data.service';
import { Routes } from '@angular/router';
import { RoutePath } from './components/models';

/** Trim out the '/' slash, only start from the actual link. */
export const routes: Routes = [
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.Docs.split('/')[1], loadComponent: () => import('./pages/docs-page/docs-page.component').then(m => m.DocsPageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.MainPage.split('/')[1], loadComponent: () => import('./pages/main-page/main-page.component').then(m => m.MainPageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.WelcomePage.split('/')[1], loadComponent: () => import('./pages/welcome-page/welcome-page.component').then(m => m.WelcomePageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.WhatsNewPage.split('/')[1], loadComponent: () => import('./pages/whats-new-page/whats-new-page.component').then(m => m.WhatsNewPageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.FinanceManagerPage.split('/')[1], loadComponent: () => import('./pages/storage-page/storage-page.component').then(m => m.StoragePageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.BudgetsPage.slice(1), loadComponent: () => import('./pages/budgets-page/budgets-page.component').then(m => m.BudgetsPageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.FixCostsPage.slice(1), loadComponent: () => import('./pages/fix-costs-page/fix-costs-page.component').then(m => m.FixCostsPageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.CategoriesPage.slice(1), loadComponent: () => import('./pages/categories-page/categories-page.component').then(m => m.CategoriesPageComponent) },
    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.HighlightedFeaturesPage.split('/')[1], loadComponent: () => import('./pages/highlighted-features-page/highlighted-features-page.component').then(m => m.HighlightedFeaturesPageComponent) },

    { canDeactivate:[()=>inject(DataService).flushEdits()], path: RoutePath.SmartBudgeterPage.split('/')[1], loadComponent: () => import('./pages/smart-budgeter/smart-budgeter.component').then(m => m.SmartBudgeterComponent) },


    { path: '**', redirectTo: RoutePath.MainPage }
];
