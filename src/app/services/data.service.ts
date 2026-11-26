import { calculateMonth, projectSavings } from '../utils/month-calculation';
import {CONFIGURATION, DATABASE_CLIENT} from '../data/database';
import {SettingsService} from './settings.service';
import {FixedCostService} from './fixed-cost.service';
import { SessionStore } from '../services/session.service';
import {StoredMonth,HistoryItem} from '../data/database';

import { effect, inject, Injectable, signal, EventEmitter, untracked } from '@angular/core';
import { BudgetEnvelope, EntryType, ExpenseCategory, SankeyData, TreeNode, UserDefinedLink } from '../components/models';
import { BehaviorSubject } from 'rxjs';
import { UiService } from './ui.service';
import { formatDateToYYYYMM } from '../utils/utils';
import { ConfirmDialogData } from '../components/dialogs/confirm-dialog/confirm-dialog.component';
import { LogsService } from './logs.service';
import { CategoryService } from './category.service';
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
    private readonly preferences = inject(SettingsService);
    private readonly sessionStore = inject(SessionStore);
    private readonly database=inject(DATABASE_CLIENT);
    private readonly fixedCosts=inject(FixedCostService);

    readonly globalEnvelopes = signal<BudgetEnvelope[]>(structuredClone(inject(CONFIGURATION).globalEnvelopes ?? []));
    readonly loading=signal(true);
    readonly loadError=signal<string|null>(null);
    readonly ready:Promise<void>;
    private selection=0;
    private sources=new Map<string,StoredMonth>();
    private editors=new Set<()=>Promise<boolean>>();
    private failedDrafts=new Map<string,UserDefinedLink[]>();
    registerEditor(flush:()=>Promise<boolean>){this.editors.add(flush);return ()=>this.editors.delete(flush);}
    async flushEdits():Promise<boolean>{for(const flush of this.editors)if(!await flush())return false;return true;}
    private UiService = inject(UiService)
    private logService = inject(LogsService)
    private categories = inject(CategoryService)
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
        const investmentIds = () => new Set(this.categories.categories()
            .filter(category => category.classification === 'INVESTMENT')
            .map(category => category.value));
        let previousInvestments = investmentIds();
        effect(() => {
            const investments = investmentIds();
            const changedIds = new Set([
                ...[...previousInvestments].filter(id => !investments.has(id)),
                ...[...investments].filter(id => !previousInvestments.has(id)),
            ]);
            previousInvestments = investments;
            if (changedIds.size) untracked(() => this.refreshSavingsProjections(changedIds, investments));
        });
        this.ready=this.initializeData().catch(error => {this.loadError.set(error.message);this.UiService.showSnackBar(`Could not load data: ${error.message}`);}).finally(()=>this.loading.set(false));
    }

    //#region: Initialise Data
    private async initializeData(): Promise<void> {
    
        // Check if it's the user's first time
        // Welcome navigation can update preferences while the first query is in flight.
        const showDemo = this.isFirstTimeUser() || this.isOldVersion();
        this.monthlyData=await this.loadData();
        if (!Object.keys(this.monthlyData).length && showDemo) {
            console.log('First time user or outdated app version. Processing demo data.');
            await this.processDemoData();
        } else {
            // Load existing data or prepare for user input
            await this.loadExistingData();
        }
    }
    
    isFirstTimeUser(): boolean {
        const firstTime = this.preferences.read('firstTime');
        return firstTime == null || firstTime === 'true' || firstTime == undefined;
    }

    isOldVersion(): boolean {
        const storedVersion = this.preferences.read('appVersion');
        if (!storedVersion) return true; // Treat as outdated if version is missing
    
        const [major, minor] = storedVersion.split('.').map(Number);
        return major < 2 || (major === 2 && minor < 0);
    }
    
    private async processDemoData(): Promise<void> {
        const todaysDate = new Date();
        await this.saveMonthDraft(this.demoLinks, formatDateToYYYYMM(todaysDate), { demo: true, emitObservable: true});
    }
    
    private async loadExistingData(): Promise<void> {
        const savedData = this.monthlyData;
        if (savedData && Object.keys(savedData).length > 0) {
            this.monthlyData = savedData;  // Load saved data
            // this.processedSingleMonthEntries$.next(this.monthlyData['2024-09']);  // Emit saved data
            this.multiMonthEntries$.next(this.monthlyData);  // Emit all months data
        } else {
            console.log('No saved data found.');
        }
        const month = formatDateToYYYYMM(this.selectedActiveDate);
        this.processedSingleMonthEntries$.next(
            this.monthlyData[month] ?? this.calculateMonth([], month, '-'),
        );
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
     *       If `false`, only saves the processed data in the database without emitting.
     */
    async saveMonthDraft(userDefinedLinks: UserDefinedLink[], month: string, options: { demo?: boolean, showSnackbarWhenDone?: boolean, emitObservable?: boolean } = { demo: false, showSnackbarWhenDone: false, emitObservable: true }) {
        const entries=structuredClone(userDefinedLinks);
        const history=this.logService.pendingFor(month);
        const operation=this.inputSaveQueue.then(()=>this.commitMonthDraft(entries,month,options,history));
        this.inputSaveQueue=operation.catch(()=>{});
        return operation.then(result=>{this.failedDrafts.delete(month);return result;},error=>{this.failedDrafts.set(month,entries);throw error;});
    }

    private async commitMonthDraft(userDefinedLinks: UserDefinedLink[], month: string, options: { demo?: boolean, showSnackbarWhenDone?: boolean, emitObservable?: boolean } = { demo: false, showSnackbarWhenDone: false, emitObservable: true }, history?:Record<string,HistoryItem>) {
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


        const savedSource=this.sources.get(month)??null;
        const savedMonth = savedSource ? this.project(savedSource) : null;
        const changed = JSON.stringify(userDefinedLinks) !== JSON.stringify(savedSource?.entries);
        const lastUpdated = changed && userDefinedLinks.length ? new Date() : savedMonth?.lastUpdated || '-';
        const data = this.calculateMonth(userDefinedLinks, month, lastUpdated, undefined, savedSource?.envelopes ?? []);
        const updatedMonths = { ...this.monthlyData, [month]: data };

        if (changed && !this.isDemo()) {
            if(userDefinedLinks.length || savedSource?.envelopes?.length) {const saved=(await this.database.command(()=>this.database.api.months.save({month,entries:userDefinedLinks,lastUpdated:lastUpdated === '-' ? '-' : new Date(lastUpdated).toISOString(),expectedRevision:savedSource?.revision??null,history:history?Object.fromEntries(Object.entries(history).filter(([id])=>userDefinedLinks.some(entry=>entry.id===id))):undefined}))).value;this.sources.set(month,saved);}
            else if(savedSource) {(await this.database.command(()=>this.database.api.months.remove({month}))).value;this.sources.delete(month);}
            const entryIds = new Set(userDefinedLinks.map(entry => entry.id));
            const removedIds = savedSource?.entries.filter(entry => !entryIds.has(entry.id)).map(entry => entry.id);
            this.logService.commitPending(month, history, removedIds);
            this.multiMonthEntries$.next(Object.fromEntries(Object.entries(updatedMonths).filter(([,value])=>value.rawInput.length || value.envelopes?.length)));
            this.dataSaved$.next(true);
        }
        this.monthlyData=updatedMonths;
        if (this.isDemo()) this.multiMonthEntries$.next(updatedMonths);
        if (emitObservable) this.processedSingleMonthEntries$.next(data);
        if (showSnackbarWhenDone && !this.isDemo()) {
            this.UiService.showSnackBar('Data updated successfully!', 'OK', 3000);
        }


        return data;
    }

    getEntryForChart(name: string): UserDefinedLink | undefined {
      const active = this.processedSingleMonthEntries$.value;
      return (this.sources.get(active.month)?.entries ?? active.rawInput).find(entry => entry.target === name);
    }

    async updateEntryAmount(month:string,entry:UserDefinedLink,value:number,expression:string|number):Promise<void> {
      const source=this.sources.get(month);
      if(!source)throw new Error('Month is not loaded.');
      const original=source.entries.find(item=>item.id===entry.id);
      if(!original)throw new Error('Entry does not exist.');
      const updated={...original,value,lastEditedAt:Date.now()};
      const timestamp=new Date().toLocaleString('en-GB',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      await this.database.command(()=>this.database.api.entries.update({month,id:updated.id,changes:{value,lastEditedAt:updated.lastEditedAt},expected:original,history:{[updated.id]:{timestamp,value:expression}}}));
      const saved=await this.database.api.months.get(month);
      if(!saved)throw new Error('Month does not exist.');
      this.sources.set(month,saved);
      const data=this.project(saved);this.monthlyData={...this.monthlyData,[month]:data};
      this.multiMonthEntries$.next(this.monthlyData);
      if(this.processedSingleMonthEntries$.value.month===month)this.processedSingleMonthEntries$.next(data);
      this.logService.invalidateEntries(month, [updated.id]);
      this.dataSaved$.next(true);
    }

    private refreshSavingsProjections(changedIds: ReadonlySet<string>, investments: ReadonlySet<string>): void {
        const refresh = (month: SingleMonthData): SingleMonthData => month.treeMapData.some(node => changedIds.has(node.name))
            ? { ...month, ...projectSavings(month, id => investments.has(id)) }
            : month;
        this.monthlyData = Object.fromEntries(Object.entries(this.monthlyData).map(([month, data]) => [month, refresh(data)]));
        this.multiMonthEntries$.next(this.monthlyData);

        const active = this.processedSingleMonthEntries$.value;
        const updated = refresh(active);
        if (updated !== active) this.processedSingleMonthEntries$.next(updated);
    }

    private calculateMonth(entries: UserDefinedLink[], month: string, lastUpdated: Date | string,
        hasCategory = (id: string) => !!this.categories.get(id), envelopes: BudgetEnvelope[] = []): SingleMonthData {
        const locals = envelopes.filter(envelope => !envelope.isGlobal);
        return calculateMonth(entries, month, lastUpdated, hasCategory, [...this.globalEnvelopes(), ...locals],
            id => this.categories.get(id)?.classification === 'INVESTMENT');
    }

    async saveEnvelopes(month: string, envelopes: BudgetEnvelope[], globals?: BudgetEnvelope[], expectedGlobals?: BudgetEnvelope[]): Promise<void> {
      return this.queueEnvelopeSave(month, () => envelopes, globals, expectedGlobals);
    }

    async deleteLocalEnvelope(month: string, id: string): Promise<void> {
      return this.queueEnvelopeSave(month, (source) => {
        const envelopes = source?.envelopes ?? [];
        if (envelopes.some(envelope => envelope.id === id)) {
          return envelopes.filter(envelope => envelope.id !== id);
        }
        return undefined;
      });
    }

    private queueEnvelopeSave(month: string, getEnvelopes: (source: StoredMonth | undefined) => BudgetEnvelope[] | undefined,
        globals?: BudgetEnvelope[], expectedGlobals?: BudgetEnvelope[]): Promise<void> {
      const operation = this.inputSaveQueue.then(async () => {
        const source = this.sources.get(month);
        const envelopes = getEnvelopes(source);
        if (!envelopes) return;
        const ids = new Set([...envelopes, ...(globals ?? this.globalEnvelopes())].map(envelope => envelope.id));
        const entries = (source?.entries ?? this.monthlyData[month]?.rawInput ?? []).map(entry =>
          entry.envelopeId && !ids.has(entry.envelopeId) ? {...entry, envelopeId: null} : entry);
        const saved = (await this.database.command(() => this.database.api.months.save({
          month, entries, envelopes, globalEnvelopes: globals, expectedGlobalEnvelopes: expectedGlobals, lastUpdated: new Date().toISOString(), expectedRevision: source?.revision ?? null,
        }))).value;
        this.sources.set(month, saved);
        const activeMonth = this.processedSingleMonthEntries$.value.month;
        this.monthlyData = await this.loadData();
        this.isDemo.set(false);
        this.multiMonthEntries$.next(this.monthlyData);
        if (activeMonth) this.processedSingleMonthEntries$.next(this.monthlyData[activeMonth] ?? this.calculateMonth([], activeMonth, '-'));
        this.dataSaved$.next(true);
      });
      this.inputSaveQueue = operation.catch(() => {});
      return operation;
    }

    async saveGlobalEnvelopes(items: BudgetEnvelope[], base: BudgetEnvelope[]): Promise<void> {
      const operation = this.inputSaveQueue.then(async () => {
        await this.database.command(() => this.database.api.envelopes.replaceGlobal({items, base}));
        const activeMonth = this.processedSingleMonthEntries$.value.month;
        this.monthlyData = await this.loadData();
        this.multiMonthEntries$.next(this.monthlyData);
        if (activeMonth) this.processedSingleMonthEntries$.next(this.monthlyData[activeMonth] ?? this.calculateMonth([], activeMonth, '-'));
        this.dataSaved$.next(true);
      });
      this.inputSaveQueue = operation.catch(() => {});
      return operation;
    }

    /** Rebuild saved projections after clearing a category from its entries. */
    async removeCategory(id: string): Promise<void> {
        if (!this.categories.get(id)) return;
        const clear = (links: UserDefinedLink[]) => links.map(link => {
            if (link.source !== id) return link;
            const { source, ...uncategorized } = link;
            return uncategorized;
        });

        await this.categories.remove(id);
        await Promise.all([this.tracking.reload(),this.fixedCosts.reload(),this.preferences.reload()]);
        this.tracking.categoriesToTrack.update(ids=>ids.filter(value=>value!==id));
        this.demoLinks=clear(this.demoLinks);
        const copied=this.retrieveCopiedLinks();if(copied)this.storeCopiedLinks(clear(copied));
        this.monthlyData=await this.loadData();
        this.multiMonthEntries$.next(this.monthlyData);
        const active=this.processedSingleMonthEntries$.value;
        this.processedSingleMonthEntries$.next(this.monthlyData[active.month]??this.calculateMonth(clear(active.rawInput),active.month,active.lastUpdated));
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


    private project(source:StoredMonth):SingleMonthData {return this.calculateMonth(source.entries,source.month,source.lastUpdated,undefined,source.envelopes ?? []);}

    async loadData():Promise<MonthlyData> {
      const [globals, result] = await Promise.all([this.database.api.envelopes.listGlobal(), this.database.api.months.range()]);
      this.globalEnvelopes.set(globals);
      const sources=result.value;this.sources=new Map(sources.map(source=>[source.month,source]));
      return Object.fromEntries(sources.map(source=>[source.month,this.project(source)]));
    }
    async loadSingleMonth(month:string):Promise<SingleMonthData|null> {
      const source=await this.database.api.months.get(month);if(!this.failedDrafts.has(month)){if(source)this.sources.set(month,source);else this.sources.delete(month);}return source?this.project(source):null;
    }
    /** Querying a month never saves it. Stale responses cannot replace the active selection. */
    async selectMonth(month:string):Promise<void> {
      const selection=++this.selection;
      await this.ready;
      const loaded=await this.loadSingleMonth(month);
      const draft=this.failedDrafts.get(month);
      const preview=this.monthlyData[month];
      const demo=preview?.rawInput.some(entry=>entry.demo)?preview:null;
      const data=draft?this.calculateMonth(draft,month,loaded?.lastUpdated??'-',undefined,loaded?.envelopes ?? []):loaded??demo??this.calculateMonth([],month,'-');
      if(selection===this.selection){
        this.isDemo.set(data.rawInput.some(entry=>!!entry.demo));
        this.processedSingleMonthEntries$.next(data);
      }
    }

    /** Delete persisted entries, then update the runtime views. */
    async removeMonth(month: string): Promise<void> {
        if (!((await this.database.command(()=>this.database.api.months.remove({month}))).value)) return;
        await this.logService.reload();
        const empty=this.calculateMonth([],month,'-');
        this.monthlyData={...await this.loadData(),[month]:empty};
        this.processedSingleMonthEntries$.next(empty);
        this.multiMonthEntries$.next(await this.loadData());
        this.dataSaved$.next(true);
    }
    //#endregion


    //#region Copy & Paste Links
    importMonth(month: string, transfer: MonthTransfer, replacedIds: ReadonlySet<string> = new Set()): Promise<() => Promise<boolean>> {
        const operation = this.inputSaveQueue.then(() => this.commitMonthTransfer(month, transfer, replacedIds));
        this.inputSaveQueue = operation.catch(() => {});
        return operation;
    }

    private async commitMonthTransfer(month: string, { entries, categories, envelopes = [], sourceMonth }: MonthTransfer,
        replacedIds: ReadonlySet<string>): Promise<() => Promise<boolean>> {
        const destination = this.sources.get(month);
        const normalize = (name: string) => name.trim().toLowerCase();
        const existing = new Map((destination?.entries ?? []).map(entry => [normalize(entry.target), entry]));
        const remaining = (destination?.entries ?? []).filter(entry => !replacedIds.has(entry.id)).map(entry => {
            let source = entry.source;
            const visited = new Set<string>();
            while (source) {
                const parent = existing.get(normalize(source));
                if (!parent || !replacedIds.has(parent.id)) break;
                if (visited.has(parent.id)) {
                    source = undefined;
                    break;
                }
                visited.add(parent.id);
                source = parent.source;
            }
            return source === entry.source ? entry : { ...entry, source };
        });
        const currentCategories = this.categories.categories();
        const definitions = new Map(currentCategories.map(category => [category.value, category]));
        const sources = new Set(entries.map(entry => entry.source));
        for (const category of categories) {
            if (sources.has(category.value) && !definitions.has(category.value)) {
                definitions.set(category.value, category);
            }
        }

        if (this.checkDuplicateNames(entries)) {
            throw new Error('The copied entries have duplicate names.');
        }

        const uniqueName = (target: string, occupied: Set<string>, reserved: ReadonlySet<string>): string => {
            let name = target;
            if (occupied.has(normalize(name))) {
                const base = target.trim();
                let suffix = 1;
                do {
                    name = `${base}(${suffix++})`;
                } while (occupied.has(normalize(name)) || reserved.has(normalize(name)));
            }
            occupied.add(normalize(name));
            return name;
        };

        const remainingNames = new Map(remaining.map(entry => [normalize(entry.target), entry.target]));
        const occupied = new Set([...remainingNames.keys(), ...this.nonAllowedNames.map(normalize), ...[...definitions.keys()].map(normalize)]);
        const originalNames = new Set(entries.map(entry => normalize(entry.target)));
        const pastedNames = new Map(entries.map(({target}) => [normalize(target), uniqueName(target, occupied, originalNames)]));

        const sharedIds = new Set(this.globalEnvelopes().map(envelope => envelope.id));
        const localEnvelopes = destination?.envelopes ?? [];
        const transferableBudgetIds = new Set(envelopes
            .filter(envelope => envelope.isGlobal
                ? sharedIds.has(envelope.id)
                : sourceMonth === month && localEnvelopes.some(local => local.id === envelope.id))
            .map(envelope => envelope.id));
        const pasted = entries.map(({ source, type, target, value, isFixCost, envelopeId }) => {
            let parent: string | undefined;
            if (type === EntryType.Expense && source) {
                parent = definitions.has(source) ? source : pastedNames.get(normalize(source));
                parent ??= remainingNames.get(normalize(source));
            }
            return {
                id: uuid(), type, target: pastedNames.get(normalize(target))!, value, isFixCost, source: parent,
                envelopeId: envelopeId && transferableBudgetIds.has(envelopeId) ? envelopeId : null
            };
        });
        const links = [...remaining, ...pasted];

        const parents = new Map(links.filter(entry => entry.type === EntryType.Expense)
            .map(entry => [normalize(entry.target), entry.source && !definitions.has(entry.source) ? normalize(entry.source) : undefined]));
        const checked = new Set<string>();
        for (const target of parents.keys()) {
            const path = new Set<string>();
            for (let node: string | undefined = target; node && !checked.has(node); node = parents.get(node)) {
                if (path.has(node)) throw new Error('The copied entries would create a cycle in expenses.');
                path.add(node);
            }
            for (const node of path) checked.add(node);
        }

        const lastUpdated = new Date().toISOString();
        const addedCategories = definitions.size > currentCategories.length;
        const saved = (await this.database.command(() => this.database.api.months.save({
            month, entries: links, envelopes: localEnvelopes, lastUpdated,
            expectedRevision: destination?.revision ?? null, categories: addedCategories ? [...definitions.values()] : undefined,
        }))).value;
        this.sources.set(month, saved);

        if (addedCategories) await this.categories.reload();
        await this.logService.reload();
        this.publishMonthTransfer(month, this.project(saved));

        return async () => {
            if (!await this.flushEdits()) return false;
            const undo = this.inputSaveQueue.then(async () => {
                if (this.sources.get(month)?.revision !== saved.revision) return false;
                const entries = destination?.entries ?? [];
                const envelopes = destination?.envelopes ?? [];
                const lastUpdated = destination?.lastUpdated ?? '-';
                const restored = (await this.database.command(() => this.database.api.months.save({
                    month, entries, envelopes, lastUpdated, expectedRevision: saved.revision,
                }))).value;
                this.sources.set(month, restored);
                const data = this.calculateMonth(entries, month, lastUpdated,
                    id => !!this.categories.get(id), envelopes);
                await this.logService.reload();
                this.publishMonthTransfer(month, data);
                return true;
            });
            this.inputSaveQueue = undo.catch(() => {});
            return undo;
        };
    }

    private publishMonthTransfer(month: string, data: SingleMonthData): void {
        this.monthlyData = { ...this.monthlyData, [month]: data };
        this.multiMonthEntries$.next(this.monthlyData);
        if (this.processedSingleMonthEntries$.value.month === month) {
            this.isDemo.set(false);
            this.hasDataCycle.set(false);
            this.processedSingleMonthEntries$.next(data);
        }
        this.dataSaved$.next(true);
    }

    storeCopiedEnvelopes(envelopes: BudgetEnvelope[], sourceMonth: string) {
        this.sessionStore.write('copiedEnvelopes', envelopes);
        this.sessionStore.write('copiedSourceMonth', sourceMonth);
    }

    retrieveCopiedSourceMonth(): string | undefined {
        return this.sessionStore.read('copiedSourceMonth') ?? undefined;
    }
    retrieveCopiedEnvelopes(): BudgetEnvelope[] { return this.sessionStore.read('copiedEnvelopes') ?? []; }

    storeCopiedLinks(links: UserDefinedLink[]) {
        this.sessionStore.write('copiedLinks', links);
    }

    retrieveCopiedLinks(): UserDefinedLink[] | null {
        const data = this.sessionStore.read('copiedLinks');
        return data ? this.categories.clearMissingSources(data) : null;
    }


    retrieveFixCostsLinks(): UserDefinedLink[] {
        const fixedLinks = this.fixedCosts.list()
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
