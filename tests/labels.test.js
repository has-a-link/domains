import test from "ava";

import { ensureLabels, formatLabelActions, syncLabels } from "../utils/lib/github/labels.js";

const labelsConfig = {
  domain: {
    name: "domain",
    color: "1d76db",
    description: "Domain registration"
  },
  bug: {
    name: "bug",
    color: "d73a4a",
    description: "Bug report"
  }
};

function createClient(existing = []) {
  const calls = [];

  return {
    calls,
    listRepositoryLabels: async () => existing,
    createLabel: async (label) => {
      calls.push({ action: "create", label });
      return { ...label };
    },
    updateLabel: async (name, label) => {
      calls.push({ action: "update", name, label });
      return { name, ...label };
    }
  };
}

test("syncLabels creates missing labels", async (t) => {
  const client = createClient([]);
  const actions = await syncLabels({ client, labelsConfig });

  t.deepEqual(
    actions.map((entry) => entry.action),
    ["create", "create"]
  );
  t.deepEqual(
    client.calls.map((entry) => entry.action),
    ["create", "create"]
  );
});

test("syncLabels updates changed labels", async (t) => {
  const client = createClient([
    { name: "domain", color: "000000", description: "Old" },
    { name: "bug", color: "d73a4a", description: "Bug report" }
  ]);
  const actions = await syncLabels({ client, labelsConfig });

  t.deepEqual(
    actions.map((entry) => entry.action),
    ["update", "unchanged"]
  );
  t.deepEqual(
    client.calls.map((entry) => entry.action),
    ["update"]
  );
});

test("syncLabels dry-run performs no writes", async (t) => {
  const client = createClient([]);
  const actions = await syncLabels({ client, labelsConfig, dryRun: true });

  t.deepEqual(
    actions.map((entry) => entry.action),
    ["create", "create"]
  );
  t.deepEqual(client.calls, []);
});

test("syncLabels supports a subset of labels", async (t) => {
  const client = createClient([]);
  const actions = await syncLabels({
    client,
    labelsConfig,
    only: ["domain"]
  });

  t.is(actions.length, 1);
  t.is(actions[0].label.name, "domain");
});

test("ensureLabels rejects unknown label names", async (t) => {
  const client = createClient([]);

  t.throws(() => ensureLabels({ client, labelsConfig, names: ["missing"] }), {
    message: /Unknown label/
  });
});

test("ensureLabels only ensures requested labels", async (t) => {
  const client = createClient([]);
  const actions = await ensureLabels({
    client,
    labelsConfig,
    names: ["bug"]
  });

  t.is(actions.length, 1);
  t.is(actions[0].label.name, "bug");
});

test("formatLabelActions describes dry-run and applied actions", (t) => {
  const actions = [
    { action: "create", label: labelsConfig.domain },
    { action: "update", label: labelsConfig.bug },
    { action: "unchanged", label: labelsConfig.domain }
  ];

  t.is(
    formatLabelActions(actions, { dryRun: true }),
    ["Would create domain (1d76db)", "Would update bug (d73a4a)", "Unchanged domain (1d76db)"].join(
      "\n"
    )
  );
  t.is(
    formatLabelActions(actions),
    ["Created domain (1d76db)", "Updated bug (d73a4a)", "Unchanged domain (1d76db)"].join("\n")
  );
});
