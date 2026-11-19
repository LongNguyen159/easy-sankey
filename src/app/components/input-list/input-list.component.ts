import { AppStorage } from '../../storage/app-storage';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Clipboard } from '@angular/cdk/clipboard';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, Injector, Input, OnDestroy, OnInit, QueryList, TemplateRef, ViewChildren, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import { DataService } from '../../services/data.service';
import { MonthlyData, SingleMonthData } from '../models';
import { DateChanges, EntryType, ExpenseCategoryDetails, UserDefinedLink } from '../models';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {MatInputModule} from '@angular/material/input';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {MatIconModule} from '@angular/material/icon';
import { debounceTime, takeUntil } from 'rxjs';
import { CategoryService } from '../../services/category.service';
import { MatAutocompleteModule, MatAutocompleteTrigger} from '@angular/material/autocomplete';
import { CategorySelectComponent } from '../category-select/category-select.component';
import { BasePageComponent } from '../../base-components/base-page/base-page.component';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import { UiService } from '../../services/ui.service';
import { MonthPickerComponent } from "../month-picker/month-picker.component";
import { addImplicitPlusSigns, formatDateToYYYYMM, processStringAmountToNumber } from '../../utils/utils';
import { MatCardModule } from '@angular/material/card';
import { ErrorCardComponent } from "../error-card/error-card.component";
import { ColorService } from '../../services/color.service';
import { onMonthChanges } from '../../utils/data-utils';
import { Router } from '@angular/router';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { v4 as uuidv4 } from 'uuid';
import { LogsService } from '../../services/logs.service';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoutePath } from '../models';
import { exportMonth, MonthTransfer, readMonth } from '../../utils/data-transfer';

interface MonthClipboardWindow extends Window {
  electronAPI?: {
    readMonthClipboard?: () => Promise<string>;
    writeMonthClipboard?: (text: string) => Promise<void>;
  };
}

/** Prevent user to define a certain node name that coincides with our system generated node name. */
function restrictedNodeNamesValidator(restrictedNames: string[]): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const forbidden = restrictedNames.includes(control.value);
    return forbidden ? { restrictedNodeName: { value: control.value } } : null;
  };
}


/** Custom Validator to ensure the field is not empty or only spaces */
function nonEmptyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value?.trim();
    return value ? null : { emptyOrWhitespace: { value: control.value } };
  };
}

interface EntryGroup {
  id: string;
  label: string;
  rows: FormGroup[];
  category?: ExpenseCategoryDetails;
}

enum ErrorType {
  DuplicatedName = 'duplicatedName',
  EmptyType = 'emptyType',
  EmptyName = 'emptyName',
  InvalidValue = 'invalidValue',
  RowInvalid = 'rowInvalid'
}
@Component({
    selector: 'app-input-list',
    imports: [MatButtonModule, CdkDrag, CdkDragHandle, CdkDropList,
        ReactiveFormsModule,
        CommonModule,
        MatInputModule,
        MatFormFieldModule,
        MatSelectModule,
        MatIconModule,
        MatAutocompleteModule,
        CategorySelectComponent,
        MatSlideToggleModule, MonthPickerComponent,
        MatCardModule, ErrorCardComponent, MatDividerModule,
        MatMenuModule, MatDialogModule,
        FormsModule,
        MatTooltipModule
    ],
    templateUrl: './input-list.component.html',
    styleUrl: './input-list.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    animations: [
        trigger('expandCollapse', [
            state('expanded', style({
                height: '*', opacity: 1, transform: 'scale(1)'
            })),
            state('collapsed', style({
                height: '0px', opacity: 0, transform: 'scale(0.95)'
            })),
            transition('expanded <=> collapsed', [
                animate('300ms ease')
            ]),
        ]),
    ]
})

/** 
 * Notes for this component:
 * - This component is used to manage the input fields for the user-defined links.
 * 
 * Every time form changes: value changes, a row is removed, a row is pasted, we should call `updateSavedFormValuesOnFormChanges()` to notify that the current month
 * changes its value from initial state. This way, we can process the previous month before switching to a new month.
 * 
 * Switching months just repopulate the from with new data, and update the saved form values to the new form values. All within one lifecycle (Form is not destroyed or reinitialised).
 * 
 * 
 * - Use `_createLinkGroup()` to create a new form group for each link; Params 'links' in the function is optional for predefined links. If no links are provided, an empty form will be created.
 * 
 */

export class InputListComponent extends BasePageComponent implements OnInit, OnDestroy {
  protected readonly storage = inject(AppStorage);
  @Input() triggeredMonthByDialog: string = ''

  dataService = inject(DataService)
  uiService = inject(UiService)
  colorService = inject(ColorService)

  logService = inject(LogsService)

  router = inject(Router)

  @ViewChildren(MatAutocompleteTrigger) autocompleteTriggers!: QueryList<MatAutocompleteTrigger>;
  @ViewChildren('entryName') private entryNames!: QueryList<ElementRef<HTMLInputElement>>;

  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly newEntries = new Set<FormGroup>();
  protected readonly collapsedCategories = new Set<string>();
  protected groupByCategory = this.storage.read('entryView') === 'category';


