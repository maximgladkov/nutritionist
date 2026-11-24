import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../prisma.ts";
import { mergeUsers } from "../identity.ts";
import { sealSecret } from "../secret-box.ts";
import { readTelegramChat } from "../telegram-profile.ts";
import {
  api,
  appleToken,
  closeDatabase,
  fatSecretProfile,
  flushBackground,
  installFakes,
  resetDatabase,
  signIn,
  storedBlobCount,
  telegramPeople,
  uploadPng,
  type Session,
} from "./test/harness.ts";

let kira: Session;

before(async () => {
  installFakes();
  await resetDatabase();
  kira = await signIn("kira@example.com");
});
after(closeDatabase);

const patch = (session: Session, body: object) => api("PATCH", "/me", { body, token: session.accessToken });
const me = async (session: Session) => (await api("GET", "/me", { token: session.accessToken })).body;
const fill = (session: Session, body: object) => api("POST", "/me/profile-fill", { body, token: session.accessToken });

async function setPhoto(session: Session): Promise<string> {
  const uploadId = await uploadPng(session.accessToken);
  const saved = await api("PUT", "/me/avatar", { body: { uploadId }, token: session.accessToken });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return uploadId;
}

const open = async (session: Session, uploadId: string) =>
  (await api("GET", `/uploads/${uploadId}/content`, { token: session.accessToken })).status;

describe("profile details", () => {
  it("start empty, save and clear", async () => {
    const empty = await me(kira);
    for (const field of ["avatarUrl", "birthDate", "gender", "heightCm"]) assert.equal(empty[field], null, field);
    assert.deepEqual(empty.filledFrom, {});

    const saved = await patch(kira, { birthDate: "1991-02-28", gender: "female", heightCm: 168.5, name: "Kira" });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.birthDate, "1991-02-28");
    assert.equal(saved.body.gender, "female");
    assert.equal(saved.body.heightCm, 168.5);
    assert.equal(saved.body.name, "Kira");

    const cleared = await patch(kira, { birthDate: null, gender: null, heightCm: null, name: null });
    for (const field of ["birthDate", "gender", "heightCm", "name"]) assert.equal(cleared.body[field], null, field);
  });

  it("refuses values that can't be right", async () => {
    for (const body of [
      { birthDate: "1991-02-30" },
      { birthDate: "1899-12-31" },
      { birthDate: "2999-01-01" },
      { birthDate: "28/02/1991" },
      { gender: "robot" },
      { heightCm: 20 },
      { heightCm: 300 },
      { name: "  " },
      { avatarId: "x" },
    ]) {
      assert.equal((await patch(kira, body)).status, 400, JSON.stringify(body));
    }
  });
});

