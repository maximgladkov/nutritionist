import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { shiftYmd } from "../timezone.ts";
import { api, closeDatabase, installFakes, PNG_BYTES, pushes, resetDatabase, seedOffProduct, signIn, uploadPng, type Session } from "./test/harness.ts";

const BREAD = "8480000123459";
let coach: Session;
let kira: Session;
let outsider: Session;
let today: string;

before(async () => {
  installFakes();
  await resetDatabase();
  await seedOffProduct({ barcode: BREAD, brands: "Hacendado", name: "Pan rústico natural", nutriments: { energyKcal100g: 265 } });
  coach = await signIn("coach@example.com");
  kira = await signIn("member@example.com");
  outsider = await signIn("outsider@example.com");
  await api("PATCH", "/me", { body: { name: "Elena" }, token: coach.accessToken });
  await api("PATCH", "/me", { body: { name: "Kira" }, token: kira.accessToken });
  today = (await api("GET", "/diary", { token: kira.accessToken })).body.today;
});
after(closeDatabase);

describe("uploads", () => {
  it("stores images and serves them only to their owner", async () => {
    const uploadId = await uploadPng(kira.accessToken);
    const own = await api("GET", `/uploads/${uploadId}/content`, { token: kira.accessToken });
    assert.equal(own.status, 200);
    assert.equal(own.headers.get("content-type"), "image/png");
    assert.equal((await api("GET", `/uploads/${uploadId}/content`, { token: outsider.accessToken })).status, 404);
  });

  it("accepts multipart form uploads", async () => {
    const form = new FormData();
    form.set("file", new File([PNG_BYTES], "plate.png", { type: "image/png" }));
    const result = await api("POST", "/uploads", { raw: form, token: kira.accessToken });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.mediaType, "image/png");
  });

  it("rejects files that are not images and empty bodies", async () => {
    const text = await api("POST", "/uploads", { headers: { "content-type": "text/plain" }, raw: "hello world, not an image", token: kira.accessToken });
    assert.equal(text.status, 415);
    const empty = await api("POST", "/uploads", { headers: { "content-type": "image/png" }, raw: new Uint8Array(), token: kira.accessToken });
    assert.equal(empty.status, 400);
  });
});

describe("weight and progress photos", () => {
  it("tracks weight entries with deltas and progress toward the goal", async () => {
    await api("PUT", "/me/goals", { body: { goalWeightKg: 55 }, token: kira.accessToken });
    await api("PATCH", "/me/weights", { body: { startWeightKg: 65 }, token: kira.accessToken });
    await api("POST", "/me/weights", { body: { date: shiftYmd(today, -6), weightKg: 60.2 }, token: kira.accessToken });
    const latest = await api("POST", "/me/weights", { body: { weightKg: 59 }, token: kira.accessToken });
    assert.equal(latest.status, 201);
    assert.equal(latest.body.startKg, 65);
    assert.equal(latest.body.currentKg, 59);
    assert.equal(latest.body.goalKg, 55);
    assert.equal(latest.body.progress, 0.6);
    assert.equal(latest.body.entries[0].date, today);
    assert.equal(latest.body.entries[0].deltaKg, -1.2);

    const replaced = await api("POST", "/me/weights", { body: { weightKg: 58.7 }, token: kira.accessToken });
    assert.equal(replaced.body.entries.length, 2, "one entry per day");

    const future = await api("POST", "/me/weights", { body: { date: shiftYmd(today, 1), weightKg: 58 }, token: kira.accessToken });
    assert.equal(future.status, 400);
    assert.equal((await api("POST", "/me/weights", { body: { weightKg: 5 }, token: kira.accessToken })).status, 400);

    const entryId = replaced.body.entries[1].id;
    assert.equal((await api("DELETE", `/me/weights/${entryId}`, { token: outsider.accessToken })).status, 404);
    assert.equal((await api("DELETE", `/me/weights/${entryId}`, { token: kira.accessToken })).status, 204);
  });

  it("keeps progress photos", async () => {
    const uploadId = await uploadPng(kira.accessToken);
    const created = await api("POST", "/me/progress-photos", { body: { uploadId }, token: kira.accessToken });
    assert.equal(created.status, 201);
    assert.equal(created.body.photo.date, today);
    const listed = await api("GET", "/me/progress-photos", { token: kira.accessToken });
    assert.equal(listed.body.photos.length, 1);
    assert.equal((await api("DELETE", `/me/progress-photos/${created.body.photo.id}`, { token: kira.accessToken })).status, 204);
  });
});

