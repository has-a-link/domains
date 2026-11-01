import { CloudflarePlanError, planDnsChanges, toCreatePayload, toUpdatePayload } from "./plan.js";

export async function applyPlan({ client, plan, dryRun = false }) {
  if (dryRun) {
    return {
      dryRun: true,
      created: [],
      updated: [],
      deleted: []
    };
  }

  const created = [];
  const updated = [];
  const deleted = [];

  for (const record of plan.deletes) {
    deleted.push(await client.deleteDnsRecord(record.id));
  }

  for (const record of plan.creates) {
    created.push(await client.createDnsRecord(toCreatePayload(record)));
  }

  for (const change of plan.updates) {
    updated.push(await client.updateDnsRecord(change.current.id, toUpdatePayload(change.desired)));
  }

  return {
    dryRun: false,
    created,
    updated,
    deleted
  };
}

export async function verifyDesiredState({ client, desired, config }) {
  const current = await client.listDnsRecords();
  const plan = planDnsChanges({ desired, current, config });

  if (
    plan.conflicts.length > 0 ||
    plan.creates.length > 0 ||
    plan.updates.length > 0 ||
    plan.deletes.length > 0
  ) {
    throw new CloudflarePlanError("Post-apply verification failed.", {
      code: "verification_failed",
      details: plan
    });
  }

  return {
    current,
    plan
  };
}