  demoLinks: UserDefinedLink[] = this.dataService.demoLinks;

  linkForm: FormGroup; // FormGroup to manage input fields
  initialFormState: UserDefinedLink[] = []; // Initial form state to compare with new data

  linkTypes: EntryType[] = [EntryType.Income, EntryType.Expense, EntryType.Tax]; // Types of links
  entryTypes = EntryType; // Enum for entry types

  protected categoryService = inject(CategoryService);
  protected categoryControl(row: AbstractControl): FormControl<string> {
    return row.get('source') as FormControl<string>;
  }

  taxNodeExists = false; // Flag to check if a tax node exists

  updateFromService = false; // Flag to control value changes

  /** Expand or collapse the fix costs/variable cost section in template. */
  isFixCostsExpanded: boolean = false;
  isVariableCostsExpanded: boolean = true;

  dataMonth: string = '' // Month to process, in YYYY-MM format
  singleMonthData: SingleMonthData // Data for the current month
  allMonthsData: MonthlyData // Data for all months

  /** Save the current input values every time user changes the input.
   * Currently only assigned by valueChanges, and after user switches to new month, it assigns new value.
   */
  savedFormValues: UserDefinedLink[] = []

  /** Flag to track changes in the form. If true, means form has changes.
   * Use this flag to determine if we need to save the form values before switching to another month,
   * or process the form values before doing something.
   */
  hasChanges: boolean = false;
  
  /** Flag to check for duplicate names. True if detected duplicates */
  hasDuplicates: boolean = false;
  duplicatedNames: string[] = []
  errorMessage: string = 'Duplicated names are not allowed! Please check your input.'

  errorMessages: { type: string, message: string }[] = [];


  hasInValidRows: boolean = false;

  /** boolean flag to indicate if user is searching for something. Set to false when input is empty. True when user is typing on search bar. */
  isSearching: boolean = false;

  //#region Logs
  isLogShown: boolean = false;
  readonly isLogShownKey = 'isLogShown'
  activeRowId: string = ''
  //#endregion

  /** Fixed links array. This hold the fix costs stored in local storage */
  fixedLinks: UserDefinedLink[] = []

  /** Search value for filtering the input fields. */
  filterQuery: string = '';

  /** We use this array to store the filtered entries. It contains link's IDs (UUID).
   * If we filter directly linkArray.controls, it would not work because the form is tracked by index.
   * 
   * So when we filter out and repopulate the form, it'll be duplicated because index is not unique.
   * 
   * We will only show the entires within this array in the template, so make sure to populate this array correctly:
   * - When adding new links, push the new link's ID into this array.
   * - When removing links, remove the link's ID from this array.
   * 
   * - When filtering, we will filter this array.
   */
  filteredLinkIds: string[] = [];


  constructor(private fb: FormBuilder) {
    super();
    this.linkForm = this.fb.group({
      links: this.fb.array([])
    });
  }

  ngOnInit(): void {
    /** Retrieve fixed costs from local storage */
    this.fixedLinks = this.dataService.retrieveFixCostsLinks()

    if (this.dataService.isDemo()) {
      this.isFixCostsExpanded = true
    }

    this.dataService.getAllMonthsData().pipe(takeUntil(this.componentDestroyed$)).subscribe(allMonthsData => {
      this.allMonthsData = allMonthsData
    })

    /** On response from service, update forms to reflect correct amount if children expenses
     * exceed their parent.
     */
    this.dataService.getSingleMonthData().pipe(takeUntil(this.componentDestroyed$)).subscribe(data => {
      this.singleMonthData = data;
      this.fixedLinks = this.dataService.retrieveFixCostsLinks();
      this.dataMonth = data.month
      this.taxNodeExists = this._hasTaxNode(data.rawInput);

      /** Populate links with predefined data */
      this.populateInputFields(data)
    });

    
    /** Listen to changes in value. If changes, save the current form value immediately. */
    this.linkForm.valueChanges.pipe(takeUntil(this.componentDestroyed$), debounceTime(300)).subscribe((formData) => {
      this.updateSavedFormValuesOnFormChanges()
    })
  }

  /** This function is used to hold the current form values. If there are changes in the form,
   * either by adding more links or remove links (via copy-paste also), or form values changes
   * call this function.
   * 
   * Main purpose of holding the saved form values is to track whether there are changes in the form.
   * If yes, process the form values before switching to another month. If no, do nothing.
   * If we don't have this functionality of saving current form values, we can't track whether there are changes in the form,
   * so every onMonthChanges, we will process the form values, which is inefficient.
   */
  protected updateSavedFormValuesOnFormChanges() {
    this.savedFormValues = this.linkArray.value.slice();
    this.hasChanges = true;
  }



