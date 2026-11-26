import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, pushes, resetDatabase, signIn, type Session, uploadPng, givePlan } from "./test/harness.ts";

// Personal one-time invites next to the group's reusable code, and the owner choosing what sharing
// members show them.

let coach: Session;
let ana: Session;
let ben: Session;
let cleo: Session;
let groupId: string;

before(async () => {
  installFakes();
  await resetDatabase();
  coach = await signIn("coach3@example.com");
  ana = await signIn("ana3@example.com");
  ben = await signIn("ben3@example.com");
  cleo = await signIn("cleo3@example.com");
  await api("PATCH", "/me", { body: { name: "Ana" }, token: ana.accessToken });
  await givePlan(coach.userId, "pro10");
  const created = await api("POST", "/groups", { body: { name: "Strength Club", shares: ["summary", "weight"] }, token: coach.accessToken });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  groupId = created.body.group.id;
});
after(closeDatabase);

describe("personal invites", () => {
  let code: string;
  let token: string;
  let inviteId: string;

  it("lets only the owner create one, with its own code and link", async () => {
    const created = await api("POST", `/groups/${groupId}/invites`, { body: { note: "Ana" }, token: coach.accessToken });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    ({ code, id: inviteId, token } = created.body.invite);
    assert.match(code, /^STRE-[2-9A-Z]{4}$/u);
    assert.equal(created.body.invite.note, "Ana");
    assert.equal(created.body.invite.usedAt, null);
    const group = await api("GET", `/groups/${groupId}`, { token: coach.accessToken });
    assert.notEqual(code, group.body.group.joinCode);
    assert.notEqual(token, group.body.group.inviteToken);
    assert.equal((await api("POST", `/groups/${groupId}/invites`, { token: ana.accessToken })).status, 403);
  });

  it("previews as single-use and shows what members share", async () => {
    const preview = await api("GET", `/invites/${code.toLowerCase()}`);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.invite.singleUse, true);
    assert.equal(preview.body.invite.token, token);
    assert.deepEqual(preview.body.invite.shares, ["summary", "weight"]);
    const groupCode = (await api("GET", `/groups/${groupId}`, { token: coach.accessToken })).body.group.joinCode;
    assert.equal((await api("GET", `/invites/${groupCode}`)).body.invite.singleUse, false);
  });

  it("works for one join only, by code or link", async () => {
    assert.equal((await api("POST", `/invites/${code}/join`, { token: ana.accessToken })).status, 201);
    assert.equal((await api("POST", `/invites/${token}/join`, { token: ben.accessToken })).status, 404, "used up");
    assert.equal((await api("GET", `/invites/${code}`)).status, 404);
    const again = await api("POST", `/invites/${code}/join`, { token: ana.accessToken });
    assert.equal(again.status, 404, "even for the person who used it, it's gone");

    const list = await api("GET", `/groups/${groupId}/invites`, { token: coach.accessToken });
    const used = list.body.invites.find((invite: { id: string }) => invite.id === inviteId);
    assert.ok(used.usedAt);
    assert.equal(used.usedByName, "Ana");
  });

  it("doesn't use up an invite opened by someone already in the group", async () => {
    const created = await api("POST", `/groups/${groupId}/invites`, { token: coach.accessToken });
    const result = await api("POST", `/invites/${created.body.invite.code}/join`, { token: ana.accessToken });
    assert.equal(result.body.alreadyMember, true);
    assert.equal((await api("POST", `/invites/${created.body.invite.code}/join`, { token: ben.accessToken })).status, 201);
  });

  it("can be revoked before it's used", async () => {
    const created = await api("POST", `/groups/${groupId}/invites`, { token: coach.accessToken });
    const id = created.body.invite.id;
    assert.equal((await api("DELETE", `/groups/${groupId}/invites/${id}`, { token: ana.accessToken })).status, 403);
    assert.equal((await api("DELETE", `/groups/${groupId}/invites/${id}`, { token: coach.accessToken })).status, 204);
    assert.equal((await api("POST", `/invites/${created.body.invite.code}/join`, { token: cleo.accessToken })).status, 404);
    assert.equal((await api("DELETE", `/groups/${groupId}/invites/${id}`, { token: coach.accessToken })).status, 404);
  });

  it("can be removed once it's revoked, but not before", async () => {
    const created = await api("POST", `/groups/${groupId}/invites`, { token: coach.accessToken });
    const id = created.body.invite.id;
    const record = `/groups/${groupId}/invites/${id}/record`;
    assert.equal((await api("DELETE", record, { token: coach.accessToken })).status, 404, "still active");
    await api("DELETE", `/groups/${groupId}/invites/${id}`, { token: coach.accessToken });
    assert.equal((await api("DELETE", record, { token: ana.accessToken })).status, 403);
    assert.equal((await api("DELETE", record, { token: coach.accessToken })).status, 204);
    const list = await api("GET", `/groups/${groupId}/invites`, { token: coach.accessToken });
    assert.ok(!list.body.invites.some((invite: { id: string }) => invite.id === id));
  });

  it("keeps working when the group's own code is reset", async () => {
    const created = await api("POST", `/groups/${groupId}/invites`, { token: coach.accessToken });
    const before = (await api("GET", `/groups/${groupId}`, { token: coach.accessToken })).body.group.joinCode;
    await api("POST", `/groups/${groupId}/invite/rotate`, { token: coach.accessToken });
    assert.equal((await api("GET", `/invites/${before}`)).status, 404, "the old group code stops");
    assert.equal((await api("POST", `/invites/${created.body.invite.code}/join`, { token: cleo.accessToken })).status, 201);
  });
});

