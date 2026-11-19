import { UiService } from './ui.service';
import { AppStorage } from '../storage/app-storage';
import { DatePipe } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { MonthlyData } from '../components/models';


@Injectable({
  providedIn: 'root'
})

/**
 * Manage Logs for each input ID of a month.
 * 
 * This logs trace the changes made to 'Amount' input field, and keep the last 3 changes.
 * 
 * Purpose: So that user remembers what the entered previously, making it easier to revert back
 * if they made a mistake in entering the amount.
 * 
 * Use Case:
 * - User enters an amount in the 'Amount' field using inline calculator: 100 + 200 = 300
 * - And while editing the amount, they might forget "Where am I? What was the previous amount? Did I include them already?"
 * 
 * 
 */
export class LogsService {
  private readonly storage = inject(AppStorage);
  private readonly ui = inject(UiService);
  private logs: { [month: string]: { [inputId: string]: { timestamp: string; value: string | number }[] } } = {};
  private readonly STORAGE_KEY = 'logs';

  constructor(private datePipe: DatePipe) {
    this.loadLogsFromLocalStorage();
  }


  reloadFromStorage():void { this.logs=this.storage.read('logs') ?? {}; }

  /** Write into logs (history) of given input and month.
   * 
   * @param month The month to log the change for.
   * @param inputId The ID of the input field to log the change for.
   * @param newValue The value to write into the log.
   */
  async setLog(month: string, inputId: string, newValue: string | number): Promise<void> {
    const _timestamp = new Date()

    /** Timestamp for the Logs */
    const timestamp = this.datePipe.transform(_timestamp, 'MMM dd, HH:mm') || '';

    // Ensure logs for the month exist
    if (!this.logs[month]) {
      this.logs[month] = {};
    }

    // Ensure logs for the inputId exist
    if (!this.logs[month][inputId]) {
      this.logs[month][inputId] = [];
    }

    // Add the new log entry
    this.logs[month][inputId].unshift({ timestamp, value: newValue });

    // Keep only the last 3 logs for the input ID
    if (this.logs[month][inputId].length > 5) {
      this.logs[month][inputId].pop(); // Remove the oldest log
    }

    await this.saveLogsToLocalStorage();
  }

  /** Get logs for a specific input ID in a specific month 
   * 
   * @param month The month to get logs for.
   * @param inputId The ID of the input field to get logs for.
  */
  getLogs(month: string, inputId: string): { timestamp: string; value: string | number }[] {
    return this.logs[month]?.[inputId] || [];
  }

  /** [NOT IMPLEMENTED YET] Remove logs for a specific input ID in a specific month */
  async removeLogs(month: string, inputId: string): Promise<void> {
    if (this.logs[month]?.[inputId]) {
      delete this.logs[month][inputId];
      await this.saveLogsToLocalStorage();
    }
  }

  /** [NOT IMPLEMENTED YET] Remove all logs for a specific month */
  async removeMonthLogs(month: string): Promise<void> {
    if (this.logs[month]) {
      delete this.logs[month];
      await this.saveLogsToLocalStorage();
    }
  }

  /** Save logs to Session Storage */
  private async saveLogsToLocalStorage(): Promise<void> {
    try {
      await this.storage.write(this.STORAGE_KEY, this.logs);
    } catch (error) {
      this.logs=this.storage.read(this.STORAGE_KEY) ?? {};
      throw error;
    }
  }

  /** Load logs from Session Storage */
  private async loadLogsFromLocalStorage(): Promise<void> {
    try {
      const storedLogs = this.storage.read(this.STORAGE_KEY);
      this.logs = storedLogs ? storedLogs : {};
      const monthlyData: MonthlyData = this.storage.read('monthlyData') ?? {};
      await this.cleanupLogs(monthlyData);
    } catch (error) {
      console.error('Could not load entry history', error);
      this.ui.showSnackBar('Could not load or update entry history. Your saved data has been retained.');
    }
  }

  /** Keep logs in LocalStorage no more than 30days since their creation date.
   * Use "lastUpdated" property of each month to determine when the logs were last updated.
   * 
   * This function is called only on app load.
   * 
   */
  async cleanupLogs(monthlyData: MonthlyData): Promise<void> {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const now = Date.now();
  
    // Return early if monthlyData is empty
    if (!monthlyData || Object.keys(monthlyData).length === 0) {
      console.warn("MonthlyData is empty, skipping cleanup.");
      return;
    }
  
    let changed=false;
    for (const month in this.logs) {
      const lastUpdated = monthlyData[month]?.lastUpdated;
  
      // Skip if lastUpdated is missing or invalid
      if (!lastUpdated) {
        console.warn(`No valid lastUpdated for month: ${month}, skipping this month.`);
        continue;
      }
  
      // Delete the logs if lastUpdated is older than 30 days
      if (now - new Date(lastUpdated).getTime() > THIRTY_DAYS_MS) {
        console.info(`Deleting logs for month: ${month}, last updated: ${lastUpdated}`);
        delete this.logs[month];
        changed=true;
      }
    }
  
    if(changed) await this.saveLogsToLocalStorage();
  }


  /** Sanitise the logs, only keep valid ids in that month.
   * If id changes, or content being pasted (old entries aren't valid anymore), this function clears out
   * the logs for the invalid ids.
   * @param month The month to sanitise logs for.
   * @param validIds The valid IDs (all IDs of that month) to keep logs for.
   * 
   * This function should be called after data is processed, or on form submit.
   */
  async sanitiseLogs(month: string, validIds: string[]): Promise<void> {
    if (!this.logs[month]) return;
  
    // Convert the valid IDs into a Set for faster lookups
    const validIdsSet = new Set(validIds);
  
    // Filter the logs to keep only those with valid IDs
    this.logs[month] = Object.fromEntries(
      Object.entries(this.logs[month]).filter(([inputId]) => validIdsSet.has(inputId))
    );

    await this.saveLogsToLocalStorage();
  }
}