  //#region Form Initialisation
  /** Function to create form input.
   * @param link Optional parameter to populate the form with existing data
   * if no `link` param is provided, an empty form with default values '' will be created.
   */
  protected _createLinkGroup(link?: UserDefinedLink): FormGroup {
    const linkGroup = this.fb.group({
      id: [link && link.id ? link.id : uuidv4(), Validators.required], // Generate a unique UUID if link.id is missing.
      type: [link ? link.type : '', Validators.required],
      target: [link ? link.target : '', [
        Validators.required,

        /** Non empty node names */
        nonEmptyValidator(),

        /** Not allowed node names: */
        restrictedNodeNamesValidator(this.dataService.nonAllowedNames)
      ]],
      value: [link ? link.value : 0, [Validators.required, Validators.min(0)]],
      source: [link?.source === '-- None --' ? '' : link?.source ?? ''],
      isFixCost: [link ? link.isFixCost : false],
      lastEditedAt: [link ? link.lastEditedAt ?? null : Date.now()]
    });

    /** Add into IDs array when a new link is created. */
    this.filteredLinkIds.push(linkGroup.get('id')?.value || '');

    // Disable the source field if type is 'income'
    if (linkGroup.get('type')?.value == EntryType.Income || linkGroup.get('type')?.value == EntryType.Tax) {
      linkGroup.get('source')?.disable({ emitEvent: false });
    }

    let typeValue = linkGroup.get('type')?.value;


    /** Subscribe to Name changes */
    linkGroup.get('target')?.valueChanges.pipe(takeUntil(this.componentDestroyed$), debounceTime(200)).subscribe(value => {
      if (value) {
        /** Handle error on every target value changes (user types something in target field).
         * Check for Cycle: If source = target.
         * Check for Non-allowed names: If target is a non-allowed name (defined in dataService).
         * Check for Duplicates: If there are duplicate names in the form.
         */
        this.checkForCycle(value, linkGroup.get('source')?.value, linkGroup, this.linkArray.value);
        this.checkForNonAllowedNames(value, linkGroup)
        if (typeValue == '' || !typeValue || typeValue == null) {
          this.addErrorMessage(ErrorType.EmptyType, 'Type is empty. Please select a type.')
        } else {
          this.removeErrorMessage(ErrorType.EmptyType)
        }

        this.hasDuplicates = this._checkDuplicateName()
      }
    })


    /** Subscribe to Type changes.
     * If type = income or tax, disable source (category) field.
     */
    linkGroup.get('type')?.valueChanges.pipe(takeUntil(this.componentDestroyed$)).subscribe(value => {
      if (value == EntryType.Income || value == EntryType.Tax) {
        linkGroup.get('source')?.disable({ emitEvent: false }); // Disable source if type = income or tax
        linkGroup.get('source')?.setValue('', { emitEvent: false }); // Clear source field
      } else {
        linkGroup.get('source')?.enable({ emitEvent: false });  // Enable source otherwise
      }
      typeValue = value;
      if (typeValue && typeValue !== '') {
        this.removeErrorMessage(ErrorType.EmptyType)
      }
    });


    /** Subscribe to changes in source (category) field. If category is chosen, set type = expense automatically. */
    linkGroup.get('source')?.valueChanges.pipe(takeUntil(this.componentDestroyed$)).subscribe(value => {
      if (value) {
        /** Set type automatic to expense if category chosen */
        linkGroup.get('type')?.setValue(EntryType.Expense, { emitEvent: false });
        this.checkForCycle(value, linkGroup.get('target')?.value, linkGroup, this.linkArray.value);
      }
    });
    // Track content edits only. Moving rows or rebuilding the form preserves edit times.
    const content = () => {
      const { type, target, value, source, isFixCost } = linkGroup.getRawValue();
      return JSON.stringify({ type, target, value, source, isFixCost });
    };
    let previousContent = content();
    linkGroup.valueChanges.pipe(takeUntil(this.componentDestroyed$)).subscribe(() => {
      const currentContent = content();
      if (currentContent !== previousContent) {
        previousContent = currentContent;
        linkGroup.get('lastEditedAt')?.setValue(Date.now(), { emitEvent: false });
      }
    });
    return linkGroup;
  }

  checkForNonAllowedNames(name: string, linkGroup: FormGroup) {
    const isNotAllowedName = this.dataService.nonAllowedNames.includes(name.trim())
    if (isNotAllowedName) {
      linkGroup.get('target')?.setErrors({ restrictedNodeName: true }, { emitEvent: false });
      this.uiService.showSnackBar(`'${name}' is a reserved name and cannot be used!`, 'Dismiss');
    }
  }


  /** Initialise/Populate the form with predefined data */
  populateInputFields(selectedMonthData: SingleMonthData): void {
    /** clear the form and repopulate it with new data. */
    this.newEntries.clear();
    this.linkArray.clear({ emitEvent: false });
    
    const links = this.dataService.isDemo() ? this.demoLinks : selectedMonthData.rawInput;
    
    // Populate form without emitting valueChanges
    links.forEach(link => this.linkArray.push(this._createLinkGroup(link), { emitEvent: false }));

    // Check for cycles in the initial form state
    this.linkArray.controls.forEach((control) => {
      this.checkForCycle(control.get('source')?.value, control.get('target')?.value, control as FormGroup);
    })

    /** Apply the filter upon form reinitialised/repopulated with new data. */
    this.filterLinks(this.filterQuery)

    this.hasDuplicates = this._checkDuplicateName()

    // Shallow copy to avoid mutations
    this.initialFormState = [...links];
  }