describe("groups", () => {
  let groupId: string;
  let inviteToken: string;
  let itemId: string;

  it("creates a group and previews its invite without signing in", async () => {
    const created = await api("POST", "/groups", { body: { description: "Spring cut", name: "Elena's clients" }, token: coach.accessToken });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    groupId = created.body.group.id;
    inviteToken = created.body.group.inviteToken;
    assert.equal(created.body.group.role, "owner");

    const preview = await api("GET", `/invites/${inviteToken}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.invite.name, "Elena's clients");
    assert.equal(preview.body.membership, null);
  });

  it("lets a member join and see the group", async () => {
    const joined = await api("POST", `/invites/${inviteToken}/join`, { token: kira.accessToken });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.alreadyMember, false);
    const again = await api("POST", `/invites/${inviteToken}/join`, { token: kira.accessToken });
    assert.equal(again.body.alreadyMember, true);

    const list = await api("GET", "/groups", { token: kira.accessToken });
    assert.equal(list.body.groups.length, 1);
    assert.equal(list.body.groups[0].sharing, true);
    assert.equal(list.body.groups[0].unreadCount, 0);

    const owner = await api("GET", `/groups/${groupId}`, { token: coach.accessToken });
    assert.equal(owner.body.group.members.length, 1);
    assert.equal(owner.body.group.members[0].name, "Kira");
    assert.equal((await api("GET", `/groups/${groupId}`, { token: outsider.accessToken })).status, 404);
  });

  it("shows the member's diary to the owner while sharing is on", async () => {
    const logged = await api("POST", "/meals/items", { body: { items: [{ amount: 75, barcode: BREAD, unit: "g" }], label: "breakfast" }, token: kira.accessToken });
    itemId = logged.body.meal.items[0].id;

    const diary = await api("GET", `/groups/${groupId}/members/${kira.userId}/diary`, { token: coach.accessToken });
    assert.equal(diary.status, 200);
    assert.equal(diary.body.meals[0].items[0].brand, "Hacendado");
    const days = await api("GET", `/groups/${groupId}/members/${kira.userId}/days?from=${shiftYmd(today, -6)}&to=${today}`, { token: coach.accessToken });
    assert.equal(days.body.days.length, 7);
    assert.equal((await api("GET", `/groups/${groupId}/members/${coach.userId}/diary`, { token: kira.accessToken })).status, 403);
  });

  it("sends a coach comment on a food, pushes it and counts it as unread", async () => {
    await api("POST", "/me/devices", { body: { platform: "ios", token: "ExponentPushToken[member-device]" }, token: kira.accessToken });
    const sent = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "Great protein choice!", memberId: kira.userId, target: { mealItemId: itemId, type: "mealItem" } },
      token: coach.accessToken,
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.deepEqual(sent.body.message.target, { mealItemId: itemId, type: "mealItem" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]?.to, "ExponentPushToken[member-device]");
    assert.equal(pushes[0]?.title, "Elena · Elena's clients");

    const dayComment = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "Nice day overall", memberId: kira.userId, target: { date: today, type: "day" } },
      token: coach.accessToken,
    });
    assert.equal(dayComment.status, 201);

    const foreignItem = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "x", memberId: kira.userId, target: { mealItemId: "nope", type: "mealItem" } },
      token: coach.accessToken,
    });
    assert.equal(foreignItem.status, 404);

    const list = await api("GET", "/groups", { token: kira.accessToken });
    assert.equal(list.body.groups[0].unreadCount, 2);

    const thread = await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken });
    assert.equal(thread.body.messages.length, 2);
    assert.equal(thread.body.messages[0].fromName, "Elena");

    assert.equal((await api("POST", `/groups/${groupId}/messages/read`, { token: kira.accessToken })).status, 201);
    const read = await api("GET", "/groups", { token: kira.accessToken });
    assert.equal(read.body.groups[0].unreadCount, 0);

    const notMine = await api("POST", `/groups/${groupId}/messages`, { body: { body: "hi", memberId: coach.userId }, token: kira.accessToken });
    assert.equal(notMine.status, 403, "only the owner can comment");
  });

  it("builds a notification feed for comments and joins", async () => {
    const memberFeed = await api("GET", "/notifications", { token: kira.accessToken });
    assert.equal(memberFeed.status, 200);
    assert.equal(memberFeed.body.items.length, 2);
    assert.equal(memberFeed.body.items[0].type, "group_message");
    assert.equal(memberFeed.body.unreadCount, 2);

    const ownerFeed = await api("GET", "/notifications", { token: coach.accessToken });
    assert.equal(ownerFeed.body.items[0].type, "member_joined");
    assert.equal(ownerFeed.body.items[0].memberName, "Kira");

    await api("POST", "/notifications/read", { token: kira.accessToken });
    const cleared = await api("GET", "/notifications", { token: kira.accessToken });
    assert.equal(cleared.body.unreadCount, 0);
    assert.equal(cleared.body.items.every((item: { read: boolean }) => item.read), true);
  });

  it("hides the diary when the member pauses sharing", async () => {
    const paused = await api("PATCH", `/groups/${groupId}/membership`, { body: { sharing: false }, token: kira.accessToken });
    assert.equal(paused.status, 200);
    const blocked = await api("GET", `/groups/${groupId}/members/${kira.userId}/diary`, { token: coach.accessToken });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "not_sharing");
    assert.equal((await api("PATCH", `/groups/${groupId}/membership`, { body: { sharing: false }, token: coach.accessToken })).status, 403);
  });

  it("rotates the invite, removes and lets members leave, and deletes the group", async () => {
    const rotated = await api("POST", `/groups/${groupId}/invite/rotate`, { token: coach.accessToken });
    assert.equal(rotated.status, 201);
    assert.notEqual(rotated.body.inviteToken, inviteToken);
    assert.equal((await api("POST", `/invites/${inviteToken}/join`, { token: outsider.accessToken })).status, 404, "the old link stops working");
    assert.equal((await api("POST", `/invites/${rotated.body.inviteToken}/join`, { token: outsider.accessToken })).status, 201);

    assert.equal((await api("DELETE", `/groups/${groupId}/members/${outsider.userId}`, { token: kira.accessToken })).status, 403);
    assert.equal((await api("DELETE", `/groups/${groupId}/members/${outsider.userId}`, { token: coach.accessToken })).status, 204);
    assert.equal((await api("POST", `/groups/${groupId}/leave`, { token: kira.accessToken })).status, 204);
    assert.equal((await api("POST", `/groups/${groupId}/leave`, { token: coach.accessToken })).status, 403);

    const renamed = await api("PATCH", `/groups/${groupId}`, { body: { name: "Renamed" }, token: coach.accessToken });
    assert.equal(renamed.body.group.name, "Renamed");
    assert.equal((await api("DELETE", `/groups/${groupId}`, { token: coach.accessToken })).status, 204);
    assert.equal((await api("GET", "/groups", { token: coach.accessToken })).body.groups.length, 0);
  });
});
