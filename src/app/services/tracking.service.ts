import {inject,Injectable,signal} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {DATABASE_CLIENT,CONFIGURATION,TrackingMetadata} from '../data/database';
import {Tracker} from '../components/models';
@Injectable({providedIn:'root'})
export class TrackingService {
 private database=inject(DATABASE_CLIENT);
 private initial=inject(CONFIGURATION);
 private targets=new BehaviorSubject<Tracker[]>(this.initial.tracking.map(item=>({...item,currentSpending:0,percentageSpent:0})));
 private metadata=new BehaviorSubject<TrackingMetadata>(structuredClone(this.initial.metadata));
 trackingCategories$=this.targets.asObservable();
 trackingMetaData$=this.metadata.asObservable();
 categoriesToTrack=signal<string[]>([]);
 getTrackingData(){return structuredClone(this.targets.value);}
 getAdditionalData(){return structuredClone(this.metadata.value);}
 async saveTrackingData(items:Tracker[],targetSurplus:number,avgIncome:number,merge=false){
  const valid=items.filter(item=>item.targetSpending!==0);
  if(!valid.length)return;
  const names=new Set(valid.map(item=>item.name));
  const targets=merge?[...valid,...this.targets.value.filter(item=>!names.has(item.name))]:valid;
  const metadata={targetSurplus,avgIncome};
  await this.database.command(()=>this.database.api.tracking.replace({items:targets.map(({name,targetSpending})=>({name,targetSpending})),metadata}));
  this.targets.next(structuredClone(targets));this.metadata.next(metadata);
 }
 async updateMultipleCurrentSpendings(updates:{name:string;totalValue:number}[]){
  const spending=new Map(updates.map(item=>[item.name,item.totalValue]));
  this.targets.next(this.targets.value.map(item=>spending.has(item.name)?{...item,currentSpending:spending.get(item.name)!,percentageSpent:item.targetSpending?spending.get(item.name)!/item.targetSpending*100:0}:item));
 }
 cleanupTrackingCategories(current:{name:string;totalValue:number}[]){
  const names=new Set(current.map(item=>item.name));
  this.targets.next(this.targets.value.map(item=>names.has(item.name)?item:{...item,currentSpending:0,percentageSpent:0}));
 }
 async removeTrackingData(name:string){
  await this.database.command(()=>this.database.api.tracking.delete({id:name}));
  this.targets.next(this.targets.value.filter(item=>item.name!==name));
 }
 async reload(){
  const [targets,metadata]=await Promise.all([this.database.api.tracking.list(),this.database.api.trackingMetadata()]);
  this.targets.next(targets.items.map(item=>({...item,currentSpending:0,percentageSpent:0})));this.metadata.next(metadata);
 }
 async clearTrackingData(){
  await this.database.command(()=>this.database.api.tracking.replace({items:[],metadata:{targetSurplus:0,avgIncome:0}}));
  this.targets.next([]);this.metadata.next({targetSurplus:0,avgIncome:0});
 }
}