  /** Helper function to determine tax node in links */
  protected _hasTaxNode(data: UserDefinedLink[]): boolean {
    return data.some(item => item.type == EntryType.Tax)
  }

  //#endregion


  //#region Month Changes
  onMonthChanges(selectedMonth: DateChanges) {
    const currentMonth = formatDateToYYYYMM(selectedMonth.currentMonth)
    const prevMonth = formatDateToYYYYMM(selectedMonth.previousMonth)
    const previousFormValid = this.linkForm.valid;

    /** This will trigger subscription onInit of this component. No need to update global variables here as we already did it in the subscription. */
    onMonthChanges(selectedMonth.currentMonth, this.allMonthsData, this.singleMonthData, this.dataService)

    /** Only process previous months if there are changes in the form detected by the boolean flag `hasChanges`.
     * Else it would process every previous months on month changes.
     */
    if (currentMonth !== prevMonth && this.hasChanges) {
      if (previousFormValid) {
        this.processMonthBeforeMonthChanges(prevMonth, this.savedFormValues);
      }
      
      // Reset has changes flag after processing the month.
      this.hasChanges = false;
    }

    /** Assign the saved form values to the current form values (instead of previous month)
     * We do this to make the savedFormValues up-to-date to track whether it changes.
     */
    this.savedFormValues = this.linkForm.value.links.slice();
  }

  /** This function is used to process the previous month (in compare to current month).
   * Triggered when user changes the month.
   * USE CASE: When user made some changes, and navigate to another month, we want to save changes and process it.
   * @param previousMonthValue The previous month value
   * @param previousFormValues The previous form values
   */
  processMonthBeforeMonthChanges(previousMonthValue: string | undefined, previousFormValues: UserDefinedLink[]) {
    /** On first change the previousMonthValue can be undefined, in that case, do nothing. */
    if (!previousMonthValue || previousFormValues.length == 0) return;


    /** If process Input data, remember NOT to emit, because we only want to save it, if we emit,
     * the current month will be overridden from the data of previous month.
     */
    this.dataService.processInputData(previousFormValues, previousMonthValue, { showSnackbarWhenDone: true, emitObservable: false})
  }
  //#endregion


  //#region Reactive update input
  /** Update Input, this function when triggered will send the input data to service to update the form state.
   * Only trigger this function to reactively update the form.
   * For example like summing the total children value to reflect on the parent node.
   * Else, we just submit the form on component destroy.
   * 
   * 
   * INLINE CALCULATOR feature is implemented here. This function will be triggered when user blur input field.
   */
  updateInput(linkGroup?: AbstractControl) {
    
    
    // Used to early exit the function. If function is valid, use 'updatedFormData' below to access the form data.
    const formDataOld: UserDefinedLink[] = this.linkForm.value.links;


    /** Do not allow negative values on form */
    const negatives = formDataOld.filter(link => link.value < 0);
    if (negatives.length > 0) { 
      this.uiService.showSnackBar('Negative values are not allowed!', 'Dismiss')
      return;
    }
  
    // Early exit if there are no changes compared to the initial form state
    if (JSON.stringify(formDataOld) === JSON.stringify(this.initialFormState)) {
      return; // No changes, don't proceed
    }


    /** Update the value on blur, get the sum string and calculate it.
     * After calculating, update the input value with the sum.
     * 
     * 
     * CASE: linkGroup is not defined, because it's from other input fields (not value field),
     * the sum will be default to 0. But that is not a problem, because then the value will 
     * be repopulated by the service anyway.
     */
    const sum: number | null = processStringAmountToNumber(linkGroup?.value.value || '0')

    if (sum == null) {
      this.uiService.showSnackBar('Invalid value!', 'Dismiss')
      linkGroup?.get('value')?.setErrors({ invalidValue: true }, { emitEvent: false });
      this.addErrorMessage(ErrorType.InvalidValue, 'One or more values are not valid numbers.');
      return;
    }

    
    const id: string = linkGroup?.get('id')?.value;
    const value = addImplicitPlusSigns(linkGroup?.get('value')?.value || '0')
    /** Save value changes into logs to keep track of value's history changes. */
    this.logService.setLog(this.dataMonth, id, value)


    linkGroup?.setValue({ ...linkGroup.value, value: sum, source: linkGroup.value.source ?? '' });

    /** Update form data after setting summed value. */
    const updatedFormData = formDataOld.map(item => 
      item.target === linkGroup?.value.target ? { ...linkGroup.value } : item
    );


    const valueFields = updatedFormData.map(item => item.value);
    /** check if values are valid. If they are not number, they are not valid.
     * Although they are originally type strings input, after summing up values, 
     * they should be parsed into numbers. If not, means they contain invalid characters.
     */
    if (valueFields.some(value => typeof value !== 'number' || isNaN(value))) {
      console.error('Error: One or more values are not valid numbers');
      this.linkForm.setErrors({ invalidValues: true });
      return;
      // Optionally, show an error to the user or handle it appropriately here
    }

    this.taxNodeExists = this._hasTaxNode(updatedFormData);
    
    if (!this.linkForm.valid || this.updateFromService) return; // Exit function here, don't process input if not valid.

    this.dataService.processInputData(updatedFormData, this.dataMonth);
  
    // After processing, update the initial form state to the new one
    this.initialFormState = [...updatedFormData]; // Update the stored form state
  }

