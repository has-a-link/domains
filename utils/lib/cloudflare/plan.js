import { normaliseContent } from "./desired.js";

export class CloudflarePlanError extends Error {
  constructor(message, { code, details } = {}) {
    super(message);
    this.name = "CloudflarePlanError";
    this.code = code;
    this.details = details;
  }
}

export function relativeName(name, zone) {
  const lowerName = String(name).toLowerCase();
  const lowerZone = zone.toLowerCase();

  if (lowerName === lowerZone) {
    return "@";
  }

  if (lowerName.endsWith(`.${lowerZone}`)) {
    return lowerName.slice(0, -(lowerZone.length + 1));
  }

  return lowerName;
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i");
}

export function isProtectedRecord(record, config) {
  const name = relativeName(record.name, config.cloudflare.zone);
  const type = String(record.type).toUpperCase();
  const protectedNames = new Set(
    [...config.protectedDnsRecords.names, ...config.internalSubdomains.exact].map((entry) =>
      entry.toLowerCase()
    )
  );

  if (protectedNames.has(name)) {
    return true;
  }

  if (
    (config.internalSubdomains.suffixes ?? []).some(
      (suffix) => name === suffix.slice(1) || name.endsWith(suffix)
    )
  ) {
    return true;
  }

  if (config.protectedDnsRecords.types.map((entry) => entry.toUpperCase()).includes(type)) {
    return true;
  }

  return config.protectedDnsRecords.namePatterns.some((pattern) =>
    globToRegExp(pattern).test(name)
  );
}

export function normaliseRecord(record) {
  const type = String(record.type).toUpperCase();

  return {
    ...record,
    type,
    name: String(record.name).toLowerCase(),
    content: normaliseContent(type, String(record.content)),
    proxied: record.proxied === true,
    ttl: Number(record.ttl ?? 1),
    priority: record.priority === undefined ? undefined : Number(record.priority),
    comment: record.comment ?? ""
  };
}

function sameIdentity(left, right) {
  return (
    left.type === right.type &&
    left.name === right.name &&
    left.content === right.content &&
    left.priority === right.priority
  );
}

function sameNameAndType(left, right) {
  return left.type === right.type && left.name === right.name;
}

function sameMetadata(left, right) {
  return left.ttl === right.ttl && left.proxied === right.proxied && left.comment === right.comment;
}

function isManaged(record, config) {
  return record.comment === config.cloudflare.comment;
}

function recordLabel(record) {
  return `${record.type} ${record.name} -> ${record.content}${
    record.priority === undefined ? "" : ` priority ${record.priority}`
  }`;
}

export function planDnsChanges({ desired, current, config }) {
  const desiredRecords = desired.map(normaliseRecord);
  const currentRecords = current.map(normaliseRecord);
  const protectedDesired = desiredRecords.filter((record) => isProtectedRecord(record, config));

  if (protectedDesired.length > 0) {
    throw new CloudflarePlanError("A desired record uses a protected name or type.", {
      code: "protected_desired",
      details: protectedDesired
    });
  }

  const used = new Set();
  const creates = [];
  const updates = [];
  const deletes = [];
  const noops = [];
  const conflicts = [];

  for (const desiredRecord of desiredRecords) {
    const exact = currentRecords.find(
      (record) => !used.has(record.id) && sameIdentity(record, desiredRecord)
    );

    if (exact) {
      used.add(exact.id);

      if (sameMetadata(exact, desiredRecord)) {
        noops.push({ current: exact, desired: desiredRecord });
      } else {
        updates.push({ current: exact, desired: desiredRecord });
      }

      continue;
    }

    const managed = currentRecords.find(
      (record) =>
        !used.has(record.id) && sameNameAndType(record, desiredRecord) && isManaged(record, config)
    );

    if (managed) {
      used.add(managed.id);
      updates.push({ current: managed, desired: desiredRecord });
      continue;
    }

    const unmanaged = currentRecords.find(
      (record) =>
        !used.has(record.id) && sameNameAndType(record, desiredRecord) && !isManaged(record, config)
    );

    if (unmanaged) {
      conflicts.push({ current: unmanaged, desired: desiredRecord });
      continue;
    }

    const crossType = currentRecords.find(
      (record) =>
        !used.has(record.id) &&
        record.name === desiredRecord.name &&
        record.type !== desiredRecord.type &&
        !isManaged(record, config) &&
        (record.type === "CNAME" || desiredRecord.type === "CNAME")
    );

    if (crossType) {
      conflicts.push({ current: crossType, desired: desiredRecord });
      continue;
    }

    creates.push(desiredRecord);
  }

  for (const record of currentRecords) {
    if (used.has(record.id) || isProtectedRecord(record, config)) {
      continue;
    }

    if (isManaged(record, config)) {
      deletes.push(record);
    }
  }

  return {
    desired: desiredRecords,
    current: currentRecords,
    creates,
    updates,
    deletes,
    noops,
    conflicts
  };
}