describe("what members share", () => {
  it("defaults to everything but weight and needs at least one", async () => {
    await givePlan(coach.userId, "pro10");
    const created = await api("POST", "/groups", { body: { name: "Defaults" }, token: coach.accessToken });
    assert.deepEqual(created.body.group.shares, ["summary", "meals", "photos", "activity"]);
    const none = await api("PATCH", `/groups/${created.body.group.id}`, { body: { shares: [] }, token: coach.accessToken });
    assert.equal(none.status, 400);
    const member = await api("GET", "/groups", { token: ana.accessToken });
    assert.deepEqual(member.body.groups[0].shares, ["summary", "weight"]);
  });

  it("shows the owner only what the group shares", async () => {
    await api("POST", "/meals/items", {
      body: { items: [{ amount: 100, name: "Oats", nutrimentsPer100g: { energyKcal100g: 380 }, unit: "g" }], label: "breakfast" },
      token: ana.accessToken,
    });
    await api("POST", "/me/weights", { body: { weightKg: 61.5 }, token: ana.accessToken });

    const day = await api("GET", `/groups/${groupId}/members/${ana.userId}/diary`, { token: coach.accessToken });
    assert.equal(day.status, 200, JSON.stringify(day.body));
    assert.equal(Math.round(day.body.totals.energyKcal), 380);
    assert.deepEqual(day.body.meals, [], "foods are not shared in this group");
    assert.equal(day.body.activity, null);
    assert.deepEqual(day.body.shares, ["summary", "weight"]);

    const weights = await api("GET", `/groups/${groupId}/members/${ana.userId}/weights`, { token: coach.accessToken });
    assert.equal(weights.status, 200);
    assert.equal(weights.body.currentKg, 61.5);

  });

  it("asks members before showing what the owner adds later", async () => {
    pushes.length = 0;
    await api("POST", "/me/devices", { body: { platform: "ios", token: "ExponentPushToken[ana]" }, token: ana.accessToken });
    await api("PATCH", `/groups/${groupId}`, { body: { shares: ["summary", "meals", "photos"] }, token: coach.accessToken });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(pushes.some((push) => push.to === "ExponentPushToken[ana]" && /meal items, meal photos/u.test(push.body)));

    const detail = await api("GET", `/groups/${groupId}`, { token: ana.accessToken });
    assert.deepEqual(detail.body.group.allowedShares, ["summary"], "weight left the list; summary stays agreed");
    assert.deepEqual(detail.body.group.pendingShares, ["meals", "photos"]);
    assert.deepEqual((await api("GET", "/groups", { token: ana.accessToken })).body.groups[0].pendingShares, ["meals", "photos"]);
    const owner = await api("GET", `/groups/${groupId}`, { token: coach.accessToken });
    const row = owner.body.group.members.find((member: { userId: string }) => member.userId === ana.userId);
    assert.deepEqual(row.shares, ["summary"]);
    assert.deepEqual(row.pendingShares, ["meals", "photos"]);

    const before = await api("GET", `/groups/${groupId}/members/${ana.userId}/diary`, { token: coach.accessToken });
    assert.deepEqual(before.body.meals, [], "not until she says yes");

    const answer = await api("PATCH", `/groups/${groupId}/membership`, { body: { allowedShares: ["summary", "meals"] }, token: ana.accessToken });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body.allowedShares, ["summary", "meals"]);
    const after = await api("GET", `/groups/${groupId}`, { token: ana.accessToken });
    assert.deepEqual(after.body.group.pendingShares, [], "photos counts as declined");

    const meals = await api("GET", `/groups/${groupId}/members/${ana.userId}/diary`, { token: coach.accessToken });
    assert.equal(meals.body.meals[0].items[0].name, "Oats");
    assert.deepEqual(meals.body.shares, ["summary", "meals"]);
    assert.equal((await api("GET", `/groups/${groupId}/members/${ana.userId}/weights`, { token: coach.accessToken })).status, 403);

    await api("PATCH", `/groups/${groupId}`, { body: { shares: ["meals"] }, token: coach.accessToken });
    const removed = await api("GET", `/groups/${groupId}/members/${ana.userId}/diary`, { token: coach.accessToken });
    assert.equal(removed.body.goals.caloriesPerDay, null, "removing an item applies at once");
    const range = await api("GET", `/groups/${groupId}/members/${ana.userId}/days?from=2026-11-01&to=2026-11-07`, { token: coach.accessToken });
    assert.equal(range.status, 403);
  });
});