  //#region Inline Calculator
  /** Restrict user 'amount' input. 
   * Only allow +, -, digits, and decimal points and whitespaces.
   * Do not allow alphabet and special characters.
   */
  validateKeyPress(event: KeyboardEvent): void {
    const allowedChars = /[0-9+\-.\s]/; // Allows digits, plus, minus, decimal points, and whitespace
    const key = event.key;
  
    if (!allowedChars.test(key)) {
      event.preventDefault(); // Block invalid characters
    }
  }

  validatePaste(event: ClipboardEvent): void {
    const clipboardData = event.clipboardData;
    const pastedText = clipboardData?.getData('text') || '';
  
    // Remove all characters except digits, +, -, ., and whitespace
    const sanitizedText = pastedText.replace(/[^0-9+\-.\s]/g, '');
  
    if (sanitizedText !== pastedText) {
      event.preventDefault();
      const inputField = event.target as HTMLInputElement;
      inputField.value = sanitizedText;
    }
  }
  //#endregion

  checkTaxNodeExists() {
    this.taxNodeExists = this._hasTaxNode(this.linkForm.value.links);
  }
  //#endregion


  //#region Copy & Paste Links
  async copyLinks(): Promise<void> {
    const currentLinks: UserDefinedLink[] = this.linkForm.value.links;
    if (!currentLinks.length) {
      this.uiService.showSnackBar('Nothing to copy.');
      return;
    }
    if (this.linkForm.invalid || this.dataService.checkDuplicateNames(currentLinks)) {
      this.uiService.showSnackBar('Fix the invalid entries before copying this month.');
      return;
    }
    const month = this.dataMonth;
    const text = exportMonth(currentLinks, this.categoryService.categories());
    let savedInTab = false;
    try {
      this.dataService.storeCopiedLinks(currentLinks);
      savedInTab = true;
    } catch {
      // The system clipboard is still available if session storage is full.
    }

    const desktop = (window as MonthClipboardWindow).electronAPI;
    try {
      if (desktop?.writeMonthClipboard) await desktop.writeMonthClipboard(text);
      else await navigator.clipboard.writeText(text);
    } catch {
      if (!this.clipboard.copy(text)) {
        this.uiService.showSnackBar(savedInTab ? 'Month copied for this tab only.' : 'Could not copy this month.');
        return;
      }
    }
    this.uiService.showSnackBar(`${month} copied to the clipboard.`);
  }

  async pasteLinks(dialogTemplate: TemplateRef<unknown>): Promise<void> {
    const month = this.dataMonth;
    const desktop = (window as MonthClipboardWindow).electronAPI;
    let transfer: MonthTransfer;
    try {
      const text = desktop?.readMonthClipboard ? await desktop.readMonthClipboard() : await navigator.clipboard.readText();
      transfer = readMonth(text);
    } catch {
      if (!this.destroyRef.destroyed && month === this.dataMonth) {
        this.dialog.open(dialogTemplate, { data: month, autoFocus: 'textarea' });
      }
      return;
    }
    this.applyMonthTransfer(transfer, month);
  }

  protected pasteMonthText(text: string, month: string): boolean {
    let transfer: MonthTransfer;
    try {
      transfer = readMonth(text);
    } catch {
      this.uiService.showSnackBar('Copy a month from Easy Sankey first.');
      return false;
    }
    return this.applyMonthTransfer(transfer, month);
  }

  protected get lastMonthCopiedInTab(): UserDefinedLink[] | null {
    return this.dataService.retrieveCopiedLinks();
  }

  protected pasteMonthFromTab(month: string): boolean {
    const entries = this.lastMonthCopiedInTab;
    return !!entries?.length && this.applyMonthTransfer({ entries, categories: [] }, month);
  }

  private applyMonthTransfer(transfer: MonthTransfer, month: string): boolean {
    if (this.destroyRef.destroyed || month !== this.dataMonth || !month) return false;
    try {
      this.dataService.importMonth(month, transfer);
      this.savedFormValues = this.linkArray.value.slice();
      this.hasChanges = false;
      this.uiService.showSnackBar(`Entries pasted into ${month}.`);
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message.startsWith('The copied month')
        ? error.message : 'Could not save the copied month.';
      this.uiService.showSnackBar(message);
      return false;
    }
  }

