import { envelopeSankey } from './envelope-sankey';
import { BudgetEnvelope, EntryType, isCashOutflow, SankeyLink, SankeyNode, SingleMonthData, TreeNode, UserDefinedLink } from '../components/models';

interface ExpenseData {
 totalExpenses: number;
 topLevelExpenses: { name: string; value: number }[];
 changedExpensesDuringCalculation: TreeNode[];
 wholeTree: TreeNode[];
}

/** Stateless projection: never persists, emits notifications, or changes timestamps. */
class MonthCalculator {
 private readonly REMAINING_BALANCE_LABEL = 'Surplus';
    calculate(userDefinedLinks: UserDefinedLink[], month: string, lastUpdated: Date | string,
        hasCategory: (id: string) => boolean): SingleMonthData {
        const nodesMap = new Map<string, { value: number, type: EntryType }>(); // Map to hold unique nodes and their total values and types
        const links: SankeyLink[] = []; // Array to hold links between nodes
        const incomeNodes: string[] = []; // Track income nodes
        let totalIncomeValue = 0; // Variable to store total income value
        let totalTaxValue = 0; // Variable to store total tax value
        let singleIncome = false; // Flag to check if there is only one income source
        const hasTax = userDefinedLinks.some(link => link.type === EntryType.Tax); // Check if there is any tax link

        // Step 1: Initialize the nodes without adding values yet
        userDefinedLinks.forEach(link => {
            if (!nodesMap.has(link.target)) {
                nodesMap.set(link.target, { value: 0, type: link.type });
            }

            // Step 1.2: Process links to accumulate income, taxes, and expenses
            if (link.type == EntryType.Income) {
                incomeNodes.push(link.target);
                nodesMap.get(link.target)!.value += link.value; // Add income only once
            } else if (link.type === EntryType.Tax) {
                nodesMap.get(link.target)!.value += link.value;
                totalTaxValue += link.value;
            } else if (isCashOutflow(link.type)) {
                if (!link.source) {
                    // Top-level expenses (those without a source)
                    nodesMap.get(link.target)!.value += link.value;
                } else {
                    // Child expenses (those with a source)
                    nodesMap.get(link.target)!.value = link.value; // Update child value
                }
            }
        })

        //#region: Handle Income & Taxes
        // Step 2: Aggregate income into "Total Income" node if multiple income sources exist
        if (incomeNodes.length > 1) {
            // Sum up every item in incomeNodes to get total income value
            totalIncomeValue = incomeNodes.reduce((sum, node) => sum + (nodesMap.get(node)?.value || 0), 0);
            nodesMap.set('Total Income', { value: totalIncomeValue, type: EntryType.Income });

        } else if (incomeNodes.length === 1) {
            singleIncome = true; // Only one income source, no need for a "Total Income" node


            // Total income value will be the value of incomeNodes[0], because there's only one anyway.
            totalIncomeValue = nodesMap.get(incomeNodes[0])?.value || 0;
        }

        // Step 3: Handle Usable Income if there's a tax link, otherwise use the full income directly
        const incomeSource = singleIncome ? incomeNodes[0] : 'Total Income';
        if (hasTax) {
            const usableIncome = totalIncomeValue - totalTaxValue;
            nodesMap.set('Usable Income', { value: usableIncome, type: EntryType.Income });

            for (const entry of userDefinedLinks) {
                if (entry.type === EntryType.Tax) {
                    links.push({ source: incomeSource, target: entry.target, value: entry.value });
                }
            }

            links.push({
                source: incomeSource,
                target: 'Usable Income',
                value: usableIncome
            });
        }
        //#endregion


        //#region: Handle Expenses
        
        /** This will be the default root node for Sankey Chart. The source for all expenses to flow from. */
        const sourceForExpenses = hasTax ? 'Usable Income' : incomeSource;

        if (incomeNodes.length === 0 && userDefinedLinks.length > 0) {
            nodesMap.set('Total Income', { value: 0, type: EntryType.Income });
        }

        // Step 4: Create links for expenses, using default expense source.
        userDefinedLinks.forEach(link => {
            if (link.type == EntryType.Income) {
                if (!singleIncome) {
                    links.push({
                        source: link.target,
                        target: 'Total Income',
                        value: link.value
                    });
                }
            } else if (isCashOutflow(link.type)) {
                let sourceNode = link.source || sourceForExpenses;

                // Check if the source node exists in nodesMap or is an allowed category
                if (!nodesMap.has(sourceNode) && hasCategory(sourceNode)) {
                    // Create the missing source node as a new entry with 'Expense' type
                    nodesMap.set(sourceNode, { value: 0, type: EntryType.Expense });

                    // Calculate its total value by summing all links that use it as a source
                    const sourceValue = userDefinedLinks
                        .filter(childLink => isCashOutflow(childLink.type) && childLink.source === sourceNode)
                        .reduce((sum, childLink) => sum + childLink.value, 0);
                    
                    // Set the source node's accumulated value
                    nodesMap.get(sourceNode)!.value = sourceValue;

                    // Add a link from the new source node to its child
                    links.push({
                        source: sourceNode,
                        target: link.target,
                        value: link.value
                    });

                    // Link newly created source node to the default income node
                    links.push({
                        source: sourceForExpenses, // Link to default income (Total Income or single income node)
                        target: sourceNode,
                        value: sourceValue
                    });
                } else {
                    // If the source is not found or is not in allowed categories, link directly to default income
                    const validSource = nodesMap.has(sourceNode) ? sourceNode : sourceForExpenses;
                    
                    links.push({
                        source: validSource,
                        target: link.target,
                        value: link.value
                    });
                }
            }
        });

        //#endregion


        //#region: Handle Return params

        // Step 5: Get Links and Nodes

        // Convert nodesMap to an array of nodes (including child nodes)
        const nodes: SankeyNode[] = Array.from(nodesMap.entries()).map(([name, { value }]) => ({ name, value: value }));

        // Remove duplicate links
        const uniqueLinks: SankeyLink[] = Array.from(new Set(links.map(link => JSON.stringify(link)))).map(link => JSON.parse(link) as SankeyLink);
 

       // Step 6: Calculate return params

       /** Pie data will be generated based on Tree Structure generated from Sankey.
        * Not from Sankey links.
        * 
        * Pie data will be the top level expenses only, meaning the first level in tree structure.
        * We do this because how else would we know which items are top level or which are children of which?
        * So we transform Sankey data (source - target - value) into a tree structure (name - value - children).
        * 
        * => If you want to modify pie chart data, modify tree structure.
        */
       let pieSeriesData: {name: string, value: number}[] = []

        const { totalExpenses, topLevelExpenses: pieData, changedExpensesDuringCalculation: changedExpensesDuringCalculation, wholeTree: treeMapData } = this._getExpensesData(uniqueLinks, sourceForExpenses);
        const remainingBalance: number = (totalIncomeValue - totalExpenses - totalTaxValue)

        // Push remaining balance number to Pie Data to show how much is left proportionally.
        pieSeriesData = [
            ...pieData,
            { name: this.REMAINING_BALANCE_LABEL, value: remainingBalance },
        ];


        let updatedRawInput: UserDefinedLink[] = userDefinedLinks; // Default to original input

        /** Update raw input if there are changes in expenses during calculation.
         * The value of some parent will be added up to correctly reflect total value of children.
         * Raw Input should be updated to correctly populate the form with new values.
         */
        if (changedExpensesDuringCalculation.length > 0) {
            updatedRawInput = this._updateUserInput(userDefinedLinks, changedExpensesDuringCalculation);
        }

        // Update Sankey nodes and links based on updatedRawInput
        const updatedNodes = nodes.map(node => {
            const updatedNode = updatedRawInput.find(link => link.target === node.name);
            return updatedNode ? { ...node, value: updatedNode.value, entryType: updatedNode.type } : node; // Update value or leave as is
        });

        const updatedLinks = links.map(link => {
            const updatedLink = updatedRawInput.find(l => l.target === link.target);
            return updatedLink ? { ...link, value: updatedLink.value } : link; // Update value or leave as is
        });


        // Add remaining balance to the tree map data        
        treeMapData.push({ name: this.REMAINING_BALANCE_LABEL, value: remainingBalance, children: [] });

        return {
            lastUpdated,
            sankeyData: { nodes: updatedNodes, links: updatedLinks },
            totalUsableIncome: totalIncomeValue - totalTaxValue,
            totalGrossIncome: totalIncomeValue,
            totalTax: totalTaxValue,
            totalExpenses: totalExpenses,
            remainingBalance: remainingBalance.toLocaleString('en-US'),
            pieData: pieSeriesData,
            rawInput: updatedRawInput,
            month: month,
            treeMapData: treeMapData
        };
    }

