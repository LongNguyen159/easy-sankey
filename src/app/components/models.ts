import categoryDefinitions from '../../../electron/default-categories.json';
//#region Raw Input
export interface UserDefinedLink {
    id: string;       // Unique identifier
    type: EntryType;  // Type of the entry
    target: string;   // The name of the current node
    value: number;    // Amount associated with the link
    source?: string;  // Category ID or parent node (only for expenses)
    isFixCost?: boolean;  // Optional flag to indicate fix cost
    demo?: boolean;   // Optional flag to indicate demo data
    lastEditedAt?: number | null; // Entry edit time in milliseconds; independent of manual order
}

export enum EntryType {
  Income = 'income',
  Expense = 'expense',
  Tax = 'tax'
}

//#endregion


//#region Processed Data
/** Interface for multi month data. */
export interface MonthlyData {
  [month: string]: SingleMonthData;
}
/** Interface for single month data. */
export interface SingleMonthData {
  lastUpdated: Date | string
  sankeyData: SankeyData;
  totalUsableIncome: number;
  totalGrossIncome: number;
  totalTax: number;
  totalExpenses: number;
  remainingBalance: string;
  pieData: PieData[];
  rawInput: UserDefinedLink[];
  month: string
  treeMapData: TreeNode[];
}


//#endregion



//#region Route Paths
export enum RoutePath {
  Docs = '/docs',
  MainPage = '/',
  WelcomePage = '/welcome',
  WhatsNewPage = '/updates',
  FinanceManagerPage = '/storage',
  HighlightedFeaturesPage = '/highlights',
  SmartBudgeterPage = '/smart-budgeter',
}

//#endregion


//#region Category
export const SYSTEM_PREFIX = '__system/category__'

export enum ExpenseCategory {
  Housing = `Housing@${SYSTEM_PREFIX}`,
  Groceries = `Groceries & Essentials@${SYSTEM_PREFIX}`,
  Restaurants = `Restaurants@${SYSTEM_PREFIX}`,
  Shopping = `Shopping@${SYSTEM_PREFIX}`,
  Education = `Education@${SYSTEM_PREFIX}`,
  Savings = `Savings & Investments@${SYSTEM_PREFIX}`,
  Health = `Health & Fitness@${SYSTEM_PREFIX}`,
  Entertainment = `Entertainment@${SYSTEM_PREFIX}`,
  Hobby = `Hobbies@${SYSTEM_PREFIX}`,
  Commute = `Transportation@${SYSTEM_PREFIX}`,
  Utils = `Utilities@${SYSTEM_PREFIX}`,
  Other = `Other@${SYSTEM_PREFIX}`,
  Travelling = `Travelling@${SYSTEM_PREFIX}`,
  Occasions = `Special Occasions@${SYSTEM_PREFIX}`,
}

export interface ExpenseCategoryDetails {
  label: string;
  value: string;
  icon?: string;
  colorLight?: string;  // New property for light mode color
  colorDark?: string;   // New property for dark mode color
}

/** Default definitions. Their values also identify categories in existing saved entries. */
export const expenseCategoryDetails = Object.fromEntries(
  categoryDefinitions.map(category=>[category.value,category])
) as Record<ExpenseCategory,ExpenseCategoryDetails>;

export interface Budget {
  category: string;
  value: number;
}

//#endregion

export interface DateChanges {
  previousMonth: Date;
  currentMonth: Date;
}


//#region Chart Data

export interface SankeyNode {
    name: string;
    value: number;
  }
  
  export interface SankeyLink {
    source: string;   // Source node
    target: string;   // Target node
    value: number;    // Value of the link
  }
  
export interface SankeyData {
    nodes: SankeyNode[];
    links: SankeyLink[];
}

export interface PieData {
  name: string
  value: number
}

export interface DifferenceItem {
  name: string;
  difference: string | number; // "New" | "No spending this month" | Percentage Difference
  lastValue?: number;
  currentValue?: number;
  isNew?: boolean; // true for new items

  /** True if the change is positive/good. For example: If expense gone down (-x%), this is true.
   * Or if surplus has increased (+x%), this is true.
   * 
   * False otherwise, and neutral if the change is 0, or the item is new (untracked)
   */
  isPositive: boolean | undefined; 
}



export interface SurplusBalanceLineChartData {
  month: string
  surplus: number
  balance: number
}

export interface TrendsLineChartData {
  month: string
  isMissing: boolean // Flag to indicate missing data
  surplus: number
  balance: number

  isPrediction: boolean

  totalNetIncome: number
  totalExpenses: number
  categories: PieData[]
}


export interface TreeNode {
  name: string;
  value: number;
  isValueChangedDuringCalc?: boolean
  children: TreeNode[];
  itemStyle?: any;
}
//#endregion




