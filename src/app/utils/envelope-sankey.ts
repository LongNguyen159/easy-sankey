import { BudgetEnvelope, EntryType, SankeyData, SankeyLink, SankeyNode, UserDefinedLink } from '../components/models';

/** Project envelope capacity only after actual spending, category totals and surplus are calculated. */
export function envelopeSankey(base: SankeyData, entries: UserDefinedLink[], envelopes: BudgetEnvelope[],
  hasCategory: (id: string) => boolean): SankeyData {
  if (!envelopes.length) return base;
  const income = entries.filter(entry => entry.type === EntryType.Income);
  const root = entries.some(entry => entry.type === EntryType.Tax) ? 'Usable Income'
    : income.length === 1 ? income[0].target : 'Total Income';
  const expenses = entries.filter(entry => entry.type === EntryType.Expense);
  const byName = new Map(expenses.map(entry => [entry.target, entry]));
  const envelopeMap = new Map(envelopes.map(envelope => [envelope.id, envelope]));
  const systemNames = new Set(entries.filter(entry => entry.type !== EntryType.Expense).map(entry => entry.target));
  systemNames.add('Total Income'); systemNames.add('Usable Income');
  const nodes = new Map<string, SankeyNode>(base.nodes.filter(node => systemNames.has(node.name)).map(node => [node.name, {...node}]));
  if (!nodes.has(root)) nodes.set(root, { name: root, value: 0 });
  const links = new Map<string, SankeyLink>();
  const addLink = (source: string, target: string, value: number) => {
    const key = JSON.stringify([source, target]);
    const previous = links.get(key);
    links.set(key, { source, target, value: value + (previous?.value ?? 0) });
  };
  base.links.filter(link => systemNames.has(link.source) && systemNames.has(link.target))
    .forEach(link => addLink(link.source, link.target, link.value));
  for (const envelope of envelopes) {
    const name = JSON.stringify(['envelope', envelope.id]);
    nodes.set(name, { name, displayName: envelope.name, value: envelope.budget, envelopeId: envelope.id, spent: 0, budget: envelope.budget });
    addLink(root, name, envelope.budget);
  }
  const children = new Map<string, UserDefinedLink[]>();
  for (const entry of expenses) {
    if (entry.source && byName.has(entry.source)) {
      children.set(entry.source, [...(children.get(entry.source) ?? []), entry]);
    }
  }
  const total = new Map<string, number>();
  const measure = (entry: UserDefinedLink): number => {
    const amount = Math.max(entry.value, (children.get(entry.target) ?? []).reduce((sum, child) => sum + measure(child), 0));
    total.set(entry.id, amount); return amount;
  };
  const roots = expenses.filter(entry => !entry.source || !byName.has(entry.source));
  roots.forEach(measure);
  function visit(entry: UserDefinedLink, ancestors: UserDefinedLink[], categoryId?: string) {
    const path = [...ancestors, entry];
    const descendants = children.get(entry.target) ?? [];
    // A parent may contain an amount above its children. Only this residual is its own spending.
    const ownAmount = (total.get(entry.id) ?? entry.value) - descendants.reduce((sum, child) => sum + (total.get(child.id) ?? child.value), 0);
    if (ownAmount > 0 || !descendants.length) {
      const scope = entry.envelopeId && envelopeMap.has(entry.envelopeId) ? entry.envelopeId : '';
      let source = scope ? JSON.stringify(['envelope', scope]) : root;
      if (scope) nodes.get(source)!.spent! += ownAmount;
      if (categoryId) {
        const name = JSON.stringify(['category', scope, categoryId]);
        const node = nodes.get(name) ?? { name, value: 0, categoryId };
        node.value += ownAmount; nodes.set(name, node);
        addLink(source, name, ownAmount); source = name;
      }
      for (const ancestor of path) {
        const name = JSON.stringify(['entry', scope, ancestor.id]);
        const node = nodes.get(name) ?? { name, displayName: ancestor.target, entryName: ancestor.target, value: 0 };
        node.value += ownAmount; nodes.set(name, node);
        addLink(source, name, ownAmount); source = name;
      }
    }
    descendants.forEach(child => visit(child, path, categoryId));
  }
  roots.forEach(entry => visit(entry, [], entry.source && hasCategory(entry.source) ? entry.source : undefined));
  for (const node of nodes.values()) {
    // Overspending must remain visible; capacity is a floor, never a cap on actual flows.
    if (node.envelopeId) {
      node.value = Math.max(node.budget!, node.spent!);
      const link = links.get(JSON.stringify([root, node.name]))!;
      link.value = node.value;
    }
  }
  // Preserve real income values for labels and tooltips; planning bands may exceed actual income.
  return { nodes: [...nodes.values()], links: [...links.values()], categoryView: base };
}