    //#region Create Tree from Sankey
    /** Function to generate a tree structure from Sankey data (source, target, value) => Tree with name, value and children */
    private _buildTree(links: SankeyLink[], rootNodeName: string): TreeNode | undefined {
        const nodeMap = new Map<string, TreeNode>();
    
        // Create nodes for all source and target in the links
        links.forEach(link => {
            if (!nodeMap.has(link.source)) {
                nodeMap.set(link.source, { name: link.source, value: 0, children: [], isValueChangedDuringCalc: false });
            }
            if (!nodeMap.has(link.target)) {
                nodeMap.set(link.target, { name: link.target, value: link.value, children: [], isValueChangedDuringCalc: false });
            }
    
            // Add the target node as a child of the source node
            const sourceNode = nodeMap.get(link.source)!;
            const targetNode = nodeMap.get(link.target)!;
            sourceNode.children.push(targetNode);
        });
    
        // Return the root node as the entry point to the tree
        return nodeMap.get(rootNodeName);
    }

    //#endregion


    //#region Calculate Total Expenses
    /** This function uses the tree structure to recursively calculate the total expenses.
     * It compares the value of each node to the sum of its children, and returns the higher value.
     */
    private _calculateNodeExpense(node: TreeNode, isRoot: boolean = false): number {
        // If the node has no children, it's a leaf node, so we return its value directly
        if (node.children.length === 0) {
            return isRoot ? 0 : node.value;
        }
    
        // Otherwise, recursively calculate the total of all child nodes
        const childrenSum: number = node.children.reduce((sum, child) => {
            return sum + this._calculateNodeExpense(child);
        }, 0);
    
        
        // If this is the root node (income), we only consider the children and ignore the root value
        if (isRoot) {
            return childrenSum;
        }
    
        // For non-root nodes, compare the current node's value to the sum of its children
        const maxExpense: number = Math.max(node.value, childrenSum);

        if (maxExpense !== node.value) {
            node.isValueChangedDuringCalc = true; // Mark as changed
        } else {
            node.isValueChangedDuringCalc = false; // Mark as unchanged
        }

        node.value = maxExpense; // Update the parent node if children's total is higher.

        return maxExpense;
    }


