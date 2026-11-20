import {TestBed} from '@angular/core/testing';
import {DatePipe} from '@angular/common';
import {testDatabase} from '../testing/database';
import {DataService} from './data.service';
import {SettingsService} from './settings.service';
import {UiService} from './ui.service';
import {SingleMonthData} from '../components/models';
import {formatDateToYYYYMM} from '../utils/utils';

describe('initial demo data', () => {
  it('shows demo on initial selection despite welcome preferences changing during the query', async () => {
    const fake = testDatabase();
    fake.configuration.settings = {};
    let finishQuery!: () => void;
    const pending = new Promise<void>(resolve => finishQuery = resolve);
    const range = fake.api.months.range.bind(fake.api.months);
    spyOn(fake.api.months, 'range').and.callFake(async () => {
      await pending;
      return range();
    });
    const save = spyOn(fake.api.months, 'save').and.callThrough();
    TestBed.configureTestingModule({providers: [
      ...fake.providers, DatePipe,
      {provide: UiService, useValue: {showSnackBar: () => {}, openConfirmDialog: () => {}}},
    ]});
    const data = TestBed.inject(DataService);
    let active!: SingleMonthData;
    let months: Record<string, SingleMonthData> = {};
    const single = data.getSingleMonthData().subscribe(value => active = value);
    const all = data.getAllMonthsData().subscribe(value => months = value);
    const month = formatDateToYYYYMM(new Date());
    const selection = data.selectMonth(month);
    const preferences = TestBed.inject(SettingsService);
    await preferences.write('firstTime', 'false');
    await preferences.write('appVersion', '2.0.4');
    finishQuery();
    await data.ready;
    await selection;

    expect(data.loadError()).toBeNull();
    expect(active.rawInput).toEqual(data.demoLinks);
    expect(active.totalGrossIncome).toBe(1000);
    expect(months[month].rawInput).toEqual(data.demoLinks);
    expect(data.isDemo()).toBeTrue();

    await data.selectMonth('2000-01');
    expect(active.rawInput).toEqual([]);
    expect(data.isDemo()).toBeFalse();
    await data.selectMonth(month);
    expect(active.rawInput).toEqual(data.demoLinks);
    expect(data.isDemo()).toBeTrue();
    expect(save).not.toHaveBeenCalled();
    expect(fake.months.size).toBe(0);
    single.unsubscribe(); all.unsubscribe();
  });
});