describe("filling in from connected apps", () => {
  it("only fills what's empty, says where from, and forgets that once changed", async () => {
    await patch(kira, { heightCm: 170 });
    const filled = await fill(kira, { birthDate: "1990-05-06", gender: "female", heightCm: 169, source: "apple_health" });
    assert.equal(filled.status, 201, JSON.stringify(filled.body));
    assert.deepEqual([...filled.body.filled].sort(), ["birthDate", "gender"]);
    assert.equal(filled.body.me.heightCm, 170, "what was typed stays");
    assert.deepEqual(filled.body.me.filledFrom, { birthDate: "apple_health", gender: "apple_health" });

    const changed = await patch(kira, { gender: "nonbinary" });
    assert.deepEqual(changed.body.filledFrom, { birthDate: "apple_health" });
    const undone = await patch(kira, { birthDate: null });
    assert.equal(undone.body.birthDate, null);
    assert.deepEqual(undone.body.filledFrom, {});
  });

  it("leaves \"prefer not to say\" alone", async () => {
    await patch(kira, { gender: "undisclosed" });
    const filled = await fill(kira, { gender: "female", source: "apple_health" });
    assert.deepEqual(filled.body.filled, []);
    assert.equal(filled.body.me.gender, "undisclosed");
  });

  it("refuses unknown sources and bad values", async () => {
    assert.equal((await fill(kira, { heightCm: 170, source: "horoscope" })).status, 400);
    assert.equal((await fill(kira, { heightCm: 7, source: "apple_health" })).status, 400);
    assert.equal((await fill(kira, { email: "x@y.z", source: "apple_health" })).status, 400);
  });

  it("suggests what Telegram and FatSecret know for empty details", async () => {
    const tom = await signIn("tom@example.com");
    const suggestions = () => api("GET", "/me/profile-suggestions", { token: tom.accessToken });
    assert.deepEqual((await suggestions()).body, { suggestions: [], telegramPhoto: false });
    assert.equal((await api("GET", "/me/telegram-photo", { token: tom.accessToken })).status, 404);

    await prisma.channelIdentity.create({ data: { provider: "telegram", providerUserId: "42", userId: tom.userId } });
    telegramPeople.set("42", { birthDate: "1988-01-02", name: "Tom Reed", photoFileId: "big" });
    await prisma.fatSecretConnection.create({
      data: { accessSecret: sealSecret("access-secret"), accessToken: sealSecret("access-token"), status: "connected", userId: tom.userId },
    });
    fatSecretProfile.heightCm = 181;
    const first = (await suggestions()).body;
    assert.deepEqual(first.suggestions, [
      { birthDate: "1988-01-02", name: "Tom Reed", source: "telegram" },
      { heightCm: 181, source: "fatsecret" },
    ]);
    assert.equal(first.telegramPhoto, true);
    const photo = await api("GET", "/me/telegram-photo", { token: tom.accessToken });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get("content-type"), "image/png");

    await patch(tom, { birthDate: "1988-01-03", heightCm: 180, name: "Tom" });
    assert.deepEqual((await suggestions()).body.suggestions, []);
  });

  it("keeps the name Apple shares when there's none", async () => {
    const first = await api("POST", "/auth/apple", { body: { identityToken: appleToken({ sub: "apple-sub-000000000000" }) } });
    assert.equal(first.body.user.name, null);
    const again = await api("POST", "/auth/apple", {
      body: { fullName: "Ana Pérez", identityToken: appleToken({ sub: "apple-sub-000000000000" }) },
    });
    assert.equal(again.body.user.name, "Ana Pérez");
    assert.deepEqual(again.body.user.filledFrom, { name: "apple" });
    const other = await api("POST", "/auth/apple", {
      body: { fullName: "Someone Else", identityToken: appleToken({ sub: "apple-sub-000000000000" }) },
    });
    assert.equal(other.body.user.name, "Ana Pérez");
  });

  it("reads a Telegram birthday only when it has a year", () => {
    assert.deepEqual(readTelegramChat({ birthdate: { day: 3, month: 4 }, first_name: "Lea" }), {
      birthDate: null,
      name: "Lea",
      photoFileId: null,
    });
    assert.equal(readTelegramChat({ birthdate: { day: 3, month: 4, year: 1990 } }).birthDate, "1990-04-03");
  });
});