    private _getExpensesData(links: SankeyLink[], rootNodeName: string): ExpenseData {
        const treeFromRootNode = this._buildTree(links, rootNodeName);
        if (!treeFromRootNode) {
            return { totalExpenses: 0, topLevelExpenses: [], changedExpensesDuringCalculation: [], wholeTree: [] };
        }

        /** Tree might be modified during calculations. So if you want to use the tree structure, write code after these lines. */
        const totalExpenses: number = this._calculateNodeExpense(treeFromRootNode, true);
        const changedNodes: TreeNode[] = this._getChangedNodes(treeFromRootNode);

        
        /** Tree is in recursive structure, but we only care about Top-level expense for pie data.
         * So only iterate through children of root node to get top level expenses.
         */
        const pieData = treeFromRootNode.children.map(child => {
            return {
                name: child.name,
                value: child.value
            }
        })

        return {
            totalExpenses: totalExpenses,
            topLevelExpenses: pieData,
            changedExpensesDuringCalculation: changedNodes,
            wholeTree: treeFromRootNode.children
        }
    }

    /** Recursively transverse the tree to find the modified nodes.
     * @param node - The current node to check for changes. Or the starting node.
     * It will recursively check all children of the node.
     * @param changedNodes - The array to store the changed nodes. Default to empty array, will be used in recursion to push in changed nodes.
     * 
     * @returns An array of changed nodes.
     */
    private _getChangedNodes(node: TreeNode, changedNodes: TreeNode[] = []): TreeNode[] {    
        // Check if the node has been modified
        if (node.isValueChangedDuringCalc) {
            changedNodes.push(node); // Add node to changed nodes array
        }
    
        // Recursively check each child
        node.children.forEach(child => {
            this._getChangedNodes(child, changedNodes); // Recursively collect changed nodes
        });
    
        return changedNodes;
    }

