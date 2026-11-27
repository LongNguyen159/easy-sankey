const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { PrismaClient } = require("../generated/prisma/client");
const { migrate } = require("./migrations");
const { canonical, envelopes: validateEnvelopes, entries: validateEntries } = require("./import-export");
const {
  isCashOutflow,
  sourceData,
  legacyData,
  entryDto,
  entryColumns,
  validateTemplateBudgets,
  categoryDto,
  historyDto,
  preferenceColumns,
} = require("./import-export");
const defaults = require("./default-categories.json");
function openDatabase(filename, { onQuery } = {}) {
  const missing =
    !fs.existsSync(filename) && fs.existsSync(`${filename}.initialized`);
  migrate(filename);
  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${filename}`, timeout: 5000 }),
    log: onQuery ? [{ emit: "event", level: "query" }] : [],
  });
  if (onQuery) prisma.$on("query", (event) => onQuery(event.query));
  const marker = () =>
    fs.writeFileSync(
      `${filename}.initialized`,
      "Relational database initialized",
      { mode: 0o600 },
    );
  const ready = prisma.importState
    .upsert({
      where: { id: 1 },
      create: { id: 1, sourceFormat: missing ? "recovery-required" : null },
      update: {},
    })
    .then(async (importState) => {
      if (importState.localStorageImportCompleted) marker();
      await prisma.appSettings.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
      await prisma.trackingSettings.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
    });
  const state = async (db = prisma) =>
    db.importState.findUniqueOrThrow({ where: { id: 1 } });
  const outcome = async (db, value, affected = []) => ({
    revision: (await state(db)).revision,
    value,
    affected,
  });
  async function command(payload, work) {
    await ready;
    return prisma.$transaction(
      async (db) => {
        const current = await state(db);
        if (
          payload?.revision !== undefined &&
          payload.revision !== current.revision
        )
          throw new Error("CONFLICT: Data changed. Reload before saving.");
        const result = await work(db);
        if (result.changed !== false)
          await db.importState.update({
            where: { id: 1 },
            data: { revision: { increment: 1 } },
          });
        return outcome(db, result.value, result.affected ?? []);
      },
      { timeout: 30000 },
    );
  }
  async function readMonths(db, monthIds) {
    const months = await db.month.findMany({
      where: { id: monthIds },
      orderBy: { id: "asc" },
    });
    if (!months.length) return [];

    // Filter each table by month so Prisma never has to bind a list of relation keys.
    const entries = await db.entry.findMany({
      where: { monthId: monthIds },
      orderBy: [{ monthId: "asc" }, { position: "asc" }],
    });
    const envelopes = await db.envelope.findMany({
      where: { monthId: monthIds },
      orderBy: [{ monthId: "asc" }, { position: "asc" }],
    });
    const monthsById = new Map(months.map((row) => [row.id, {
      month: row.id,
      lastUpdated: row.lastUpdated ?? "-",
      entries: [],
      envelopes: [],
      revision: row.revision,
    }]));
    const entriesByMonth = new Map(months.map((row) => [row.id, new Map()]));
    for (const row of entries)
      entriesByMonth.get(row.monthId).set(row.id, row);
    for (const row of entries) {
      const parent = entriesByMonth.get(row.monthId).get(row.parentEntryId);
      monthsById.get(row.monthId).entries.push(entryDto({ ...row, parent }));
    }
    for (const row of envelopes)
      monthsById.get(row.monthId).envelopes.push(envelopeDto(row));
    return [...monthsById.values()];
  }
  async function getMonth(db, month) {
    const [row] = await readMonths(db, month);
    return row ?? null;
  }
  async function relation(db, item, month, template = false) {
    if (!item.source)
      return {
        categoryId: null,
        [template ? "parentId" : "parentEntryId"]: null,
      };
    if (!isCashOutflow(item.type))
      throw new Error("Only expenses may have a parent/category.");
    if (await db.category.findUnique({ where: { id: item.source } }))
      return {
        categoryId: item.source,
        [template ? "parentId" : "parentEntryId"]: null,
      };
    const parent = template
      ? await db.fixedCostTemplate.findUnique({
          where: { normalizedName: item.source.trim().toLowerCase() },
        })
      : await db.entry.findUnique({
          where: {
            monthId_normalizedName: {
              monthId: month,
              normalizedName: item.source.trim().toLowerCase(),
            },
          },
        });
    if (!parent)
      throw new Error(`Missing parent/category for entry ${item.id}.`);
    return {
      categoryId: null,
      [template ? "parentId" : "parentEntryId"]: parent.id,
    };
  }
  async function checkCycle(db, month, id, parentId, template = false) {
    const visited = new Set([id]);
    while (parentId) {
      if (visited.has(parentId))
        throw new Error("Expense hierarchy contains a cycle.");
      visited.add(parentId);
      const parent = template
        ? await db.fixedCostTemplate.findUnique({ where: { id: parentId } })
        : await db.entry.findUnique({
            where: { monthId_id: { monthId: month, id: parentId } },
          });
      parentId = template ? parent?.parentId : parent?.parentEntryId;
    }
  }
  async function appendHistory(db, month, id, item) {
    canonical("logs", { [month]: { [id]: [item] } });
    const old = await db.entryHistory.findMany({
      where: { monthId: month, entryId: id },
      orderBy: { position: "asc" },
    });
    await db.entryHistory.deleteMany({
      where: { monthId: month, entryId: id },
    });
    await db.entryHistory.createMany({
      data: [item, ...old.map(historyDto)]
        .slice(0, 5)
        .map((value, position) => ({
          id: randomUUID(),
          monthId: month,
          entryId: id,
          position,
          timestampText: value.timestamp,
          valueText: typeof value.value === "string" ? value.value : null,
          valueNumber: typeof value.value === "number" ? value.value : null,
        })),
    });
  }
  function envelopeDto(row) {
    return { id: row.id, name: row.name, budget: row.budget, ...(row.monthId === null ? {isGlobal: true} : {}) };
  }
  async function listGlobalEnvelopes(db) {
    return (await db.envelope.findMany({where: {monthId: null}, orderBy: {position: 'asc'}})).map(envelopeDto);
  }
  async function writeGlobalEnvelopes(db, globals) {
      for (const [position, item] of globals.entries()) {
        const previous = await db.envelope.findUnique({where: {id: item.id}});
        if (previous && previous.monthId !== null) throw new Error("Envelope belongs to a month.");
        await db.envelope.upsert({where: {id: item.id},
          create: {id: item.id, name: item.name.trim(), budget: item.budget, monthId: null, position},
          update: {name: item.name.trim(), budget: item.budget, position}});
      }
      await db.envelope.deleteMany({where: {monthId: null, id: {notIn: globals.map(item => item.id)}}});
      // A changed/deleted shared definition also invalidates open editors in other months.
      await db.month.updateMany({data: {revision: {increment: 1}}});
  }
  async function saveMonth(db, p) {
    const old = await getMonth(db, p.month);
    const envelopes = p.envelopes ?? old?.envelopes ?? [];
    const oldGlobals = await listGlobalEnvelopes(db);
    const globals = canonical("globalEnvelopes", p.globalEnvelopes ?? oldGlobals);
    validateEnvelopes(globals);
    validateEnvelopes(envelopes);
    if (new Set([...globals, ...envelopes].map(item => item.id)).size !== globals.length + envelopes.length) throw new Error("Duplicate envelope identity.");
    const envelopeIds = new Set([...globals, ...envelopes].map(item => item.id));
    if (p.entries.some(item => item.envelopeId && !envelopeIds.has(item.envelopeId))) throw new Error("Missing envelope for entry.");
    if (envelopes.some(item => item.isGlobal)) throw new Error("Global envelopes must be saved separately.");
    if (p.globalEnvelopes && (!p.expectedGlobalEnvelopes || !isDeepStrictEqual(oldGlobals, p.expectedGlobalEnvelopes))) {
      throw new Error("CONFLICT: Global envelopes changed. Reload before saving.");
    }
    canonical("monthlyData", {
      [p.month]: {
        month: p.month,
        lastUpdated: p.lastUpdated,
        rawInput: p.entries,
        envelopes,
      },
    });
    if (p.mode === "create" && old) throw new Error("Month already exists.");
    if (p.mode === "update" && !old) throw new Error("Month does not exist.");
    if (
      p.expectedRevision !== undefined &&
      (old?.revision ?? null) !== p.expectedRevision
    )
      throw new Error("CONFLICT: Month changed.");
    if (p.globalEnvelopes && !isDeepStrictEqual(oldGlobals, globals)) {
      await writeGlobalEnvelopes(db, globals);
    }
    for (const item of p.categories ?? [])
      await db.category.upsert({
        where: { id: item.value },
        create: {
          id: item.value,
          label: item.label,
          icon: item.icon,
          colorLight: item.colorLight,
          colorDark: item.colorDark,
          position:
            ((await db.category.aggregate({ _max: { position: true } }))._max
              .position ?? -1) + 1,
        },
        update: {},
      });
    await db.month.upsert({
      where: { id: p.month },
      create: {
        id: p.month,
        lastUpdated: p.lastUpdated === "-" ? null : p.lastUpdated,
      },
      update: {
        lastUpdated: p.lastUpdated === "-" ? null : p.lastUpdated,
        revision: { increment: 1 },
      },
    });
    // Envelope identities may never move between months.
    for (const [position, item] of envelopes.entries()) {
      const existing = await db.envelope.findUnique({ where: { id: item.id } });
      if (existing && existing.monthId !== p.month) throw new Error("Envelope belongs to another month.");
      await db.envelope.upsert({ where: { id: item.id },
        create: { id: item.id, budget: item.budget, name: item.name.trim(), monthId: p.month, position },
        update: { name: item.name.trim(), budget: item.budget, position } });
    }
    await db.entry.updateMany({ where: { monthId: p.month }, data: { envelopeId: null } });
    await db.envelope.deleteMany({ where: { monthId: p.month, id: { notIn: envelopes.map(item => item.id) } } });
    // Multi-row form/import transaction: detach old relationships and reserve unique names before final-state edits.
    await db.entry.updateMany({
      where: { monthId: p.month },
      data: { parentEntryId: null, categoryId: null },
    });
    const existing = await db.entry.findMany({
      where: { monthId: p.month },
      select: { id: true },
    });
    for (const row of existing)
      await db.entry.update({
        where: { monthId_id: { monthId: p.month, id: row.id } },
        data: { normalizedName: `__pending_${randomUUID()}` },
      });
    await db.entry.deleteMany({
      where: {
        monthId: p.month,
        id: { notIn: p.entries.map((item) => item.id) },
      },
    });
    for (const [position, item] of p.entries.entries())
      await db.entry.upsert({
        where: { monthId_id: { monthId: p.month, id: item.id } },
        create: { monthId: p.month, ...entryColumns(item), position },
        update: { ...entryColumns(item), position },
      });
    for (const item of p.entries)
      await db.entry.update({
        where: { monthId_id: { monthId: p.month, id: item.id } },
        data: await relation(db, item, p.month),
      });
    if (p.clearHistory)
      await db.entryHistory.deleteMany({ where: { monthId: p.month } });
    for (const [id, item] of Object.entries(p.history ?? {}))
      await appendHistory(db, p.month, id, item);
    return getMonth(db, p.month);
  }
  async function listCategories(db) {
    return (await db.category.findMany({ orderBy: { position: "asc" } })).map(
      categoryDto,
    );
  }
  async function listTemplates(db) {
    return (
      await db.fixedCostTemplate.findMany({
        orderBy: { position: "asc" },
        include: { parent: { select: { name: true } } },
      })
    ).map(entryDto);
  }
  async function listTracking(db) {
    return (
      await db.trackingTarget.findMany({ orderBy: { position: "asc" } })
    ).map((row) => ({
      name: row.categoryId ?? row.subjectLabel,
      targetSpending: row.targetAmount,
    }));
  }
  async function readPreferences(db) {
    const row = await db.appSettings.findUniqueOrThrow({ where: { id: 1 } });
    const result = {};
    for (const [key, column] of Object.entries(preferenceColumns))
      if (row[column] !== null) result[key] = row[column];
    if (row.firstTime !== null) result.firstTime = String(row.firstTime);
    if (row.themeMode !== null)
      result.themeSettings = {
        selectedTheme: row.themeMode,
        isDarkMode: row.isDarkMode ?? false,
        isManualThemeSet: row.manualThemeSet ?? false,
      };
    result.essentialCategories = (
      await db.category.findMany({
        where: { isEssential: true },
        orderBy: { position: "asc" },
      })
    ).map((row) => row.id);
    return result;
  }
  async function setPreference(db, key, value) {
    canonical(key, value);
    if (preferenceColumns[key])
      await db.appSettings.update({
        where: { id: 1 },
        data: { [preferenceColumns[key]]: value },
      });
    else if (key === "firstTime")
      await db.appSettings.update({
        where: { id: 1 },
        data: { firstTime: value == null ? null : value === "true" },
      });
    else if (key === "themeSettings")
      await db.appSettings.update({
        where: { id: 1 },
        data: {
          themeMode: value?.selectedTheme ?? null,
          isDarkMode: value?.isDarkMode ?? null,
          manualThemeSet: value?.isManualThemeSet ?? null,
        },
      });
    else if (key === "essentialCategories") {
      await db.category.updateMany({ data: { isEssential: false } });
      await db.category.updateMany({
        where: { id: { in: value ?? [] } },
        data: { isEssential: true },
      });
    } else throw new Error("Unsupported preference.");
  }
  async function snapshot(db = prisma) {
    await ready;
    const data = {
      ...(await readPreferences(db)),
      expenseCategories: await listCategories(db),
      fixCosts: await listTemplates(db),
      ...((await listGlobalEnvelopes(db)).length ? {globalEnvelopes: await listGlobalEnvelopes(db)} : {}),
    };
    const months = await db.month.findMany({ orderBy: { id: "asc" } });
    data.monthlyData = {};
    for (const month of months) {
      const saved = await getMonth(db, month.id);
      data.monthlyData[month.id] = {
        month: month.id,
        lastUpdated: saved.lastUpdated,
        rawInput: saved.entries,
        ...(saved.envelopes.length ? { envelopes: saved.envelopes } : {}),
      };
    }
    const metadata = await db.trackingSettings.findUniqueOrThrow({
      where: { id: 1 },
    });
    data.trackedCategories = {
      avgIncome: metadata.averageIncome,
      targetSurplus: metadata.targetSurplus,
      trackingCategories: await listTracking(db),
    };
    data.logs = {};
    for (const row of await db.entryHistory.findMany({
      orderBy: [{ monthId: "asc" }, { entryId: "asc" }, { position: "asc" }],
    })) {
      data.logs[row.monthId] ??= {};
      data.logs[row.monthId][row.entryId] ??= [];
      data.logs[row.monthId][row.entryId].push(historyDto(row));
    }
    return { ...(await status(db)), data };
  }
  async function status(db = prisma) {
    await ready;
    const row = await state(db);
    return {
      revision: row.revision,
      initialized: row.localStorageImportCompleted,
      recoveryRequired: row.sourceFormat === "recovery-required",
    };
  }
  async function clear(db) {
    await db.entry.updateMany({ data: { parentEntryId: null } });
    await db.fixedCostTemplate.updateMany({ data: { parentId: null } });
    await db.entryHistory.deleteMany();
    await db.entry.deleteMany();
    await db.envelope.deleteMany();
    await db.month.deleteMany();
    await db.fixedCostTemplate.deleteMany();
    await db.trackingTarget.deleteMany();
    await db.category.deleteMany();
    await db.appSettings.deleteMany();
    await db.appSettings.create({ data: { id: 1 } });
    await db.trackingSettings.update({
      where: { id: 1 },
      data: { averageIncome: 0, targetSurplus: 0 },
    });
  }
  async function checkTemplateBudgets(db, items) {
    if (items.some(item => item.envelopeId))
      validateTemplateBudgets(items, await listGlobalEnvelopes(db));
  }
  async function saveTemplates(db, items) {
    validateEntries(items);
    await checkTemplateBudgets(db, items);
    await db.fixedCostTemplate.updateMany({ data: { parentId: null } });
    for (const row of await db.fixedCostTemplate.findMany({
      select: { id: true },
    }))
      await db.fixedCostTemplate.update({
        where: { id: row.id },
        data: { normalizedName: `__pending_${randomUUID()}` },
      });
    await db.fixedCostTemplate.deleteMany({
      where: { id: { notIn: items.map((item) => item.id) } },
    });
    for (const [position, item] of items.entries())
      await db.fixedCostTemplate.upsert({
        where: { id: item.id },
        create: { ...entryColumns(item), position },
        update: { ...entryColumns(item), position },
      });
    for (const item of items)
      await db.fixedCostTemplate.update({
        where: { id: item.id },
        data: await relation(db, item, null, true),
      });
  }
  async function importData(db, input) {
    const data = sourceData(input);
    await clear(db);
    for (const [position, item] of (
      data.expenseCategories ?? defaults
    ).entries())
      await db.category.create({
        data: {
          id: item.value,
          label: item.label,
          icon: item.icon,
          colorLight: item.colorLight,
          colorDark: item.colorDark,
          position,
        },
      });
    for (const [position, item] of (data.globalEnvelopes ?? []).entries()) {
      await db.envelope.create({data: {id: item.id, name: item.name.trim(), budget: item.budget, monthId: null, position}});
    }
    for (const [month, item] of Object.entries(data.monthlyData ?? {}))
      await saveMonth(db, {
        month,
        entries: item.rawInput,
        envelopes: item.envelopes ?? [],
        lastUpdated: item.lastUpdated,
      });
    await saveTemplates(db, data.fixCosts ?? []);
    if (data.trackedCategories) {
      await db.trackingSettings.update({
        where: { id: 1 },
        data: {
          targetSurplus: data.trackedCategories.targetSurplus,
          averageIncome: data.trackedCategories.avgIncome ?? 0,
        },
      });
      for (const [
        position,
        item,
      ] of data.trackedCategories.trackingCategories.entries())
        await createTarget(db, item, position);
    }
    for (const [month, items] of Object.entries(data.logs ?? {}))
      for (const [id, history] of Object.entries(items))
        for (const [position, item] of history.entries())
          await db.entryHistory.create({
            data: {
              id: randomUUID(),
              monthId: month,
              entryId: id,
              position,
              timestampText: item.timestamp,
              valueText: typeof item.value === "string" ? item.value : null,
              valueNumber: typeof item.value === "number" ? item.value : null,
            },
          });
    for (const key of [
      ...Object.keys(preferenceColumns),
      "firstTime",
      "themeSettings",
      "essentialCategories",
    ])
      if (Object.hasOwn(data, key)) await setPreference(db, key, data[key]);
    await db.importState.update({
      where: { id: 1 },
      data: { localStorageImportCompleted: true, sourceFormat: "json" },
    });
  }
  async function createTarget(db, item, position) {
    const category = await db.category.findUnique({ where: { id: item.name } });
    return db.trackingTarget.create({
      data: {
        id: randomUUID(),
        categoryId: category ? item.name : null,
        subjectLabel: category ? null : item.name,
        targetAmount: item.targetSpending,
        position,
      },
    });
  }
  async function deleteCategory(db, id) {
    const removed = await db.category.deleteMany({ where: { id } });
    return { value: null, changed: !!removed.count };
  }
  async function listResult(list) {
    await ready;
    return { revision: (await state()).revision, items: await list(prisma) };
  }
  const categories = {
    list: () => listResult(listCategories),
    get: async (p) => {
      await ready;
      return categoryDtoOrNull(
        await prisma.category.findUnique({ where: { id: p.id } }),
      );
    },
    create: (p) =>
      command(p, async (db) => {
        canonical("expenseCategories", [p.item]);
        const item = p.item;
        const row = await db.category.create({
          data: {
            id: item.value,
            label: item.label,
            icon: item.icon,
            colorLight: item.colorLight,
            colorDark: item.colorDark,
            position:
              ((await db.category.aggregate({ _max: { position: true } }))._max
                .position ?? -1) + 1,
          },
        });
        return { value: categoryDto(row) };
      }),
    update: (p) =>
      command(p, async (db) => {
        const previous = await db.category.findUniqueOrThrow({
          where: { id: p.id },
        });
        const item = { ...categoryDto(previous), ...(p.changes ?? p.item) };
        if (item.value !== p.id)
          throw new Error("Category identity cannot change.");
        canonical("expenseCategories", [item]);
        const row = await db.category.update({
          where: { id: p.id },
          data: {
            label: item.label,
            icon: item.icon ?? null,
            colorLight: item.colorLight ?? null,
            colorDark: item.colorDark ?? null,
          },
        });
        return { value: categoryDto(row) };
      }),
    delete: (p) => command(p, (db) => deleteCategory(db, p.id)),
    reorder: (p) =>
      command(p, async (db) => {
        await validateOrder(
          p.ids,
          (await db.category.findMany({ select: { id: true } })).map(
            (row) => row.id,
          ),
        );
        for (const [position, id] of p.ids.entries())
          await db.category.update({ where: { id }, data: { position } });
        return { value: null };
      }),
    replace: (p) =>
      command(p, async (db) => {
        canonical("expenseCategories", p.items);
        await checkBase(db, p, listCategories);
        await db.category.deleteMany({
          where: { id: { notIn: p.items.map((item) => item.value) } },
        });
        for (const [position, item] of p.items.entries())
          await db.category.upsert({
            where: { id: item.value },
            create: {
              id: item.value,
              label: item.label,
              icon: item.icon,
              colorLight: item.colorLight,
              colorDark: item.colorDark,
              position,
            },
            update: {
              label: item.label,
              icon: item.icon ?? null,
              colorLight: item.colorLight ?? null,
              colorDark: item.colorDark ?? null,
              position,
            },
          });
        return { value: await listCategories(db) };
      }),
  };
  const fixedCosts = {
    list: () => listResult(listTemplates),
    get: async (p) => {
      await ready;
      return entryDto(
        await prisma.fixedCostTemplate.findUnique({
          where: { id: p.id },
          include: { parent: { select: { name: true } } },
        }),
      );
    },
    create: (p) =>
      command(p, async (db) => {
        validateEntries([p.item]);
        await checkTemplateBudgets(db, [p.item]);
        const relations = await relation(db, p.item, null, true);
        await checkCycle(db, null, p.item.id, relations.parentId, true);
        const row = await db.fixedCostTemplate.create({
          data: {
            ...entryColumns(p.item),
            ...relations,
            position:
              ((
                await db.fixedCostTemplate.aggregate({
                  _max: { position: true },
                })
              )._max.position ?? -1) + 1,
          },
          include: { parent: { select: { name: true } } },
        });
        return { value: entryDto(row) };
      }),
    update: (p) =>
      command(p, async (db) => {
        const old = await db.fixedCostTemplate.findUniqueOrThrow({
          where: { id: p.id },
          include: { parent: { select: { name: true } } },
        });
        const item = { ...entryDto(old), ...(p.changes ?? p.item) };
        if (item.id !== p.id)
          throw new Error("Template identity cannot change.");
        validateEntries([item]);
        await checkTemplateBudgets(db, [item]);
        const relations = await relation(db, item, null, true);
        await checkCycle(db, null, item.id, relations.parentId, true);
        const row = await db.fixedCostTemplate.update({
          where: { id: p.id },
          data: { ...entryColumns(item), ...relations },
          include: { parent: { select: { name: true } } },
        });
        return { value: entryDto(row) };
      }),
    delete: (p) =>
      command(p, async (db) => {
        const row = await db.fixedCostTemplate.findUnique({
          where: { id: p.id },
        });
        if (!row) return { value: null, changed: false };
        await db.fixedCostTemplate.updateMany({
          where: { parentId: p.id },
          data: { parentId: row.parentId, categoryId: row.categoryId },
        });
        await db.fixedCostTemplate.delete({ where: { id: p.id } });
        return { value: null };
      }),
    reorder: (p) =>
      command(p, async (db) => {
        validateOrder(
          p.ids,
          (await db.fixedCostTemplate.findMany({ select: { id: true } })).map(
            (row) => row.id,
          ),
        );
        for (const [position, id] of p.ids.entries())
          await db.fixedCostTemplate.update({
            where: { id },
            data: { position },
          });
        return { value: null };
      }),
    replace: (p) =>
      command(p, async (db) => {
        await checkBase(db, p, listTemplates);
        await saveTemplates(db, p.items);
        return { value: await listTemplates(db) };
      }),
  };
  const tracking = {
    list: () => listResult(listTracking),
    get: async (p) => {
      await ready;
      const row = await prisma.trackingTarget.findFirst({
        where: { OR: [{ categoryId: p.id }, { subjectLabel: p.id }] },
      });
      return row
        ? {
            name: row.categoryId ?? row.subjectLabel,
            targetSpending: row.targetAmount,
          }
        : null;
    },
    create: (p) =>
      command(p, async (db) => {
        canonical("trackedCategories", {
          targetSurplus: 0,
          trackingCategories: [p.item],
        });
        await createTarget(db, p.item, await db.trackingTarget.count());
        return { value: p.item };
      }),
    update: (p) =>
      command(p, async (db) => {
        const old = await db.trackingTarget.findFirstOrThrow({
          where: { OR: [{ categoryId: p.id }, { subjectLabel: p.id }] },
        });
        const item = {
          name: p.id,
          targetSpending: old.targetAmount,
          ...(p.changes ?? p.item),
        };
        if (item.name !== p.id)
          throw new Error("Tracker identity cannot change.");
        canonical("trackedCategories", {
          targetSurplus: 0,
          trackingCategories: [item],
        });
        await db.trackingTarget.update({
          where: { id: old.id },
          data: { targetAmount: item.targetSpending },
        });
        return { value: item };
      }),
    delete: (p) =>
      command(p, async (db) => {
        const result = await db.trackingTarget.deleteMany({
          where: { OR: [{ categoryId: p.id }, { subjectLabel: p.id }] },
        });
        return { value: null, changed: !!result.count };
      }),
    reorder: (p) =>
      command(p, async (db) => {
        validateOrder(
          p.ids,
          (await listTracking(db)).map((row) => row.name),
        );
        for (const [position, id] of p.ids.entries())
          await db.trackingTarget.updateMany({
            where: { OR: [{ categoryId: id }, { subjectLabel: id }] },
            data: { position },
          });
        return { value: null };
      }),
    replace: (p) =>
      command(p, async (db) => {
        const oldMetadata = await db.trackingSettings.findUniqueOrThrow({
          where: { id: 1 },
        });
        const metadata = p.metadata ?? {
          targetSurplus: oldMetadata.targetSurplus,
          avgIncome: oldMetadata.averageIncome,
        };
        canonical("trackedCategories", {
          ...metadata,
          trackingCategories: p.items,
        });
        await checkBase(db, p, listTracking);
        await db.trackingTarget.deleteMany();
        for (const [position, item] of p.items.entries())
          await createTarget(db, item, position);
        await db.trackingSettings.update({
          where: { id: 1 },
          data: {
            targetSurplus: metadata.targetSurplus,
            averageIncome: metadata.avgIncome,
          },
        });
        return { value: await listTracking(db) };
      }),
  };
  function validateOrder(ids, current) {
    if (
      !Array.isArray(ids) ||
      ids.length !== current.length ||
      new Set(ids).size !== current.length ||
      ids.some((id) => !current.includes(id))
    )
      throw new Error("Invalid record order.");
  }
  async function checkBase(db, p, list) {
    if (p.base && !isDeepStrictEqual(await list(db), p.base))
      throw new Error("CONFLICT: Configuration changed.");
  }
  function categoryDtoOrNull(row) {
    return row ? categoryDto(row) : null;
  }
  const entries={
    list:async p=>{await ready;return {revision:(await state()).revision,entries:(await getMonth(prisma,p.month))?.entries??[]};},
    get:async p=>{await ready;return entryDto(await prisma.entry.findUnique({where:{monthId_id:{monthId:p.month,id:p.id}},include:{parent:{select:{name:true}}}}));},
    create:p=>changeEntry('create',p),
    update:p=>changeEntry('update',p),
    delete:p=>changeEntry('delete',p),
    reorder:p=>changeEntry('reorder',p),
  };
  async function changeEntry(action,p){
    const where={monthId_id:{monthId:p.month,id:p.id}};
    return command(p, async (db) => {
      if (!(await db.month.findUnique({ where: { id: p.month } })))
        throw new Error("Month does not exist.");
      const previous = p.id
        ? await db.entry.findUnique({
            where,
            include: { parent: { select: { name: true } } },
          })
        : null;
      if (p.expected && !isDeepStrictEqual(entryDto(previous), p.expected))
        throw new Error("CONFLICT: Entry changed.");
      if (action === "reorder") {
        const rows = await db.entry.findMany({
          where: { monthId: p.month },
          select: { id: true },
        });
        if (
          !Array.isArray(p.ids) ||
          p.ids.length !== rows.length ||
          new Set(p.ids).size !== rows.length ||
          p.ids.some((id) => !rows.some((row) => row.id === id))
        )
          throw new Error("Invalid entry order.");
        for (const [position, id] of p.ids.entries())
          await db.entry.update({
            where: { monthId_id: { monthId: p.month, id } },
            data: { position },
          });
        return { value: null };
      }
      if (action === "delete") {
        if (!previous) return { value: null, changed: false };
        await db.entry.updateMany({
          where: { monthId: p.month, parentEntryId: p.id },
          data: {
            parentEntryId: previous.parentEntryId,
            categoryId: previous.categoryId,
          },
        });
        await db.entry.delete({ where });
        await db.month.update({
          where: { id: p.month },
          data: {
            lastUpdated: new Date().toISOString(),
            revision: { increment: 1 },
          },
        });
        return { value: null };
      }
      if (!["create", "update"].includes(action))
        throw new Error("Unsupported entry operation.");
      if (action === "update" && p.changes)
        p.entry = { ...entryDto(previous), ...p.changes, id: p.id };
      validateEntries([p.entry]);
      if (action === "update" && (!previous || p.entry.id !== p.id))
        throw new Error("Entry does not exist.");
      if (p.entry.envelopeId) {
        const envelope = await db.envelope.findUnique({ where: { id: p.entry.envelopeId } });
        if (!envelope || (envelope.monthId !== null && envelope.monthId !== p.month)) throw new Error("Missing envelope for this month.");
      }
      const relations = await relation(db, p.entry, p.month);
      await checkCycle(db, p.month, p.entry.id, relations.parentEntryId);
      const data = { ...entryColumns(p.entry), ...relations };
      const changed = !isDeepStrictEqual(entryDto(previous), p.entry);
      if (action === "create")
        await db.entry.create({
          data: {
            monthId: p.month,
            ...data,
            position:
              ((
                await db.entry.aggregate({
                  where: { monthId: p.month },
                  _max: { position: true },
                })
              )._max.position ?? -1) + 1,
          },
        });
      else if (changed) {
        const update = { revision: { increment: 1 } };
        const fields = p.changes
          ? Object.keys(p.changes)
          : [
              "target",
              "type",
              "value",
              "isFixCost",
              "demo",
              "lastEditedAt",
              "source",
              "envelopeId",
            ];
        const columns = {
          envelopeId: ["envelopeId"],
          target: ["name", "normalizedName"],
          type: ["type"],
          value: ["amount"],
          isFixCost: ["isFixedCost"],
          demo: ["demo"],
          lastEditedAt: ["lastEditedAt"],
        };
        for (const field of fields)
          for (const column of columns[field] ?? [])
            update[column] = data[column];
        if (fields.includes("source") || fields.includes("type"))
          Object.assign(update, relations);
        await db.entry.update({ where, data: update });
      }
      for (const [id, item] of Object.entries(p.history ?? {}))
        await appendHistory(db, p.month, id, item);
      if (changed)
        await db.month.update({
          where: { id: p.month },
          data: {
            lastUpdated: new Date().toISOString(),
            revision: { increment: 1 },
          },
        });
      return {
        value: entryDto(
          await db.entry.findUnique({
            where: { monthId_id: { monthId: p.month, id: p.entry.id } },
            include: { parent: { select: { name: true } } },
          }),
        ),
        changed,
      };
    });
  }
  const crud = {
    status: () => status(),
    envelopes: {
      listGlobal: async () => { await ready; return listGlobalEnvelopes(prisma); },
      replaceGlobal: p => command(p, async db => {
        const globals = canonical('globalEnvelopes', p.items);
        validateEnvelopes(globals);
        const old = await listGlobalEnvelopes(db);
        if (!isDeepStrictEqual(old, p.base)) throw new Error('CONFLICT: Global envelopes changed. Reload before saving.');
        const changed = !isDeepStrictEqual(old, globals);
        if (changed) await writeGlobalEnvelopes(db, globals);
        return {value: await listGlobalEnvelopes(db), changed};
      }),
    },
    months: {
      list: async () => {
        await ready;
        return (
          await prisma.month.findMany({
            select: { id: true },
            orderBy: { id: "asc" },
          })
        ).map((row) => row.id);
      },
      get: async (month) => {
        await ready;
        return getMonth(prisma, month);
      },
      range: async ({ from = "0000-01", to = "9999-12" } = {}) => {
        await ready;
        if (
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(from) ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(to) ||
          from > to
        )
          throw new Error("Invalid range.");
        return prisma.$transaction(async (db) =>
          outcome(db, await readMonths(db, { gte: from, lte: to })),
        );
      },
      save: (p) =>
        command(p, async (db) => ({ value: await saveMonth(db, p) })),
      delete: (p) =>
        command(p, async (db) => {
          await db.entry.updateMany({
            where: { monthId: p.month },
            data: { parentEntryId: null },
          });
          const result = await db.month.deleteMany({ where: { id: p.month } });
          return { value: !!result.count, changed: !!result.count };
        }),
    },
    entries,
    categories,
    fixedCosts,
    tracking,
    settings: {
      list: async () => {
        await ready;
        return outcome(prisma, await readPreferences(prisma));
      },
      set: (p) =>
        command(p, async (db) => {
          await setPreference(db, p.key, p.value);
          return { value: p.value };
        }),
    },
    trackingMetadata: async () => {
      await ready;
      const row = await prisma.trackingSettings.findUniqueOrThrow({
        where: { id: 1 },
      });
      return { targetSurplus: row.targetSurplus, avgIncome: row.averageIncome };
    },
    deleteCategory: (p) => command(p, (db) => deleteCategory(db, p.id)),
    history: {
      list: async (p) => {
        await ready;
        return outcome(
          prisma,
          (
            await prisma.entryHistory.findMany({
              where: { monthId: p.month, entryId: p.id },
              orderBy: { position: "asc" },
            })
          ).map(historyDto),
        );
      },
      append: (p) =>
        command(p, async (db) => {
          await appendHistory(db, p.month, p.id, p.item);
          return { value: null };
        }),
      cleanup: (p) =>
        command(p, async (db) => {
          const old = await db.month.findMany({
            where: { lastUpdated: { not: null } },
          });
          const ids = old
            .filter(
              (row) =>
                (p.now ?? Date.now()) - Date.parse(row.lastUpdated) >
                30 * 86400000,
            )
            .map((row) => row.id);
          const result = await db.entryHistory.deleteMany({
            where: { monthId: { in: ids } },
          });
          return { value: null, changed: !!result.count };
        }),
    },
  };
  return {
    crud,
    prisma,
    ready,
    snapshot,
    async initialize(legacy) {
      await ready;
      const current = await state();
      if (
        current.localStorageImportCompleted ||
        current.sourceFormat === "recovery-required"
      )
        return snapshot();
      const parsed = legacyData(legacy);
      await command({}, async (db) => {
        await importData(db, parsed);
        return { value: null };
      });
      marker();
      return snapshot();
    },
    async exportBackup() {
      const data = (await snapshot()).data;
      delete data.appVersion;
      delete data.firstTime;
      return JSON.stringify(
        { app: "easy-sankey", version: 2, type: "full", data },
        null,
        2,
      );
    },
    async restore(text, revision) {
      const payload = JSON.parse(text);
      if (
        payload.app !== "easy-sankey" ||
        ![1, 2].includes(payload.version) ||
        payload.type !== "full"
      )
        throw new Error("Invalid backup.");
      const parsed = sourceData(payload.data);
      await command({ revision }, async (db) => {
        await importData(db, {
          ...parsed,
          appVersion: require("../package.json").version,
          firstTime: "false",
        });
        return { value: null };
      });
      marker();
      return snapshot();
    },
    async reset(revision) {
      await command({ revision }, async (db) => {
        await clear(db);
        await db.importState.update({
          where: { id: 1 },
          data: { localStorageImportCompleted: true, sourceFormat: "reset" },
        });
        return { value: null };
      });
      marker();
      return snapshot();
    },
    async close() {
      await ready;
      await prisma.$disconnect();
    },
  };
}
module.exports = { openDatabase };
