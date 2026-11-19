import { calculateMonth } from '../utils/month-calculation';
import { AppStorage, SessionStore } from '../storage/app-storage';
import { MonthRepository } from '../storage/month.repository';
import { inject, Injectable, signal, EventEmitter } from '@angular/core';
import { EntryType, ExpenseCategory, SankeyData, SYSTEM_PREFIX, TreeNode, UserDefinedLink } from '../components/models';
import { BehaviorSubject } from 'rxjs';
import { UiService } from './ui.service';
import { formatDateToYYYYMM } from '../utils/utils';
import { ConfirmDialogData } from '../components/dialogs/confirm-dialog/confirm-dialog.component';
import { LogsService } from './logs.service';
import { CategoryService } from './category.service';
import { BudgetService } from './budget.service';
import { TrackingService } from './tracking.service';
import { SingleMonthData, MonthlyData } from '../components/models';
import { MonthTransfer } from '../utils/data-transfer';
import { v4 as uuid } from 'uuid';


@Injectable({
  providedIn: 'root'
})

/** This service main purpose is to handle the processing of Input Data (converting raw input data into Sankey Data with source - target - value).
 * 
 * 
 * This is the central processing part of the app. It delegates persistence to the month repository and emits observables for subscribers.
 */
export class DataService {
    private inputSaveQueue:Promise<unknown>=Promise.resolve();
    private readonly storage = inject(AppStorage);
    private readonly sessionStore = inject(SessionStore);
    private readonly months = inject(MonthRepository);
    private UiService = inject(UiService)
    private logService = inject(LogsService)
    private categories = inject(CategoryService)
    private budgets = inject(BudgetService)
    private tracking = inject(TrackingService)

    readonly REMAINING_BALANCE_LABEL = 'Surplus'

    //#region Chart Data
    monthlyData: MonthlyData = {};
    private readonly sankeyDataInit: SankeyData = {
        nodes: [],
        links: []
    }
    private remainingBalance: string = '-';

    /** Emit this object if data has a cycle. Only keep raw input and month for user to correct it.
     * Every other value will be unset to prevent further processing.
     */
    private defaultEmptySingleMonthEntries: SingleMonthData = {
        lastUpdated: '-',
        sankeyData: this.sankeyDataInit,
        totalUsableIncome: -1,
        totalTax: -1,
        totalGrossIncome: -1,
        totalExpenses: -1,
        remainingBalance: this.remainingBalance,
        pieData: [],
        rawInput: [],
        month: '',
        treeMapData: []
    }

    demoLinks: UserDefinedLink[] = [
        { id: 'demo_1' , type: EntryType.Income, target: 'Salary demo', value: 1000, demo: true},
        { id: 'demo_2', type: EntryType.Expense, target: 'Groceries', value: 300, source: ExpenseCategory.Groceries},
        { id: 'demo_3',type: EntryType.Expense, target: 'Pet food', value: 100, source: ExpenseCategory.Groceries},
    ]

    
    /** Behaviour subjects to emit the values. */
    private processedSingleMonthEntries$ = new BehaviorSubject<SingleMonthData>(this.defaultEmptySingleMonthEntries)
    private multiMonthEntries$ = new BehaviorSubject<MonthlyData>(this.monthlyData)
    private dataSaved$ = new BehaviorSubject<boolean>(false)
    //#endregion



    
    //#region States
    /** Signal to check if the app is in demo mode. */
    isDemo = signal(false)

    /** Flag to show/hide advanced options in the form. This being here for state saving only.
     * Meaning components can modify this value. Turning into Signal might also be a good idea.
     */
    isAdvancedShown: boolean = true

    /** Use this to scale all income-expense bar chart to have same scale.
     * This value will be the largest value of either totalUsableIncome or totalExpenses.
     */
    incomeExpenseScaleValue = signal(0)


    /** Data cycle flag. If true, means contains data cycle in the sankey.
     * If this is the case, do not process the data.
     */
    hasDataCycle = signal(false)

    private navigateToFixCost = new EventEmitter<boolean>(false)

    selectedActiveDate: Date = new Date();
    //#endregion