    //#endregion

    private _updateUserInput(oldInput: UserDefinedLink[], changedExpenses: TreeNode[]): UserDefinedLink[] {
        return oldInput.map(link => {
            // Check if the current link's target matches any of the changed expenses
            const updatedExpense = changedExpenses.find(node => node.name === link.target);
            // If it matches, return a new link object with the updated value; otherwise, return the original link
            return updatedExpense ? { ...link, value: updatedExpense.value } : link;
        });
    }

}

export function savingsRate(totalSavings: number, income: number): number | null {
  return income > 0 ? totalSavings * 100 / income : null;
}

function projectSavings(month: SingleMonthData) {
  const investmentNames = new Set(month.rawInput
    .filter(entry => entry.type === EntryType.Investment)
    .map(entry => entry.target));
  let investments = 0;

  function regularExpense(node: TreeNode): TreeNode | undefined {
    const children = node.children.map(regularExpense).filter(child => child !== undefined);
    // Parent amounts include their children. Only the remainder belongs to the parent entry.
    const ownAmount = node.value - node.children.reduce((sum, child) => sum + child.value, 0);
    const investment = investmentNames.has(node.name);
    if (investment) investments += ownAmount;
    if (!children.length && (investment || (node.children.length && ownAmount === 0))) return undefined;
    const value = (investment ? 0 : ownAmount) + children.reduce((sum, child) => sum + child.value, 0);
    return { ...node, value, children };
  }

  // The final node is cash surplus.
  const regularExpenseTree = month.treeMapData.slice(0, -1)
    .map(regularExpense).filter(node => node !== undefined);
  const totalSavings = month.totalUsableIncome - month.totalExpenses + investments;
  const savings = { investments, totalSavings, savingsRate: savingsRate(totalSavings, month.totalUsableIncome) };
  return { regularExpenseTree, savings };
}

export function calculateMonth(entries: UserDefinedLink[], month: string, lastUpdated: Date | string,
  hasCategory: (id: string) => boolean, envelopes: BudgetEnvelope[] = []): SingleMonthData {
  const result = new MonthCalculator().calculate(entries, month, lastUpdated, hasCategory);
  const sankeyData = envelopeSankey(result.sankeyData, result.rawInput, envelopes, hasCategory);
  const monthData = {
    ...result,
    ...projectSavings(result),
    envelopes: structuredClone(envelopes),
    sankeyData,
  };
  const budgetsWithSpending = sankeyData.nodes.filter(node => node.envelopeId && (node.spent ?? 0) > 0);
  if (!budgetsWithSpending.length) return monthData;

  const unspentBudget = budgetsWithSpending.reduce((total, node) =>
    total + Math.max(0, node.budget! - node.spent!), 0);
  const overspending = budgetsWithSpending.reduce((total, node) =>
    total + Math.max(0, node.spent! - node.budget!), 0);
  const surplusAfterBudgets = result.totalUsableIncome - result.totalExpenses - unspentBudget;
  return {
    ...monthData,
    surplusAfterBudgets: unspentBudget > 0 ? surplusAfterBudgets : undefined,
    surplusAtBudgetLimits: overspending > 0 ? surplusAfterBudgets + overspending : undefined,
    totalBudgetOverspending: overspending > 0 ? overspending : undefined,
  };
}