describe("a member's meal photos", () => {
  it("open for the owner only while the member shares them", async () => {
    const dana = await signIn("dana3@example.com");
    await givePlan(coach.userId, "pro10");
    const created = await api("POST", "/groups", { body: { name: "Photo Club", shares: ["meals", "photos"] }, token: coach.accessToken });
    const { id, joinCode } = created.body.group;
    assert.equal((await api("POST", `/invites/${joinCode}/join`, { token: dana.accessToken })).status, 201);
    assert.equal((await api("POST", `/invites/${joinCode}/join`, { token: ben.accessToken })).status, 201);
    const added = await api("POST", "/meals/items", {
      body: { items: [{ amount: 100, name: "Oats", nutrimentsPer100g: { energyKcal100g: 380 }, unit: "g" }], label: "breakfast" },
      token: dana.accessToken,
    });
    const mealId = added.body.meal?.id ?? (await api("GET", "/diary", { token: dana.accessToken })).body.day.meals[0].id;
    const uploadId = await uploadPng(dana.accessToken);
    const loose = await uploadPng(dana.accessToken);
    await api("POST", `/meals/${mealId}/photos`, { body: { uploadId }, token: dana.accessToken });
    const path = `/uploads/${uploadId}/content`;
    const status = async (session: Session, at = path) => (await api("GET", at, { token: session.accessToken })).status;

    const day = await api("GET", `/groups/${id}/members/${dana.userId}/diary`, { token: coach.accessToken });
    assert.equal(day.body.meals[0].photos.length, 1);
    const shown = await api("GET", path, { token: coach.accessToken });
    assert.equal(shown.status, 200);
    assert.equal(shown.headers.get("cache-control"), "private, no-store");
    assert.equal(await status(ben), 404, "other members can't");
    assert.equal(await status(coach, `/uploads/${loose}/content`), 404, "only photos on a meal");

    const set = (body: object) => api("PATCH", `/groups/${id}/membership`, { body, token: dana.accessToken });
    await set({ sharing: false });
    assert.equal(await status(coach), 404, "sharing paused");
    await set({ sharing: true });
    assert.equal(await status(coach), 200);
    await set({ allowedShares: ["meals"] });
    assert.equal(await status(coach), 404, "photos not allowed");
    await set({ allowedShares: ["meals", "photos"] });
    await api("POST", `/groups/${id}/leave`, { token: dana.accessToken });
    assert.equal(await status(coach), 404, "left the group");
    assert.equal(await status(dana), 200);
  });
});
