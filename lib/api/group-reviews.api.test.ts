import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { shiftYmd } from "../timezone.ts";
import { api, closeDatabase, installFakes, pushes, resetDatabase, seedOffProduct, signIn, type Session } from "./test/harness.ts";

// The group owner reviewing members' daily reports: the board of who logged and who's reviewed,
// marking days reviewed, quick reactions, and comments on part of a day. Members see only what
// the owner left on their own days.

const BREAD = "8480000123459";
let coach: Session;
let kira: Session;
let laura: Session;
let omar: Session;
let outsider: Session;
let groupId: string;
let today: string;
let yesterday: string;

const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

type BoardMember = { comments: number; logged: boolean | null; name: string; reviewedAt: string | null; status: string; userId: string };

function memberOf(board: { members: BoardMember[] }, userId: string): BoardMember {
  const member = board.members.find((entry) => entry.userId === userId);
  assert.ok(member, `member ${userId} on the board`);
  return member;
}

before(async () => {
  installFakes();
  await resetDatabase();
  await seedOffProduct({ barcode: BREAD, brands: "Hacendado", name: "Pan rústico natural", nutriments: { energyKcal100g: 265 } });
  coach = await signIn("coach-review@example.com");
  kira = await signIn("kira-review@example.com");
  laura = await signIn("laura-review@example.com");
  omar = await signIn("omar-review@example.com");
  outsider = await signIn("outsider-review@example.com");
  for (const [session, name] of [[coach, "Elena"], [kira, "Kira"], [laura, "Laura"], [omar, "Omar"], [outsider, "Pablo"]] as const) {
    await api("PATCH", "/me", { body: { name }, token: session.accessToken });
  }
  await api("POST", "/me/devices", { body: { platform: "ios", token: "ExponentPushToken[kira-review]" }, token: kira.accessToken });
  const created = await api("POST", "/groups", { body: { name: "Lean by Spring" }, token: coach.accessToken });
  groupId = created.body.group.id;
  const code = created.body.group.joinCode;
  for (const session of [kira, laura, omar]) {
    assert.equal((await api("POST", `/invites/${code}/join`, { token: session.accessToken })).status, 201);
  }
  await api("PATCH", `/groups/${groupId}/membership`, { body: { sharing: false }, token: omar.accessToken });
  today = (await api("GET", "/diary", { token: kira.accessToken })).body.today;
  yesterday = shiftYmd(today, -1);
  const logged = await api("POST", "/meals/items", { body: { items: [{ amount: 75, barcode: BREAD, unit: "g" }], label: "breakfast" }, token: kira.accessToken });
  assert.equal(logged.status, 201, JSON.stringify(logged.body));
  await api("POST", "/meals/items", { body: { date: yesterday, items: [{ amount: 50, barcode: BREAD, unit: "g" }], label: "lunch" }, token: laura.accessToken });
});
after(closeDatabase);

describe("the review board", () => {
  it("shows each member's status for the day and a calendar of the month", async () => {
    const res = await api("GET", `/groups/${groupId}/reviews?date=${today}`, { token: coach.accessToken });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const board = res.body;
    assert.equal(board.date, today);
    assert.equal(board.today, today);
    assert.deepEqual(board.members.map((member: BoardMember) => member.name), ["Kira", "Laura", "Omar"]);
    assert.equal(memberOf(board, kira.userId).status, "to_review");
    assert.equal(memberOf(board, kira.userId).logged, true);
    assert.equal(memberOf(board, laura.userId).status, "nothing_logged");
    assert.equal(memberOf(board, omar.userId).status, "paused", "members who paused sharing stay out of the review");
    assert.equal(memberOf(board, omar.userId).logged, null);
    assert.deepEqual(board.counts, { reviewed: 0, toReview: 1, total: 2 });
    assert.equal(board.from, `${today.slice(0, 7)}-01`);
    const day = board.days.find((entry: { date: string }) => entry.date === today);
    assert.deepEqual(day, { date: today, logged: 1, reviewed: 0, toReview: 1 });
  });

  it("counts a day logged in the member's own timezone", async () => {
    const from = shiftYmd(today, -3);
    const res = await api("GET", `/groups/${groupId}/reviews?date=${yesterday}&from=${from}&to=${today}`, { token: coach.accessToken });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(memberOf(res.body, laura.userId).status, "to_review");
    assert.equal(memberOf(res.body, kira.userId).status, "nothing_logged");
    assert.equal(res.body.days.length, 4);
  });

  it("is only for the group's owner", async () => {
    assert.equal((await api("GET", `/groups/${groupId}/reviews`, { token: kira.accessToken })).status, 403);
    assert.equal((await api("GET", `/groups/${groupId}/reviews`, { token: outsider.accessToken })).status, 403);
    assert.equal((await api("GET", `/groups/${groupId}/reviews`)).status, 401);
  });

  it("refuses odd ranges", async () => {
    const long = await api("GET", `/groups/${groupId}/reviews?date=${today}&from=${shiftYmd(today, -100)}&to=${today}`, { token: coach.accessToken });
    assert.equal(long.status, 400);
    const outside = await api("GET", `/groups/${groupId}/reviews?date=${today}&from=${shiftYmd(today, -5)}&to=${shiftYmd(today, -1)}`, { token: coach.accessToken });
    assert.equal(outside.status, 400);
    assert.equal((await api("GET", `/groups/${groupId}/reviews?date=nope`, { token: coach.accessToken })).status, 400);
  });
});