  pasteFixCosts() {
    if (this.fixedLinks.length == 0) {
      this.uiService.showSnackBar('No fix costs found', 'Dismiss');
      return;
    }
  
    const existingFixCosts: UserDefinedLink[] = this.linkArray.value.filter((link: UserDefinedLink) => link.isFixCost);
  
    /** If there are no changes in the fix costs section and user paste it, do nothing. */
    if (JSON.stringify(this.fixedLinks) == JSON.stringify(existingFixCosts)) {
      this.uiService.showSnackBar('No changes', 'Dismiss');
      return;
    }
  
    this.isFixCostsExpanded = true;
  
    /** If different, clear out the current fixed costs link and paste the link in local storage in.
     * This will avoid duplicate fixed costs in the form.
     */
    if (JSON.stringify(this.fixedLinks) !== JSON.stringify(existingFixCosts)) {
      // Filter out the current fixed costs from `linkArray`
      const updatedLinks = this.linkArray.value.filter((link: UserDefinedLink) => !link.isFixCost);
  
      // Add fixedLinks from localStorage to the filtered linkArray with new UUIDs
      const newFixedLinks = this.fixedLinks.map(link => ({
        ...link,
        id: uuidv4()
      }));
  
      const newLinkArray = [...updatedLinks, ...newFixedLinks];
      this.hasDuplicates = this._checkDuplicateName();
      // Update the form with the new link array
      this.populateInputFields({ rawInput: newLinkArray } as SingleMonthData);
      /** Update saved form values. */
      this.updateSavedFormValuesOnFormChanges();
  
      this.dataService.processInputData(this.linkForm.value.links, this.dataMonth);
      this.hasChanges = true;
      this.uiService.showSnackBar('Fix costs updated!', 'Ok');
    }
  }
  //#endregion




  /********** Error Handling **********/

  private addErrorMessage(type: string, message: string) {
    if (!this.errorMessages.some(error => error.message === message)) {
      this.errorMessages.push({ type, message });
    }
  }

  private removeErrorMessage(type: string) {
    this.errorMessages = this.errorMessages.filter(error => error.type !== type);
  }


  //#region Cycle Detection
  private buildAdjacencyList(links: UserDefinedLink[]): Map<string, string[]> {
    const adjacencyList = new Map<string, string[]>();
  
    links.forEach(link => {
      if (link.source && link.target) {
        if (!adjacencyList.has(link.source)) {
          adjacencyList.set(link.source, []);
        }
        adjacencyList.get(link.source)?.push(link.target);
      }
    });
  
    return adjacencyList;
  }
  
  // Step 2: Find all descendants of a node using DFS
  private findDescendants(node: string, links: UserDefinedLink[]): Set<string> {
    const descendants = new Set<string>();
    const stack = [node];  // Use a stack for DFS

    const adjacencyList = this.buildAdjacencyList(links);
  
    while (stack.length > 0) {
      const currentNode = stack.pop();
      const children = adjacencyList.get(currentNode || '') || [];
  
      children.forEach(child => {
        if (!descendants.has(child)) {
          descendants.add(child);
          stack.push(child);  // Keep searching for deeper descendants
        }
      });
    }
  
    return descendants;
  }
  
  /**
   * Checks for cycles in the links based on source and target.
   * A cycle occurs when:
   *   - source equals target, or
   *   - source is found among the descendants of target.
   * 
   * @param source Source node
   * @param target Target node (optional)
   * @param linkGroup FormGroup with source and target fields (optional)
   * @param links Array of links to search for descendants (optional)
  */
  private checkForCycle(source: string, target: string | null | undefined, linkGroup?: FormGroup, links?: UserDefinedLink[]): void {
    this.dataService.hasDataCycle.set(false); // Reset cycle flag
      
    // Exit if either source or target is missing
    if (!source || !target) return;

    // Check for direct cycle (source == target)
    if (source.toLowerCase() === target.toLowerCase()) {
      this.setCycleError(true, linkGroup);
      console.log('Cycle detected: source equals target');
      return;
    }

    // Exit if no links provided for descendant check
    if (!links) return;

    // Check if source is a descendant of target
    // const descendants = this.findDescendants(target, links);

    // console.log('Descendants:', descendants);
    // const hasCycle = descendants.has(source);
    // if (hasCycle) {
    //   this.setCycleError(hasCycle, linkGroup);
    // } else {
    //   this.setCycleError(null, linkGroup)
    // }
    // console.log(hasCycle ? 'Cycle detected: source is a descendant' : 'No cycle detected');
  } 

  /**
   * Sets the cycle error state on source and target fields.
   * @param linkGroup FormGroup containing source and target fields
   * @param hasCycle Boolean indicating if a cycle was detected
   */
  private setCycleError(hasCycle: boolean | null, linkGroup?: FormGroup): void {
    this.dataService.hasDataCycle.set(hasCycle || false);
    
    if (linkGroup) {
      const cycleError = hasCycle ? { cycle: true } : null;
      linkGroup.get('source')?.setErrors(cycleError, { emitEvent: false });
      linkGroup.get('target')?.setErrors(cycleError, { emitEvent: false });
    }
  }

