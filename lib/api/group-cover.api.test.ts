import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, resetDatabase, signIn, storedBlobCount, type Session, uploadPng } from "./test/harness.ts";

// The group's photo: only the owner sets, changes, or removes it, and each change gets a new URL so
// no phone keeps showing the old one.

let coach: Session;
let ana: Session;
let groupId: string;

const cover = async (session: Session) =>
  (await api("GET", `/groups/${groupId}`, { token: session.accessToken })).body.group.imageUrl as string;

before(async () => {
  installFakes();
  await resetDatabase();
  coach = await signIn("cover-coach@example.com");
  ana = await signIn("cover-ana@example.com");
  const created = await api("POST", "/groups", { body: { name: "Cover Club" }, token: coach.accessToken });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  groupId = created.body.group.id;
  assert.equal(created.body.group.imageUrl, "");
  const joined = await api("POST", `/invites/${created.body.group.inviteToken}/join`, { token: ana.accessToken });
  assert.equal(joined.status, 201, JSON.stringify(joined.body));
});
after(closeDatabase);

describe("group photo", () => {
  let first: string;

  it("lets the owner set one from an upload, and members see it", async () => {
    const uploadId = await uploadPng(coach.accessToken);
    const saved = await api("PATCH", `/groups/${groupId}`, { body: { uploadId }, token: coach.accessToken });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    first = saved.body.group.imageUrl;
    assert.match(first, /^https:\/\/public\.blob\.test\/groups\/[^/]+\/cover-[0-9a-f]+\.png$/u);
    assert.equal(await cover(ana), first);
    const listed = await api("GET", "/groups", { token: ana.accessToken });
    assert.equal(listed.body.groups.find((group: { id: string }) => group.id === groupId).imageUrl, first);
  });

  it("gives a changed photo a new URL and deletes the old one", async () => {
    const blobs = storedBlobCount();
    const uploadId = await uploadPng(coach.accessToken);
    const saved = await api("PATCH", `/groups/${groupId}`, { body: { uploadId }, token: coach.accessToken });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.notEqual(saved.body.group.imageUrl, first);
    // The new upload and new cover are stored; the old cover is gone.
    assert.equal(storedBlobCount(), blobs + 1);
    first = saved.body.group.imageUrl;
  });

  it("doesn't let a member change or remove it", async () => {
    const uploadId = await uploadPng(ana.accessToken);
    const changed = await api("PATCH", `/groups/${groupId}`, { body: { uploadId }, token: ana.accessToken });
    assert.equal(changed.status, 403, JSON.stringify(changed.body));
    const removed = await api("PATCH", `/groups/${groupId}`, { body: { removeImage: true }, token: ana.accessToken });
    assert.equal(removed.status, 403, JSON.stringify(removed.body));
    assert.equal(await cover(coach), first);
  });

  it("lets the owner remove it, back to the initials", async () => {
    const blobs = storedBlobCount();
    const removed = await api("PATCH", `/groups/${groupId}`, { body: { removeImage: true }, token: coach.accessToken });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.group.imageUrl, "");
    assert.equal(await cover(ana), "");
    assert.equal(storedBlobCount(), blobs - 1);
  });
});