    /** Immutable states */
    get nonAllowedNames(): string[] {
        return [
            'Total Income', 'Usable Income', 'Total Expenses', 'Total Tax', this.REMAINING_BALANCE_LABEL, '-- None --',
            ...this.categories.categories().map(category => category.value),
        ];
    }


    constructor() {
        this.initializeData().catch(error => { this.UiService.showSnackBar(`Could not load data: ${error.message}`); })
    }

    //#region: Initialise Data
    private async initializeData(): Promise<void> {
    
        // Check if it's the user's first time
        if (!Object.keys(this.loadData()).length && (this.isFirstTimeUser() || this.isOldVersion())) {
            console.log('First time user or outdated app version. Processing demo data.');
            await this.processDemoData();
        } else {
            // Load existing data or prepare for user input
            await this.loadExistingData();
        }
    }
    
    isFirstTimeUser(): boolean {
        const firstTime = this.storage.read('firstTime');
        return firstTime == null || firstTime === 'true' || firstTime == undefined;
    }

    isOldVersion(): boolean {
        const storedVersion = this.storage.read('appVersion');
        if (!storedVersion) return true; // Treat as outdated if version is missing
    
        const [major, minor] = storedVersion.split('.').map(Number);
        return major < 2 || (major === 2 && minor < 0);
    }
    
    private async processDemoData(): Promise<void> {
        const todaysDate = new Date();
        await this.processInputData(this.demoLinks, formatDateToYYYYMM(todaysDate), { demo: true, emitObservable: true});
    }
    
    private async loadExistingData(): Promise<void> {
        const savedData = this.loadData();
        if (savedData && Object.keys(savedData).length > 0) {
            this.monthlyData = savedData;  // Load saved data
            // this.processedSingleMonthEntries$.next(this.monthlyData['2024-09']);  // Emit saved data
            this.multiMonthEntries$.next(this.monthlyData);  // Emit all months data
        } else {
            console.log('No saved data found.');
            await this.processInputData([], formatDateToYYYYMM(new Date()));
        }
    }
    //#endregion


    
    /** TODO refactor this to utils file.
     * This function is used by charts to get the current date in the format "YYYY-MM-DD".
     * The date will be shown when user exports the chart as image.
     */
    getTodaysDate() {
        const now = new Date();
        return now.toISOString().slice(0, 10);
    }
    

    //#region: Process Input Data

    /**
     * Processes input data and emits a Subject for single month entries.
     * @param userDefinedLinks - The raw input data from the form.
     * @param month - The month for which to process data, in "YYYY-MM" format.
     * @param options - An object containing optional configuration flags:
     *   - demo: `boolean` (default: `false`) - Indicates if the data is demo data.
     *   - showSnackbarWhenDone: `boolean` (default: `false`) - Shows a snackbar notification when data processing is complete.
     *   - emitObservable: `boolean` (default: `true`) - If `true`, emits an observable with the processed data for further actions.
     *       If `false`, only saves the processed data in local storage without emitting.
     */
    async processInputData(userDefinedLinks: UserDefinedLink[], month: string, options: { demo?: boolean, showSnackbarWhenDone?: boolean, emitObservable?: boolean } = { demo: false, showSnackbarWhenDone: false, emitObservable: true }) {
        const entries=structuredClone(userDefinedLinks);
        const operation=this.inputSaveQueue.then(()=>this.processInputDataNow(entries,month,options));
        this.inputSaveQueue=operation.catch(()=>{});
        return operation;
    }