  //#endregion


  //#region Check Duplicates
  private _checkDuplicateName(formGroup?: FormGroup): boolean {    
    // Get all form values and normalize for comparison
    const formValues: string[] = this.linkArray.value.map((link: UserDefinedLink) => link.target.toLowerCase().trim());
    
    // Track duplicates
    const seen = new Set<string>();
    const duplicateNames = formValues.filter((item) => {
      const normalizedItem = item.toLowerCase().trim();
      if (seen.has(normalizedItem)) {
        return true;
      }
      seen.add(normalizedItem);
      return false;
    });

    const emptyNames = formValues.filter(name => name.trim() === '');

    this.duplicatedNames = [...duplicateNames];

    // Handle empty names
    if (emptyNames.length > 0) {
      this.hasDuplicates = true;
      this.addErrorMessage(ErrorType.EmptyName, 'Empty names are not allowed.');
      return true;
    }

    /** FormGroup is used to set error on form. */
    if (duplicateNames.length > 0) {
      this.removeErrorMessage(ErrorType.DuplicatedName);
      this.uiService.showSnackBar('Duplicate names are not allowed!', 'Dismiss', 5000);
      this.hasDuplicates = true;
      this.addErrorMessage(ErrorType.DuplicatedName, `Duplicated names: "${this.duplicatedNames.map(name => name).join('", "')}".`);
      return true
    } else {
      this.hasDuplicates = false;
      this.removeErrorMessage(ErrorType.DuplicatedName);
      return false
    }
  }
  //#endregion

  // checkForInvalidRows(): boolean {
  //   console.log('checking for invalid rows...')
  //   let hasInvalidRows = false;
  //   this.hasInValidRows = false;
  //   this.linkArray.controls.forEach((control, index) => {
  //     if (!control.valid) {
  //       this.uiService.showSnackBar(`Invalid input at row ${index + 1}`, 'Dismiss', 5000);
  //       hasInvalidRows = true;
  //       this.hasInValidRows = true;
  //       console.log('Invalid input at row ', index + 1);
  //     }
  //   });
  //   return hasInvalidRows;
  // }

  //#region Link Controls

  /********** Filter/Add/Remove Links **********/

  protected toggleEntryView(): void {
    this.groupByCategory = !this.groupByCategory;
    this.storage.write('entryView', this.groupByCategory ? 'category' : 'costType');
  }

  protected sortEntriesByRecentlyEdited(): void {
    const editTime = (row: FormGroup): number => {
      const timestamp = row.get('lastEditedAt')?.value;
      return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0;
    };
    // Stable sort keeps ties and undated entries in their existing manual order.
    const controls = [...this.linkArray.controls].sort((a, b) => editTime(b) - editTime(a));
    this.linkArray.clear({ emitEvent: false });
    this.linkArray.push(controls, { emitEvent: false });
    this.updateSavedFormValuesOnFormChanges();
    this.saveEntryOrder();
    this.uiService.showSnackBar('Entries sorted by most recently edited.');
    void this.announcer.announce('Entries sorted by most recently edited. You can continue reordering them.');
  }

  protected toggleCategory(id: string): void {
    if (!this.collapsedCategories.delete(id)) this.collapsedCategories.add(id);
  }

  private saveEntryOrder(): void {
    if (!this.linkForm.valid) return;
    // Persist without rebuilding the editor, preserving focus and draft row state.
    this.dataService.processInputData(this.savedFormValues, this.dataMonth, { emitObservable: false });
  }

  protected visibleEntries(isFixCost?: boolean): FormGroup[] {
    return this.linkArray.controls.filter(row =>
      this.filteredLinkIds.includes(row.get('id')?.value)
      && (isFixCost === undefined || Boolean(row.get('isFixCost')?.value) === isFixCost)
    );
  }

  protected get draftEntries(): FormGroup[] {
    return this.visibleEntries().filter(row => this.newEntries.has(row));
  }

  protected get categoryGroups(): EntryGroup[] {
    const rowsByCategory = new Map<string, FormGroup[]>();
    for (const row of this.visibleEntries()) {
      if (this.newEntries.has(row)) continue;
      const source = row.get('type')?.value === EntryType.Expense ? row.get('source')?.value : '';
      const id = this.categoryService.get(source)?.value ?? '';
      const rows = rowsByCategory.get(id) ?? [];
      rows.push(row);
      rowsByCategory.set(id, rows);
    }

    const groups: EntryGroup[] = [];
    for (const category of this.categoryService.categories()) {
      const rows = rowsByCategory.get(category.value);
      if (rows) groups.push({ id: category.value, label: category.label, category, rows });
    }
    const uncategorized = rowsByCategory.get('');
    if (uncategorized) groups.push({ id: '', label: 'Uncategorized', rows: uncategorized });
    return groups;
  }