describe("profile photo", () => {
  it("is set, replaced and removed, and the old file goes away", async () => {
    const first = await setPhoto(kira);
    assert.equal((await me(kira)).avatarUrl, `/api/v1/uploads/${first}/content`);
    assert.equal(await open(kira, first), 200);
    const stored = storedBlobCount();

    const second = await setPhoto(kira);
    await flushBackground();
    assert.equal(await open(kira, first), 404);
    assert.equal(await open(kira, second), 200);
    assert.equal(storedBlobCount(), stored);

    // Saving the same one again keeps it.
    await api("PUT", "/me/avatar", { body: { uploadId: second }, token: kira.accessToken });
    assert.equal(await open(kira, second), 200);

    const removed = await api("DELETE", "/me/avatar", { token: kira.accessToken });
    assert.equal(removed.body.avatarUrl, null);
    await flushBackground();
    assert.equal(await open(kira, second), 404);
    assert.equal(storedBlobCount(), stored - 1);
  });

  it("stays when a meal uses it too", async () => {
    const uploadId = await setPhoto(kira);
    const added = await api("POST", "/meals/items", {
      body: { items: [{ amount: 100, name: "Oats", nutrimentsPer100g: { energyKcal100g: 380 }, unit: "g" }], label: "breakfast" },
      token: kira.accessToken,
    });
    await api("POST", `/meals/${added.body.meal.id}/photos`, { body: { uploadId }, token: kira.accessToken });
    await api("DELETE", "/me/avatar", { token: kira.accessToken });
    assert.equal(await open(kira, uploadId), 200);
  });

  it("can't be someone else's upload", async () => {
    const eve = await signIn("eve@example.com");
    const uploadId = await uploadPng(kira.accessToken);
    assert.equal((await api("PUT", "/me/avatar", { body: { uploadId }, token: eve.accessToken })).status, 404);
  });

  it("opens only for people who see the person in a group", async () => {
    const coach = await signIn("coach@example.com");
    const ben = await signIn("ben@example.com");
    const stranger = await signIn("stranger@example.com");
    const photos = { ben: await setPhoto(ben), coach: await setPhoto(coach), kira: await setPhoto(kira) };
    const looseId = await uploadPng(kira.accessToken);
    const created = await api("POST", "/groups", { body: { name: "Lean" }, token: coach.accessToken });
    const { id, joinCode } = created.body.group;
    const join = (session: Session) => api("POST", `/invites/${joinCode}/join`, { token: session.accessToken });
    await join(kira);
    assert.equal(await open(ben, photos.coach), 404, "not a member yet");
    await join(ben);

    assert.equal(await open(coach, photos.kira), 200, "the owner sees members");
    assert.equal(await open(kira, photos.coach), 200, "members see the owner");
    assert.equal(await open(ben, photos.kira), 200, "members see each other");
    assert.equal(await open(stranger, photos.kira), 404);
    assert.equal(await open(stranger, photos.coach), 404);
    assert.equal(await open(coach, looseId), 404, "only the profile photo");

    const list = await api("GET", "/groups", { token: kira.accessToken });
    assert.equal(list.body.groups[0].ownerAvatarUrl, `/api/v1/uploads/${photos.coach}/content`);
    const detail = await api("GET", `/groups/${id}`, { token: kira.accessToken });
    assert.equal(detail.body.group.ownerAvatarUrl, `/api/v1/uploads/${photos.coach}/content`);
    const row = (group: any, userId: string) => group.members.find((member: any) => member.userId === userId);
    assert.equal(row(detail.body.group, ben.userId).avatarUrl, `/api/v1/uploads/${photos.ben}/content`);
    assert.equal(row(detail.body.group, ben.userId).birthDate, undefined);
    const owned = await api("GET", `/groups/${id}`, { token: coach.accessToken });
    assert.equal(row(owned.body.group, kira.userId).avatarUrl, `/api/v1/uploads/${photos.kira}/content`);

    // A private member list hides members from each other, not from the owner.
    await api("PATCH", `/groups/${id}`, { body: { membersVisible: false }, token: coach.accessToken });
    assert.equal(await open(ben, photos.kira), 404);
    assert.equal(await open(coach, photos.kira), 200);
    assert.equal(await open(kira, photos.coach), 200);

    // Pausing the diary doesn't hide who they are; leaving does.
    await api("PATCH", `/groups/${id}/membership`, { body: { sharing: false }, token: kira.accessToken });
    assert.equal(await open(coach, photos.kira), 200);
    await api("POST", `/groups/${id}/leave`, { token: kira.accessToken });
    assert.equal(await open(coach, photos.kira), 404);
    assert.equal(await open(kira, photos.coach), 404);
    assert.equal(await open(kira, photos.kira), 200);
  });

  it("stops opening for others once replaced", async () => {
    const owner = await signIn("owner2@example.com");
    const member = await signIn("member2@example.com");
    const first = await setPhoto(member);
    const created = await api("POST", "/groups", { body: { name: "Second" }, token: owner.accessToken });
    await api("POST", `/invites/${created.body.group.joinCode}/join`, { token: member.accessToken });
    assert.equal(await open(owner, first), 200);
    const second = await setPhoto(member);
    assert.equal(await open(owner, first), 404);
    assert.equal(await open(owner, second), 200);
  });
});

describe("joining two accounts", () => {
  it("keeps the survivor's details and takes the missing ones", async () => {
    const survivor = await signIn("survivor@example.com");
    const absorbed = await signIn("absorbed@example.com");
    await patch(survivor, { heightCm: 175 });
    await patch(absorbed, { heightCm: 160 });
    await fill(absorbed, { birthDate: "1992-03-04", source: "apple_health" });
    const uploadId = await setPhoto(absorbed);
    await mergeUsers(survivor.userId, absorbed.userId);
    const merged = await me(survivor);
    assert.equal(merged.heightCm, 175);
    assert.equal(merged.birthDate, "1992-03-04");
    assert.deepEqual(merged.filledFrom, { birthDate: "apple_health" });
    assert.equal(merged.avatarUrl, `/api/v1/uploads/${uploadId}/content`);
    assert.equal(await open(survivor, uploadId), 200);
  });
});