    private async processInputDataNow(userDefinedLinks: UserDefinedLink[], month: string, options: { demo?: boolean, showSnackbarWhenDone?: boolean, emitObservable?: boolean } = { demo: false, showSnackbarWhenDone: false, emitObservable: true }) {
        /** Prevent overriding default value if not given.
         * e.g. `emitObservable` defaults to true, but if not provided by caller, it will be undefined.
         * This line below will set it to true if it's not provided.
         */
        const { demo = false, showSnackbarWhenDone = false, emitObservable = true } = options;
        userDefinedLinks = this.categories.clearMissingSources(userDefinedLinks);

        /** Sanitise logs on process month data. This is to remove invalid logs (Items ID has been changed, or item has been deleted). */



        /** Early exit if detect negative values. */
        const negatives = userDefinedLinks.filter(link => link.value < 0);
        if (negatives.length > 0) {
            this.UiService.showSnackBar('Negative values are not allowed', 'Dismiss', 5000);
            return;
        }

        /** Check for non valid values field. */
        if ((userDefinedLinks && userDefinedLinks.length > 0) && userDefinedLinks.some(link => typeof link.value !== 'number' || isNaN(link.value))) {
            console.error('Error: One or more values are not valid numbers');
            this.UiService.showSnackBar('One or more values are not valid numbers', 'Dismiss', 5000);
            return;
        }

        if (this.checkDuplicateNames(userDefinedLinks)) {
            this.UiService.showSnackBar('Duplicate names are not allowed', 'Dismiss', 5000);
            return;
        }

        /** Check for restricted name usage */
        const restrictedNames = this.nonAllowedNames;
        const foundLinks = userDefinedLinks.filter(link => restrictedNames.includes(link.target));
        if (foundLinks.length) {
            const dialogData: ConfirmDialogData = {
                title: 'Warning: Restricted Name Usage',
                message: `Some names in your input are reserved for internal use and may cause unexpected behaviours.
                          Please rename the following entries:<br><br>
                          ${foundLinks.map(link => `- "${link.target}"`).join('<br>')}
                         `,
                confirmLabel: 'OK'
            };
            this.UiService.openConfirmDialog(dialogData)
        }

        /** Early exit if detect data cycle */
        if (this.hasDataCycle()) {
            this.UiService.showSnackBar('Data has a cycle! Check your input.', 'Dismiss', 5000);
            console.log('Data has a cycle! Emitting default entries');
            this.defaultEmptySingleMonthEntries = {
                lastUpdated: '-',
                sankeyData: this.sankeyDataInit,
                totalUsableIncome: -1,
                totalTax: -1,
                totalGrossIncome: -1,
                totalExpenses: -1,
                remainingBalance: '-',
                pieData: [],
                rawInput: userDefinedLinks,
                month: month,
                treeMapData: []
            }
            this.processedSingleMonthEntries$.next(this.defaultEmptySingleMonthEntries);
            return;
        }

        /** Demo flag: Only set to true when the app loads for the first time
         * to show our demo graph for first time users.
         */
        if (demo || JSON.stringify(userDefinedLinks) == JSON.stringify(this.demoLinks) || userDefinedLinks.some(link => link.demo)) {
            this.isDemo.set(true)
        } else {
            this.isDemo.set(false)
        }


        const savedMonth = this.loadSingleMonth(month);
        const changed = JSON.stringify(userDefinedLinks) !== JSON.stringify(savedMonth?.rawInput);
        const lastUpdated = changed && userDefinedLinks.length ? new Date() : savedMonth?.lastUpdated || '-';
        const data = this.calculateMonth(userDefinedLinks, month, lastUpdated);
        const updatedMonths = { ...this.monthlyData, [month]: data };

        if (changed && !demo) {
            await this.saveData(updatedMonths);
            await this.logService.sanitiseLogs(month, userDefinedLinks.map(item => item.id));
        }
        this.monthlyData=updatedMonths;
        if (emitObservable) this.processedSingleMonthEntries$.next(data);
        if (showSnackbarWhenDone && !this.isDemo()) {
            this.UiService.showSnackBar('Data updated successfully!', 'OK', 3000);
        }


        return data;
    }

    private calculateMonth(entries: UserDefinedLink[], month: string, lastUpdated: Date | string,
        hasCategory = (id: string) => !!this.categories.get(id)): SingleMonthData {
        return calculateMonth(entries, month, lastUpdated, hasCategory);
    }