describe("marking a day reviewed", () => {
  it("marks and unmarks a member's day", async () => {
    const marked = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${today}/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.ok(marked.body.reviewedAt);
    const again = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${today}/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(again.body.reviewedAt, marked.body.reviewedAt, "marking twice keeps the first time");

    const board = (await api("GET", `/groups/${groupId}/reviews?date=${today}`, { token: coach.accessToken })).body;
    assert.equal(memberOf(board, kira.userId).status, "reviewed");
    assert.deepEqual(board.counts, { reviewed: 1, toReview: 0, total: 2 });
    assert.equal(board.days.find((entry: { date: string }) => entry.date === today).toReview, 0);

    const undone = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${today}/review`, { body: { reviewed: false }, token: coach.accessToken });
    assert.equal(undone.body.reviewedAt, null);
    const after = (await api("GET", `/groups/${groupId}/reviews?date=${today}`, { token: coach.accessToken })).body;
    assert.equal(memberOf(after, kira.userId).status, "to_review");
    await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${today}/review`, { body: { reviewed: true }, token: coach.accessToken });
  });

  it("lets owners mark a day with nothing logged after checking in", async () => {
    const marked = await api("PUT", `/groups/${groupId}/members/${laura.userId}/days/${today}/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(marked.status, 200);
    const board = (await api("GET", `/groups/${groupId}/reviews?date=${today}`, { token: coach.accessToken })).body;
    assert.equal(memberOf(board, laura.userId).status, "reviewed");
  });

  it("keeps members, outsiders and future days out", async () => {
    const self = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${today}/review`, { body: { reviewed: true }, token: kira.accessToken });
    assert.equal(self.status, 403);
    const peer = await api("PUT", `/groups/${groupId}/members/${laura.userId}/days/${today}/review`, { body: { reviewed: true }, token: kira.accessToken });
    assert.equal(peer.status, 403);
    const stranger = await api("PUT", `/groups/${groupId}/members/${outsider.userId}/days/${today}/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(stranger.status, 404);
    const future = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${shiftYmd(today, 2)}/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(future.status, 400);
    const badDate = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/2026-13-40/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(badDate.status, 400);
  });
});

describe("notes wait for the day's review", () => {
  let draftId: string;

  it("keeps the owner's comments and reactions from the member until the day is reviewed", async () => {
    pushes.length = 0;
    const draft = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "Lunch was light.", draftFor: yesterday, memberId: kira.userId, target: { date: yesterday, part: "meal:lunch", type: "day" } },
      token: coach.accessToken,
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    assert.equal(draft.body.message.draft, true);
    draftId = draft.body.message.id;
    const second = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "And more water, please.", draftFor: yesterday, replyToId: draftId },
      token: coach.accessToken,
    });
    assert.equal(second.body.message.draft, true);
    await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${yesterday}/reaction`, { body: { emoji: "💪", part: "day" }, token: coach.accessToken });
    await wait();
    assert.equal(pushes.length, 0, "nothing is sent while the owner is still reviewing");

    const asMember = await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken });
    assert.equal(asMember.body.messages.some((message: { id: string }) => message.id === draftId), false);
    assert.equal(asMember.body.reactions.some((reaction: { date: string }) => reaction.date === yesterday), false);
    const unread = (await api("GET", "/groups", { token: kira.accessToken })).body.groups[0].unreadCount;
    assert.equal(unread, 0);
    const reply = await api("POST", `/groups/${groupId}/messages`, { body: { body: "Hi", replyToId: draftId }, token: kira.accessToken });
    assert.equal(reply.status, 404, "members can't answer a comment they can't see");

    const asOwner = await api("GET", `/groups/${groupId}/messages?memberId=${kira.userId}`, { token: coach.accessToken });
    assert.equal(asOwner.body.messages.find((message: { id: string }) => message.id === draftId)?.draft, true);
    assert.equal(asOwner.body.reactions.find((reaction: { date: string }) => reaction.date === yesterday)?.sent, false);
    const board = (await api("GET", `/groups/${groupId}/reviews?date=${yesterday}&from=${shiftYmd(yesterday, -1)}&to=${yesterday}`, { token: coach.accessToken })).body;
    assert.equal(memberOf(board, kira.userId).unsent, 3);
  });

  it("sends everything with one notification when the day is marked reviewed", async () => {
    pushes.length = 0;
    const marked = await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${yesterday}/review`, { body: { reviewed: true }, token: coach.accessToken });
    assert.equal(marked.status, 200);
    assert.equal(marked.body.sent, 3);
    await wait();
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]?.body, "Lunch was light. (+1 more)");
    assert.equal((pushes[0]?.data as { type?: string }).type, "group_review");

    const asMember = await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken });
    const shown = asMember.body.messages.find((message: { id: string }) => message.id === draftId);
    assert.equal(shown?.draft, false);
    assert.ok(asMember.body.reactions.some((reaction: { date: string; sent: boolean }) => reaction.date === yesterday && reaction.sent));
    assert.equal((await api("GET", "/groups", { token: kira.accessToken })).body.groups[0].unreadCount, 2, "sent comments count as new");
    const board = (await api("GET", `/groups/${groupId}/reviews?date=${yesterday}&from=${shiftYmd(yesterday, -1)}&to=${yesterday}`, { token: coach.accessToken })).body;
    assert.equal(memberOf(board, kira.userId).unsent, 0);

    pushes.length = 0;
    await api("PUT", `/groups/${groupId}/members/${kira.userId}/days/${yesterday}/review`, { body: { reviewed: true }, token: coach.accessToken });
    await wait();
    assert.equal(pushes.length, 0, "marking again with nothing new stays quiet");
  });

  it("sends right away on a day that's already reviewed", async () => {
    pushes.length = 0;
    const late = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "One more thing.", draftFor: yesterday, memberId: kira.userId, target: { date: yesterday, type: "day" } },
      token: coach.accessToken,
    });
    assert.equal(late.body.message.draft, false);
    await wait();
    assert.equal(pushes.length, 1);
  });
});

describe("reactions and comments on part of the day", () => {
  it("sets, changes and clears a reaction", async () => {
    const path = `/groups/${groupId}/members/${kira.userId}/days/${today}/reaction`;
    const set = await api("PUT", path, { body: { emoji: "👍", part: "meal:breakfast" }, token: coach.accessToken });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.deepEqual(set.body.reaction, { date: today, emoji: "👍", part: "meal:breakfast", sent: true }, "Kira's day is already reviewed");
    const changed = await api("PUT", path, { body: { emoji: "💪", part: "meal:breakfast" }, token: coach.accessToken });
    assert.equal(changed.body.reaction.emoji, "💪");
    await api("PUT", path, { body: { emoji: "🔥", part: "total:protein" }, token: coach.accessToken });
    await api("PUT", path, { body: { emoji: "❤️", part: "day" }, token: coach.accessToken });
    const cleared = await api("PUT", path, { body: { emoji: null, part: "day" }, token: coach.accessToken });
    assert.equal(cleared.body.reaction, null);

    for (const emoji of ["🍕", "👍🏽", "👨‍👩‍👧", "🇪🇸", "❤️"]) {
      const any = await api("PUT", path, { body: { emoji, part: "day" }, token: coach.accessToken });
      assert.equal(any.status, 200, `${emoji} ${JSON.stringify(any.body)}`);
      assert.equal(any.body.reaction.emoji, emoji);
    }
    await api("PUT", path, { body: { emoji: null, part: "day" }, token: coach.accessToken });
    for (const emoji of ["ok", "👍👍", "", "👍 ", "<b>"]) {
      assert.equal((await api("PUT", path, { body: { emoji, part: "day" }, token: coach.accessToken })).status, 400, emoji);
    }
    assert.equal((await api("PUT", path, { body: { emoji: "👍", part: "meal:brunch" }, token: coach.accessToken })).status, 400);
    assert.equal((await api("PUT", path, { body: { emoji: "👍", part: "day" }, token: kira.accessToken })).status, 403);
  });

  it("comments on a total and keeps the part on replies", async () => {
    pushes.length = 0;
    const sent = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "A third of your protein so far.", memberId: kira.userId, target: { date: today, part: "total:protein", type: "day" } },
      token: coach.accessToken,
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.deepEqual(sent.body.message.target, { date: today, part: "total:protein", type: "day" });
    await wait();
    assert.equal(pushes.length, 1, "the member gets a notification");
    assert.equal(pushes[0]?.to, "ExponentPushToken[kira-review]");
    assert.equal((pushes[0]?.data as { date?: string } | undefined)?.date, today);

    const reply = await api("POST", `/groups/${groupId}/messages`, { body: { body: "Chicken for lunch!", replyToId: sent.body.message.id }, token: kira.accessToken });
    assert.equal(reply.status, 201);
    assert.deepEqual(reply.body.message.target, { date: today, part: "total:protein", type: "day" });

    const whole = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "Nice start.", memberId: kira.userId, target: { date: today, type: "day" } },
      token: coach.accessToken,
    });
    assert.equal(whole.body.message.target.part, "day");
    const bad = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "Hm", memberId: kira.userId, target: { date: today, part: "total:sugar", type: "day" } },
      token: coach.accessToken,
    });
    assert.equal(bad.status, 400);

    const board = (await api("GET", `/groups/${groupId}/reviews?date=${today}`, { token: coach.accessToken })).body;
    assert.equal(memberOf(board, kira.userId).comments, 3);
  });

  it("shows members their own reactions and reviewed days, and nobody else's", async () => {
    await api("PUT", `/groups/${groupId}/members/${laura.userId}/days/${yesterday}/reaction`, { body: { emoji: "🤔", part: "meal:lunch" }, token: coach.accessToken });
    const mine = await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken });
    assert.equal(mine.status, 200);
    assert.deepEqual(
      mine.body.reactions
        .filter((reaction: { date: string }) => reaction.date === today)
        .map((reaction: { emoji: string; part: string }) => `${reaction.part} ${reaction.emoji}`)
        .sort(),
      ["meal:breakfast 💪", "total:protein 🔥"],
    );
    assert.deepEqual(mine.body.reviews.map((review: { date: string }) => review.date), [today, yesterday]);
    assert.ok(mine.body.messages.every((message: { toUserId: string }) => message.toUserId === kira.userId));

    const lauras = await api("GET", `/groups/${groupId}/messages`, { token: laura.accessToken });
    assert.deepEqual(lauras.body.reactions, [], "the reaction waits for the day's review");
    assert.equal(lauras.body.messages.length, 0);
    await api("PUT", `/groups/${groupId}/members/${laura.userId}/days/${yesterday}/review`, { body: { reviewed: true }, token: coach.accessToken });
    const reviewed = await api("GET", `/groups/${groupId}/messages`, { token: laura.accessToken });
    assert.deepEqual(reviewed.body.reactions, [{ date: yesterday, emoji: "🤔", part: "meal:lunch", sent: true }]);

    const asOwner = await api("GET", `/groups/${groupId}/messages?memberId=${kira.userId}`, { token: coach.accessToken });
    assert.equal(asOwner.body.reactions.length, 3);
    assert.equal(asOwner.body.reviews.length, 2);
    // A member can't read another member's thread by passing memberId.
    const peek = await api("GET", `/groups/${groupId}/messages?memberId=${kira.userId}`, { token: laura.accessToken });
    assert.equal(peek.body.reactions.length, 1);
    assert.ok(peek.body.messages.every((message: { toUserId: string }) => message.toUserId === laura.userId));
  });

  it("drops members who leave from the board", async () => {
    assert.equal((await api("POST", `/groups/${groupId}/leave`, { token: laura.accessToken })).status, 204);
    const board = (await api("GET", `/groups/${groupId}/reviews?date=${today}`, { token: coach.accessToken })).body;
    assert.equal(board.members.some((member: BoardMember) => member.userId === laura.userId), false);
    assert.equal((await api("PUT", `/groups/${groupId}/members/${laura.userId}/days/${today}/review`, { body: { reviewed: true }, token: coach.accessToken })).status, 404);
  });
});
