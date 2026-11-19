import { DataService } from "../services/data.service";
import { MonthlyData, SingleMonthData } from "../components/models";
import { formatDateToYYYYMM } from "./utils";

/** Process data for the requested month.
 * @param selectedMonth The month to process. Type Date.
 * @param allMonthsData The data for all months. Type MonthlyData.
 * @param singleMonthEntries The data for the selected month. Type ProcessedOutputData.
 * @param dataService Function requires dataService to process the input data.
 */
export async function onMonthChanges(selectedMonth: Date, allMonthsData: MonthlyData, singleMonthEntries: SingleMonthData , dataService: DataService) {
    await dataService.selectMonth(formatDateToYYYYMM(selectedMonth));
}