    /** Rebuild saved projections after clearing a category from its entries. */
    async removeCategory(id: string): Promise<void> {
        if (!this.categories.get(id)) return;
        const clear = (links: UserDefinedLink[]) => links.map(link => {
            if (link.source !== id) return link;
            const { source, ...uncategorized } = link;
            return uncategorized;
        });

        if (await this.storage.deleteCategory(id)) {
            this.categories.reloadFromStorage();
            this.budgets.budget.set(this.budgets.getBudgets());
            this.tracking.reloadFromStorage();
            this.tracking.categoriesToTrack.update(ids => ids.filter(value => value !== id));
            this.demoLinks=clear(this.demoLinks);
            const copied=this.retrieveCopiedLinks();
            if(copied) this.storeCopiedLinks(clear(copied));
            this.monthlyData=this.loadData();
            this.multiMonthEntries$.next(this.monthlyData);
            const active=this.processedSingleMonthEntries$.value;
            this.processedSingleMonthEntries$.next(this.monthlyData[active.month] ??
                this.calculateMonth(clear(active.rawInput),active.month,active.lastUpdated));
            return;
        }
        const active = this.processedSingleMonthEntries$.value;
        const activeWasSaved = active === this.monthlyData[active.month];
        const affectedMonths = Object.entries(this.monthlyData)
            .filter(([, data]) => data.rawInput.some(link => link.source === id));

        if (affectedMonths.length) {
            const updatedMonths = { ...this.monthlyData };
            for (const [month, data] of affectedMonths) {
                updatedMonths[month] = this.calculateMonth(clear(data.rawInput), month, data.lastUpdated);
            }
            await this.saveData(updatedMonths);
        }

        this.demoLinks = clear(this.demoLinks);
        const fixed = this.retrieveFixCostsLinks();
        if (fixed.some(link => link.source === id)) {
            await this.storage.write('fixCosts', clear(fixed));
        }
        const copied = this.retrieveCopiedLinks();
        if (copied?.some(link => link.source === id)) this.storeCopiedLinks(clear(copied));

        const budgets = this.budgets.getBudgets();
        if (budgets.some(budget => budget.category === id)) {
            await this.budgets.saveBudgets(budgets.filter(budget => budget.category !== id));
        }
        if (this.tracking.getTrackingData().some(tracker => tracker.name === id)) {
            await this.tracking.removeTrackingData(id);
        }
        this.tracking.categoriesToTrack.update(ids => ids.filter(category => category !== id));

        const essentials: string[] = this.storage.read('essentialCategories') ?? [];
        if (essentials.includes(id)) {
            await this.storage.write('essentialCategories', essentials.filter(category => category !== id));
        }
        await this.categories.remove(id);

        if (active.rawInput.some(link => link.source === id)) {
            const rawInput = clear(active.rawInput);
            let updatedActive = activeWasSaved ? this.monthlyData[active.month] : { ...active, rawInput };
            if (!activeWasSaved && active.totalExpenses !== -1) {
                updatedActive = this.calculateMonth(rawInput, active.month, active.lastUpdated);
            }
            this.processedSingleMonthEntries$.next(updatedActive);
        }
    }

    checkDuplicateNames(links: UserDefinedLink[]): boolean {
        const values: string[] = links.map(link => link.target);
        // Track duplicates
        const seen = new Set<string>();
        const duplicateNames = values.filter((item) => {
        const normalizedItem = item.toLowerCase().trim();
        if (seen.has(normalizedItem)) {
            return true;
        }
        seen.add(normalizedItem);
        return false;
        });

        if (duplicateNames.length > 0) {
        return true
        } else {
        return false
        }
    }

    /** Update Raw input to correctly reflect the parent value as sum of their children values.
     * @param oldInput - The original input data.
     * @param changedExpenses - The array of changed expenses during calculation.
     * 
     * @returns The updated input data with parent values updated to reflect the sum of their children.
     */
    //#endregion


    //#region Local Storage
    /** Commit source records through SQLite before notifying subscribers. */
    private async saveData(monthlyData = this.monthlyData) {
        const nonEmptyMonthlyData = Object.keys(monthlyData).reduce((result, month) => {
            const data = monthlyData[month];
            // Check if the data contains meaningful entries (you can adjust conditions as needed)
            if (data.rawInput.length > 0 || data.totalGrossIncome > 0 || data.totalExpenses > 0) {
                result[month] = data; // Only keep non-empty months
            }
            return result;
        }, {} as MonthlyData);
    
        // The repository owns persistence; these objects also remain the runtime view model.
        await this.months.replaceAll(nonEmptyMonthlyData);
        this.monthlyData = monthlyData;

        // Emit all months data
        this.multiMonthEntries$.next(nonEmptyMonthlyData);
        this.dataSaved$.next(true);
    }

