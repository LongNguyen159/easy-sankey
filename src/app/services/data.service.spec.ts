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

describe('envelope editing and month copying', () => {
  it('preserves envelopes across entry saves and month copies, then clears only membership on deletion', async () => {
    const fake = testDatabase();
    TestBed.configureTestingModule({providers: [...fake.providers, DatePipe,
      {provide: UiService, useValue: {showSnackBar: () => {}, openConfirmDialog: () => {}}},
    ]});
    const data = TestBed.inject(DataService);
    await data.ready;
    await data.selectMonth('2026-11');
    await data.saveEnvelopes('2026-11', [{id:'personal',name:'Personal',budget:500}]);
    await data.saveMonthDraft([
      {id:'salary',type:'income',target:'Salary',value:1000},
      {id:'dinner',type:'expense',target:'Dinner',value:40,source:'Restaurants@__system/category__',envelopeId:'personal'},
    ] as import('../components/models').UserDefinedLink[], '2026-11');
    expect(data.monthlyData['2026-11'].remainingBalance).toBe('960');
    expect(fake.months.get('2026-11')?.envelopes?.[0].budget).toBe(500);
    const original = data.monthlyData['2026-11'];
    await data.importMonth('2026-12', {entries:original.rawInput,categories:[],envelopes:original.envelopes});
    const copy = fake.months.get('2026-12')!;
    expect(copy.envelopes?.[0].id).not.toBe('personal');
    expect(copy.entries[1].envelopeId).toBe(copy.envelopes?.[0].id);
    expect(copy.entries[1].source).toBe('Restaurants@__system/category__');
    await data.deleteLocalEnvelope('2026-11', 'personal');
    expect(data.monthlyData['2026-11'].envelopes).toEqual([]);
    expect(fake.months.get('2026-11')?.entries[1].envelopeId).toBeNull();
    expect(fake.months.get('2026-11')?.entries[1].source).toBe('Restaurants@__system/category__');
    expect(data.monthlyData['2026-11'].remainingBalance).toBe('960');
    expect(copy.envelopes?.[0].budget).toBe(500);
  });

  it('keeps an unused envelope when its month has no expense entries', async () => {
    const fake = testDatabase();
    TestBed.configureTestingModule({providers: [...fake.providers, DatePipe,
      {provide: UiService, useValue: {showSnackBar: () => {}, openConfirmDialog: () => {}}},
    ]});
    const data = TestBed.inject(DataService);
    await data.ready;
    await data.selectMonth('2026-11');
    await data.saveEnvelopes('2026-11', [{id:'unused',name:'Personal',budget:500}]);
    await data.saveMonthDraft([], '2026-11');
    await data.selectMonth('2026-12');
    await data.selectMonth('2026-11');
    expect(data.monthlyData['2026-11'].envelopes?.[0].budget).toBe(500);
    expect(fake.months.get('2026-11')?.entries).toEqual([]);
    expect(data.monthlyData['2026-11'].remainingBalance).toBe('0');
  });
});

describe('global envelope spending', () => {
  it('shows a shared allowance in every month while counting spending independently', async () => {
    const fake=testDatabase();
    TestBed.configureTestingModule({providers:[...fake.providers,DatePipe,
      {provide:UiService,useValue:{showSnackBar:()=>{},openConfirmDialog:()=>{}}}]});
    const data=TestBed.inject(DataService);await data.ready;
    const global={id:'revolut',name:'Revolut spending',budget:500,isGlobal:true};
    await data.selectMonth('2026-11');
    await data.saveEnvelopes('2026-11',[],[global],[]);
    const entries=(amount:number)=>[
      {id:'salary',type:'income',target:'Salary',value:1000},
      {id:'dinner',type:'expense',target:'Dinner',value:amount,envelopeId:'revolut'},
    ] as import('../components/models').UserDefinedLink[];
    await data.saveMonthDraft(entries(40),'2026-11');
    await data.selectMonth('2026-12');
    let active!:SingleMonthData;const subscription=data.getSingleMonthData().subscribe(value=>active=value);
    expect(active.envelopes).toEqual([global]);
    expect(active.sankeyData.nodes.find(node=>node.envelopeId)?.spent).toBe(0);
    await data.saveMonthDraft(entries(90),'2026-12');
    expect(active.sankeyData.nodes.find(node=>node.envelopeId)?.spent).toBe(90);
    expect(active.remainingBalance).toBe('910');
    expect(data.monthlyData['2026-11'].sankeyData.nodes.find(node=>node.envelopeId)?.spent).toBe(40);
    await data.saveEnvelopes('2026-12',[],[{...global,budget:600}],[global]);
    expect(data.monthlyData['2026-11'].envelopes?.[0].budget).toBe(600);
    expect(data.monthlyData['2026-11'].remainingBalance).toBe('960');
    const december=data.monthlyData['2026-12'];
    await data.importMonth('2027-01',{entries:december.rawInput,categories:[],envelopes:december.envelopes});
    expect(fake.months.get('2027-01')?.entries[1].envelopeId).toBe('revolut');
    expect(fake.months.get('2027-01')?.envelopes).toEqual([]);
    subscription.unsubscribe();
  });
});