  addLink(): void {
    this.linkForm.markAsUntouched();
    const row = this._createLinkGroup();
    this.newEntries.add(row);
    this.linkArray.push(row, { emitEvent: false });
    this.filterLinks('');
    if (this.groupByCategory) this.collapsedCategories.delete('');
    this.isVariableCostsExpanded = true;
    this.updateSavedFormValuesOnFormChanges();

    const id = row.get('id')?.value;
    afterNextRender(() => {
      this.entryNames.find(field => field.nativeElement.dataset['entryId'] === id)?.nativeElement.focus();
    }, { injector: this.injector });
  }

  protected dropEntries(event: CdkDragDrop<FormGroup[]>): void {
    if (event.isPointerOverContainer) {
      this.reorderEntries(event.container.data, event.previousIndex, event.currentIndex);
    }
  }

  protected moveEntryWithKeyboard(event: Event, rows: FormGroup[], from: number, to: number): void {
    event.preventDefault();
    const handle = event.currentTarget as HTMLButtonElement;
    if (this.reorderEntries(rows, from, to)) {
      afterNextRender(() => handle.focus(), { injector: this.injector });
    }
  }

  private reorderEntries(rows: FormGroup[], from: number, to: number): boolean {
    if (from === to || from < 0 || from >= rows.length || to < 0 || to >= rows.length) return false;
    const controls = [...this.linkArray.controls];
    const slots = rows.map(row => controls.indexOf(row));
    if (slots.includes(-1)) return false;

    // Keep the positions of rows outside this section or filtered out by search.
    const reordered = [...rows];
    moveItemInArray(reordered, from, to);
    slots.forEach((slot, index) => controls[slot] = reordered[index]);
    this.linkArray.clear({ emitEvent: false });
    this.linkArray.push(controls, { emitEvent: false });
    this.updateSavedFormValuesOnFormChanges();
    const name = reordered[to].get('target')?.value || 'New entry';
    this.saveEntryOrder();
    void this.announcer.announce(`${name} moved to position ${to + 1} of ${rows.length}.`);
    return true;
  }

  protected removeEntry(row: FormGroup): void {
    this.removeLink(this.linkArray.controls.indexOf(row));
  }

  // Remove an input row
  removeLink(index: number): void {
    if (index < 0) return;
    const row = this.linkArray.at(index);
    const link: UserDefinedLink = row.value;
    this.newEntries.delete(row);
    this.filteredLinkIds = this.filteredLinkIds.filter(id => id !== link.id);
    this.linkArray.removeAt(index, { emitEvent: false });
    this.updateSavedFormValuesOnFormChanges()
    this.hasDuplicates = this._checkDuplicateName();
    if (this.linkForm.valid) this.dataService.processInputData(this.linkForm.value.links, this.dataMonth);
  }
  
  //#endregion


  //#region Getters
  // Getter to easily access the FormArray
  get linkArray(): FormArray<FormGroup> {
    return this.linkForm.get('links') as FormArray<FormGroup>;
  }

  get fixCosts(): UserDefinedLink[] {
    return this.linkArray.value.filter((link: UserDefinedLink) => link.isFixCost);
  }
  
  /** For the search function */
  filterLinks(query: string): void {
    
    if (!query || query.trim() === '') {
      this.filterQuery = ''; // Reset filter query.
      this.isSearching = false;
      this.filteredLinkIds = this.linkArray.controls.map(item => item.get('id')?.value || ''); // Reset filtered links to be all entries.
      return
    }
    
    
    this.isSearching = true;
    this.filterQuery = query; // Update filter query
    this.filteredLinkIds = this.linkArray.controls.filter(control => {
      const target = control.get('target')?.value?.toLowerCase() || '';
      const searchTerm = query.toLowerCase();
      return target.includes(searchTerm);
    }).map(item => item.get('id')?.value || ''); // Update filtered links to be matching entries IDs.
  }
  //#endregion

  // Submit form and emit the data (to parent component or a service)
  onSubmit(): void {
    if (!this.linkForm.valid) return;

    const formData: UserDefinedLink[] = this.linkForm.value.links;
    this.dataService.processInputData(formData, this.dataMonth)
  }

  closeAutoComplete(index: number): void {
    const trigger = this.autocompleteTriggers.toArray()[index];
    setTimeout(() => {
      trigger.closePanel();
    }, 0);
  }


  navigateToFixCosts() {
    this.dataService.setNavigateFixCostState(true)
    this.router.navigate([RoutePath.FinanceManagerPage], {
      queryParams: { tab: 2 }
    });
    this.dataService.setNavigateFixCostState(false)
  }

  toggleRowLog(rowId: string): void {
    if (this.activeRowId === rowId) {
      // Toggle log visibility if the same row is clicked
      this.isLogShown = !this.isLogShown;
      if (!this.isLogShown) {
        this.activeRowId = ''; // Reset active row when hiding logs
      }
    } else {
      // Show logs for the new row
      this.activeRowId = rowId;
      this.isLogShown = true;
    }
  }

  
  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.onSubmit()
  }
}