    loadData(): MonthlyData {
        return this.months.list();
    }

    loadSingleMonth(month: string): SingleMonthData | null {
        return this.months.get(month);
    }

    /** Delete persisted entries, then update the runtime views. */
    async removeMonth(month: string): Promise<void> {
        if (!(await this.months.delete(month))) return;
        this.logService.reloadFromStorage();
        const empty=this.calculateMonth([],month,'-');
        this.monthlyData={...this.loadData(),[month]:empty};
        this.processedSingleMonthEntries$.next(empty);
        this.multiMonthEntries$.next(this.loadData());
        this.dataSaved$.next(true);
    }
    //#endregion


    //#region Copy & Paste Links
    async importMonth(month: string, { entries, categories }: MonthTransfer): Promise<void> {
        const currentCategories = this.categories.categories();
        const definitions = new Map(currentCategories.map(category => [category.value, category]));
        const sources = new Set(entries.map(entry => entry.source));
        for (const category of categories) {
            if (sources.has(category.value) && !definitions.has(category.value)) {
                definitions.set(category.value, category);
            }
        }

        const reservedNames = new Set([...this.nonAllowedNames, ...definitions.keys()]);
        if (this.checkDuplicateNames(entries) || entries.some(({ target }) => reservedNames.has(target.trim()))) {
            throw new Error('The copied month has duplicate or reserved entry names.');
        }

        // Follow each expense's parent chain once to catch cycles before calculation.
        const parents = new Map(entries.filter(entry => entry.type === EntryType.Expense)
            .map(entry => [entry.target, entry.source]));
        const checked = new Set<string>();
        for (const target of parents.keys()) {
            const path = new Set<string>();
            for (let node: string | undefined = target; node && !checked.has(node); node = parents.get(node)) {
                if (path.has(node)) throw new Error('The copied month has a cycle in its expenses.');
                path.add(node);
            }
            for (const node of path) checked.add(node);
        }

        const links = entries.map(({ source, type, target, value, isFixCost }) => ({
            id: uuid(), type, target, value, isFixCost,
            source: type === EntryType.Expense && (!source?.endsWith(`@${SYSTEM_PREFIX}`) || definitions.has(source))
                ? source ?? undefined : undefined
        }));
        const data = this.calculateMonth(links, month, new Date(), id => definitions.has(id));
        const savedMonths = { ...this.loadData(), [month]: data };
        const addedCategories = definitions.size > currentCategories.length;
        await this.months.importMonth(data, addedCategories ? [...definitions.values()] : undefined);

        if (addedCategories) this.categories.reloadFromStorage();
        this.logService.reloadFromStorage();
        this.monthlyData = { ...this.monthlyData, ...savedMonths };
        this.isDemo.set(false);
        this.hasDataCycle.set(false);
        this.multiMonthEntries$.next(savedMonths);
        this.processedSingleMonthEntries$.next(data);
        this.dataSaved$.next(true);
    }

    storeCopiedLinks(links: UserDefinedLink[]) {
        this.sessionStore.write('copiedLinks', links);
    }

    retrieveCopiedLinks(): UserDefinedLink[] | null {
        const data = this.sessionStore.read('copiedLinks');
        return data ? this.categories.clearMissingSources(data) : null;
    }


    retrieveFixCostsLinks(): UserDefinedLink[] {
        const fixedLinks = this.storage.read('fixCosts')
        return fixedLinks ? this.categories.clearMissingSources(fixedLinks) : [];
    }

    //#endregion





    //#region Dialogs

    toggleAdvanced() {
        this.isAdvancedShown = !this.isAdvancedShown;
    }

    //#endregion
    

    setNavigateFixCostState(value: boolean) {
        this.navigateToFixCost.emit(value)
    }

    getNavigateFixCostState() {
        return this.navigateToFixCost.asObservable()
    }

    //#region: Getters
    /** Get single month entries */
    getSingleMonthData() {
        return this.processedSingleMonthEntries$.asObservable()
    }


    /** Get all months entries. Key as yyyy-mm format, value are corresponding entries. */
    getAllMonthsData() {
        return this.multiMonthEntries$.asObservable()
    }

    isDataSaved() {
        return this.dataSaved$.asObservable()
    }

    //#endregion
}