export function validatePlanSafety({
  plan,
  current,
  desired,
  config,
  allowEmptyZone = false,
  allowMassDelete = false
}) {
  if (plan.conflicts.length > 0) {
    throw new CloudflarePlanError(
      `Found ${plan.conflicts.length} conflicting DNS record(s) that are not managed by has-a.link.`,
      {
        code: "conflicts",
        details: plan.conflicts
      }
    );
  }

  if (current.length === 0 && desired.length > 0 && !allowEmptyZone) {
    throw new CloudflarePlanError(
      "Cloudflare returned an empty zone. Verify the zone ID and token before applying.",
      {
        code: "empty_zone"
      }
    );
  }

  if (plan.deletes.length > config.cloudflare.maxDeletionsPerRun && !allowMassDelete) {
    throw new CloudflarePlanError(
      `The plan would delete ${plan.deletes.length} records, which exceeds the limit of ${config.cloudflare.maxDeletionsPerRun}.`,
      {
        code: "mass_deletion",
        details: plan.deletes
      }
    );
  }

  return plan;
}

export function toCreatePayload(record) {
  const payload = {
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
    comment: record.comment
  };

  if (record.priority !== undefined) {
    payload.priority = record.priority;
  }

  return payload;
}

export function toUpdatePayload(record) {
  const payload = {
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
    comment: record.comment
  };

  if (record.priority !== undefined) {
    payload.priority = record.priority;
  }

  return payload;
}

export function summarizePlan(plan) {
  return {
    creates: plan.creates.length,
    updates: plan.updates.length,
    deletes: plan.deletes.length,
    noops: plan.noops.length,
    conflicts: plan.conflicts.length
  };
}

export function formatPlan(plan) {
  const summary = summarizePlan(plan);
  const lines = [
    `Creates: ${summary.creates}`,
    `Updates: ${summary.updates}`,
    `Deletes: ${summary.deletes}`,
    `No changes: ${summary.noops}`,
    `Conflicts: ${summary.conflicts}`
  ];

  for (const record of plan.creates) {
    lines.push(`+ ${recordLabel(record)}`);
  }

  for (const change of plan.updates) {
    const metadata = [];

    if (change.current.content !== change.desired.content) {
      metadata.push(`${change.current.content} -> ${change.desired.content}`);
    }

    if (change.current.proxied !== change.desired.proxied) {
      metadata.push(`proxied ${change.current.proxied} -> ${change.desired.proxied}`);
    }

    if (change.current.ttl !== change.desired.ttl) {
      metadata.push(`ttl ${change.current.ttl} -> ${change.desired.ttl}`);
    }

    if (change.current.comment !== change.desired.comment) {
      metadata.push("update comment");
    }

    if (change.current.priority !== change.desired.priority) {
      metadata.push(`priority ${change.current.priority ?? "none"} -> ${change.desired.priority}`);
    }

    lines.push(`~ ${recordLabel(change.desired)} (${metadata.join(", ") || "metadata"})`);
  }

  for (const record of plan.deletes) {
    lines.push(`- ${recordLabel(record)}`);
  }

  for (const conflict of plan.conflicts) {
    lines.push(
      `! ${recordLabel(conflict.current)} conflicts with ${recordLabel(conflict.desired)}`
    );
  }

  return lines.join("\n");
}