//#region Abnormality Detection
// Represents the result of analyzing a category for abnormalities


export interface CategoryAnalysis {
  name: string;
  averageSpending: number;
  spikes: { month: string; value: number }[];
  totalMonths: number;
  nonZeroMonths: number;
  standardDeviation: number;
}
export interface CategoryInsight {
  name: string;
  insights: { key: string; value: string }[];
}


export interface AbnormalityAnalysis {
  name: string;  // The name of the category being analyzed
  categoryName: string;  // Raw category name (include system prefix for internal lookups)
  abnormalities: Abnormality[];  // A list of detected abnormalities for the category
  totalSpending?: number;  // The average spending for the category
  averageSpending?: number;  // The average spending for the category

  rawValues: number[];  // Raw values for the category
  fittedValues?: number[];  // Fitted values by the Machine Learning algorithm for the category
  smoothedValues?: number[];  // Smoothed values for the category
  xAxisData: string[];  // X-axis data for the category
  detailedAnalysis: TrendAnalysis;  // Detailed trend analysis for the category

  categoryConfig?: ExpenseCategoryDetails;  // Configuration for the category
}

/** Interface for detecting Trend Results */
export interface TrendAnalysis {
  trend: "upward" | "downward" | "neutral";
  strength: "weak" | "moderate" | "strong";
  growthRate: number;
  smoothedData: number[];
  fittedValues: number[];
  predictedValues: ForecastData | null
  model: string;
  isSingleOccurrence: boolean;
}

export interface ForecastData {
  forecast: number[][]
}

export enum AbnormalityType {
  SingleOccurrence = "Single Occurrence",
  Spike = "Spike",
  HighFluctuation = "High Fluctuation",
  ExtremeFluctuation = "Extreme Fluctuation",
  Growth = "Growth",
  FluctuatingGrowth = "Fluctuating Growth",
}

// Represents an individual abnormality detected in a category
export interface Abnormality {
  type: AbnormalityType;
  description: string;  // A user-friendly description of the abnormality
  month?: string;  // The month when the abnormality occurred (for single occurrence or spike)
  value?: number;  // The specific value associated with the abnormality (for spikes or single occurrences)
  fluctuation?: number;  // The fluctuation value (for high or extreme fluctuations)
  growthRate?: number;  // The growth rate (for consistent or fluctuating growth)
  config?: { colorDark: string; colorLight: string; icon: string };  // Configuration for the abnormality type
}


export interface AbnormalityChartData {
  rawValues: number[];
  xAxisData: string[];
  categoryName: string
  details: TrendAnalysis
}


export const AbnormalityConfig: Record<AbnormalityType, { colorDark: string; colorLight: string; icon: string }> = {
  [AbnormalityType.SingleOccurrence]: {
    colorDark: "#FFCDD2",  // Light red
    colorLight: "#B71C1C", // Deep red
    icon: "warning",       // Material Symbol for warnings
  },
  [AbnormalityType.Spike]: {
    colorDark: "#F8BBD0",  // Pink shade
    colorLight: "#880E4F", // Dark pink
    icon: "show_chart",    // Material Symbol for a chart spike
  },
  [AbnormalityType.HighFluctuation]: {
    colorDark: "#BBDEFB",  // Light blue
    colorLight: "#0D47A1", // Deep blue
    icon: "trending_up",   // Material Symbol for fluctuation
  },
  [AbnormalityType.ExtremeFluctuation]: {
    colorDark: "#B3E5FC",  // Cyan
    colorLight: "#006064", // Deep cyan
    icon: "bolt",          // Material Symbol for extreme change
  },
  [AbnormalityType.Growth]: {
    colorDark: "#C8E6C9",  // Light green
    colorLight: "#1B5E20", // Dark green
    icon: "trending_flat", // Material Symbol for consistent growth
  },
  [AbnormalityType.FluctuatingGrowth]: {
    colorDark: "#DCEDC8",  // Lime green
    colorLight: "#33691E", // Deep lime green
    icon: "change_circle", // Material Symbol for fluctuating growth
  },
};

//#endregion


//#region Slider
export interface BudgetSlider {
  name: string
  value: number
  min?: number
  max?: number
  locked: boolean
  weight: number // Higher weight means higher priority => Less likely to be changed
  icon?: string
  colorDark?: string
  colorLight?: string
  isEssential?: boolean
}

export interface Tracker {
  name: string
  currentSpending: number
  targetSpending: number
  percentageSpent: number
}

export interface TrackingMetaData {
  targetSurplus: number
  avgIncome: number
  trackingCategories: Tracker[]
}

//#endregion
