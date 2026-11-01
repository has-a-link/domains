function normaliseLabel(label) {
  return {
    name: label.name,
    color: label.color.toUpperCase(),
    description: label.description ?? ""
  };
}

export async function syncLabels({ client, labelsConfig, dryRun = false, only = null } = {}) {
  const entries = Object.values(labelsConfig).filter(
    (label) => only === null || only.includes(label.name)
  );
  const existingLabels = await client.listRepositoryLabels();
  const existingByName = new Map(existingLabels.map((label) => [label.name, label]));
  const actions = [];

  for (const label of entries) {
    const existing = existingByName.get(label.name);

    if (!existing) {
      actions.push({ action: "create", label });

      if (!dryRun) {
        await client.createLabel(label);
      }

      continue;
    }

    const current = normaliseLabel(existing);
    const desired = normaliseLabel(label);

    if (current.color !== desired.color || current.description !== desired.description) {
      actions.push({ action: "update", label });

      if (!dryRun) {
        await client.updateLabel(label.name, label);
      }

      continue;
    }

    actions.push({ action: "unchanged", label });
  }

  return actions;
}

export function ensureLabels({ client, labelsConfig, names, dryRun = false }) {
  const unknown = names.filter(
    (name) => !Object.values(labelsConfig).some((label) => label.name === name)
  );

  if (unknown.length > 0) {
    throw new Error(`Unknown label(s): ${unknown.join(", ")}`);
  }

  return syncLabels({ client, labelsConfig, dryRun, only: names });
}

export function formatLabelActions(actions, { dryRun = false } = {}) {
  return actions
    .map(({ action, label }) => {
      const prefix =
        action === "create"
          ? dryRun
            ? "Would create"
            : "Created"
          : action === "update"
            ? dryRun
              ? "Would update"
              : "Updated"
            : "Unchanged";

      return `${prefix} ${label.name} (${label.color})`;
    })
    .join("\n");
}
