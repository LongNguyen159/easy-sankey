import {inject,Injectable,signal} from '@angular/core';
import {DATABASE_CLIENT,CONFIGURATION} from '../data/database';
import {Budget} from '../components/models';
@Injectable({providedIn:'root'})
export class BudgetService {
 private database=inject(DATABASE_CLIENT);
 budget=signal<Budget[]>(structuredClone(inject(CONFIGURATION).budgets));
 getBudgets(){return structuredClone(this.budget());}
 async reload(){this.budget.set((await this.database.api.budgets.list()).items);}
 async setBudget(category:string,value:number){
  await this.database.command(async()=>{
   if(value<=0)await this.database.api.budgets.delete({id:category});
   else if(await this.database.api.budgets.get({id:category}))await this.database.api.budgets.update({id:category,changes:{value}});
   else await this.database.api.budgets.create({item:{category,value}});
  });
  await this.reload();
 }
 async saveBudgets(budgets:Budget[]){const items=budgets.filter(item=>item.value>0);const result=await this.database.command(()=>this.database.api.budgets.replace({items}));this.budget.set(result.value);}
}
