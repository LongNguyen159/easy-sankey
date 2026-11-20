import {inject,Injectable} from '@angular/core';
import {DATABASE_CLIENT,CONFIGURATION} from '../data/database';
import {UserDefinedLink} from '../components/models';
@Injectable({providedIn:'root'})
export class FixedCostService {
 private database=inject(DATABASE_CLIENT);
 private items=structuredClone(inject(CONFIGURATION).fixedCosts);
 list(){return structuredClone(this.items);}
 async reload(){this.items=(await this.database.api.fixedCosts.list()).items;}
 async save(items:UserDefinedLink[]){const result=await this.database.command(()=>this.database.api.fixedCosts.replace({items}));this.items=result.value;}
}
