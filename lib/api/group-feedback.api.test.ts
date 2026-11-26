import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { api, closeDatabase, installFakes, pushes, resetDatabase, seedOffProduct, signIn, type Session, givePlan } from "./test/harness.ts";

// Groups as members see them in the app: joining by typed code, notices from the owner, the member
// list the owner can hide, and replying to (and marking helpful) the owner's comments on a day.

const BREAD = "8480000123459";
let coach: Session;
let kira: Session;
let laura: Session;
let groupId: string;
let joinCode: string;

const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

before(async () => {
  installFakes();
  await resetDatabase();
  await seedOffProduct({ barcode: BREAD, brands: "Hacendado", name: "Pan rústico natural", nutriments: { energyKcal100g: 265 } });
  coach = await signIn("coach2@example.com");
  kira = await signIn("kira2@example.com");
  laura = await signIn("laura2@example.com");
  await api("PATCH", "/me", { body: { name: "Elena" }, token: coach.accessToken });
  await api("PATCH", "/me", { body: { name: "Kira" }, token: kira.accessToken });
  await api("PATCH", "/me", { body: { name: "Laura" }, token: laura.accessToken });
  await api("POST", "/me/devices", { body: { platform: "ios", token: "ExponentPushToken[coach]" }, token: coach.accessToken });
  await api("POST", "/me/devices", { body: { platform: "ios", token: "ExponentPushToken[kira]" }, token: kira.accessToken });
});
after(closeDatabase);

describe("joining with a code", () => {
  it("gives every new group a typed code and an owner title", async () => {
    await givePlan(coach.userId, "pro10");
    const created = await api("POST", "/groups", { body: { description: "Protein at every meal.", name: "Lean by Spring" }, token: coach.accessToken });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    groupId = created.body.group.id;
    joinCode = created.body.group.joinCode;
    assert.match(joinCode, /^LEAN-[2-9A-Z]{4}$/u);
    assert.equal(created.body.group.membersVisible, true);

    const titled = await api("PATCH", `/groups/${groupId}`, { body: { ownerTitle: "  Nutritionist " }, token: coach.accessToken });
    assert.equal(titled.status, 200);
    assert.equal(titled.body.group.ownerTitle, "Nutritionist");
    assert.equal((await api("PATCH", `/groups/${groupId}`, { body: { membersVisible: false }, token: kira.accessToken })).status, 403);
  });

  it("previews a group from a code however it is typed", async () => {
    const typed = joinCode.toLowerCase().replace("-", " ");
    const preview = await api("GET", `/invites/${encodeURIComponent(typed)}`, { token: kira.accessToken });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.invite.name, "Lean by Spring");
    assert.equal(preview.body.invite.ownerName, "Elena");
    assert.equal(preview.body.invite.ownerTitle, "Nutritionist");
    assert.equal(preview.body.invite.memberCount, 1);
    assert.equal(preview.body.invite.membersVisible, true);
    assert.equal(preview.body.membership, null);
    assert.equal((await api("GET", "/invites/NOPE-2222", { token: kira.accessToken })).status, 404);
    assert.equal((await api("GET", "/invites/x", { token: kira.accessToken })).status, 404);
  });

  it("joins by code with the sharing choice made on the invite", async () => {
    const joined = await api("POST", `/invites/${joinCode}/join`, { body: { sharing: false }, token: kira.accessToken });
    assert.equal(joined.status, 201, JSON.stringify(joined.body));
    assert.equal(joined.body.groupId, groupId);
    const list = await api("GET", "/groups", { token: kira.accessToken });
    assert.equal(list.body.groups[0].sharing, false);
    assert.equal(list.body.groups[0].ownerTitle, "Nutritionist");
    assert.equal(list.body.groups[0].unreadNotices, 0);

    assert.equal((await api("POST", `/invites/${joinCode}/join`, { token: laura.accessToken })).status, 201);
    const preview = await api("GET", `/invites/${joinCode}`, { token: kira.accessToken });
    assert.deepEqual(preview.body.membership, { groupId, role: "member" });
    assert.equal((await api("PATCH", `/groups/${groupId}/membership`, { body: { sharing: true }, token: kira.accessToken })).status, 200);
  });

  it("stops accepting the old code once the invite is rotated", async () => {
    const rotated = await api("POST", `/groups/${groupId}/invite/rotate`, { token: coach.accessToken });
    assert.equal(rotated.status, 201);
    const owner = await api("GET", `/groups/${groupId}`, { token: coach.accessToken });
    assert.notEqual(owner.body.group.joinCode, joinCode);
    assert.equal((await api("GET", `/invites/${joinCode}`)).status, 404);
    joinCode = owner.body.group.joinCode;
    assert.equal((await api("GET", `/invites/${joinCode}`)).status, 200);
  });
});

describe("creating a group in the app", () => {
  it("sets the owner title and member-list visibility at creation", async () => {
    await givePlan(kira.userId, "plus");
    const created = await api("POST", "/groups", {
      body: { membersVisible: false, name: "Morning Run Club", ownerTitle: "Running coach" },
      token: kira.accessToken,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.group.ownerTitle, "Running coach");
    assert.equal(created.body.group.membersVisible, false);
    const list = await api("GET", "/groups", { token: kira.accessToken });
    const roles = Object.fromEntries(list.body.groups.map((group: { name: string; role: string }) => [group.name, group.role]));
    assert.deepEqual(roles, { "Lean by Spring": "member", "Morning Run Club": "owner" }, "one account can run groups and be in others");
    assert.equal((await api("DELETE", `/groups/${created.body.group.id}`, { token: kira.accessToken })).status, 204);
  });
});

describe("member list visibility", () => {
  it("shows members the whole group, owner first", async () => {
    const detail = await api("GET", `/groups/${groupId}`, { token: kira.accessToken });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.group.memberCount, 3);
    assert.equal(detail.body.group.ownerId, coach.userId);
    assert.deepEqual(
      detail.body.group.members.map((member: { name: string }) => member.name),
      ["Elena", "Kira", "Laura"],
    );
  });

  it("hides the list from members when the owner turns it off", async () => {
    await api("PATCH", `/groups/${groupId}`, { body: { membersVisible: false }, token: coach.accessToken });
    const detail = await api("GET", `/groups/${groupId}`, { token: kira.accessToken });
    assert.equal(detail.body.group.membersVisible, false);
    assert.equal(detail.body.group.members, null);
    assert.equal(detail.body.group.memberCount, null, "the size is private too");
    const owner = await api("GET", `/groups/${groupId}`, { token: coach.accessToken });
    assert.equal(owner.body.group.members.length, 2, "the owner still sees everyone");
    assert.deepEqual(
      owner.body.group.members.map((member: { name: string; sharing: boolean }) => [member.name, member.sharing]),
      [["Kira", true], ["Laura", true]],
    );
    const preview = await api("GET", `/invites/${joinCode}`);
    assert.equal(preview.body.invite.membersVisible, false);
    assert.equal(preview.body.invite.memberCount, null);
    const list = await api("GET", "/groups", { token: kira.accessToken });
    assert.equal(list.body.groups.find((group: { id: string }) => group.id === groupId).memberCount, null);
    await api("PATCH", `/groups/${groupId}`, { body: { membersVisible: true }, token: coach.accessToken });
  });
});

describe("notices", () => {
  let pinnedId: string;

  it("lets only the owner post, and pushes members", async () => {
    pushes.length = 0;
    const posted = await api("POST", `/groups/${groupId}/notices`, {
      body: { body: "Aim for 25–30 grams of protein at each meal.", pinned: true, title: "Week 3 focus: protein" },
      token: coach.accessToken,
    });
    assert.equal(posted.status, 201, JSON.stringify(posted.body));
    pinnedId = posted.body.notice.id;
    await wait();
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]?.to, "ExponentPushToken[kira]");
    assert.equal(pushes[0]?.title, "Lean by Spring");
    assert.equal(pushes[0]?.body, "Week 3 focus: protein");

    await api("POST", `/groups/${groupId}/notices`, { body: { body: "Bring one question.", title: "Check-in on Thursday" }, token: coach.accessToken });
    const denied = await api("POST", `/groups/${groupId}/notices`, { body: { body: "x", title: "x" }, token: kira.accessToken });
    assert.equal(denied.status, 403);
    const empty = await api("POST", `/groups/${groupId}/notices`, { body: { body: " ", title: "Hi" }, token: coach.accessToken });
    assert.equal(empty.status, 400);
  });

  it("lists pinned notices first and counts unread ones until they are read", async () => {
    const detail = await api("GET", `/groups/${groupId}`, { token: kira.accessToken });
    const notices = detail.body.group.notices;
    assert.deepEqual(
      notices.map((notice: { title: string }) => notice.title),
      ["Week 3 focus: protein", "Check-in on Thursday"],
    );
    assert.equal(notices[0].pinned, true);
    assert.equal(notices[0].authorName, "Elena");
    assert.equal(detail.body.group.unreadNotices, 2);
    assert.equal((await api("GET", "/groups", { token: kira.accessToken })).body.groups[0].unreadNotices, 2);

    const feed = await api("GET", "/notifications", { token: kira.accessToken });
    assert.equal(feed.body.items.filter((item: { type: string }) => item.type === "group_notice").length, 2);
    const ownerFeed = await api("GET", "/notifications", { token: coach.accessToken });
    assert.equal(ownerFeed.body.items.some((item: { type: string }) => item.type === "group_notice"), false);

    assert.equal((await api("POST", `/groups/${groupId}/notices/read`, { token: kira.accessToken })).status, 201);
    const read = await api("GET", `/groups/${groupId}/notices`, { token: kira.accessToken });
    assert.equal(read.body.notices.every((notice: { unread: boolean }) => !notice.unread), true);
    assert.equal((await api("GET", "/groups", { token: kira.accessToken })).body.groups[0].unreadNotices, 0);
  });

  it("lets the owner unpin, edit and delete a notice", async () => {
    const edited = await api("PATCH", `/groups/${groupId}/notices/${pinnedId}`, { body: { pinned: false, title: "Week 3: protein" }, token: coach.accessToken });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.notice.pinned, false);
    assert.equal(edited.body.notice.title, "Week 3: protein");
    assert.equal((await api("DELETE", `/groups/${groupId}/notices/${pinnedId}`, { token: kira.accessToken })).status, 403);
    assert.equal((await api("DELETE", `/groups/${groupId}/notices/${pinnedId}`, { token: coach.accessToken })).status, 204);
    assert.equal((await api("PATCH", `/groups/${groupId}/notices/${pinnedId}`, { body: { pinned: true }, token: coach.accessToken })).status, 404);
    const left = await api("GET", `/groups/${groupId}/notices`, { token: coach.accessToken });
    assert.equal(left.body.notices.length, 1);
  });
});

describe("feedback on the day", () => {
  let itemId: string;
  let foodCommentId: string;

  it("describes the food a comment is about", async () => {
    const logged = await api("POST", "/meals/items", { body: { items: [{ amount: 75, barcode: BREAD, unit: "g" }], label: "breakfast" }, token: kira.accessToken });
    assert.equal(logged.status, 201, JSON.stringify(logged.body));
    itemId = logged.body.meal.items[0].id;
    const today = (await api("GET", "/diary", { token: kira.accessToken })).body.today;
    const sent = await api("POST", `/groups/${groupId}/messages`, {
      body: { body: "Try 50 grams of bread.", memberId: kira.userId, target: { mealItemId: itemId, type: "mealItem" } },
      token: coach.accessToken,
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    foodCommentId = sent.body.message.id;
    const food = sent.body.message.target.food;
    assert.equal(food.name, "Pan rústico natural");
    assert.equal(food.amount, 75);
    assert.equal(food.label, "breakfast");
    assert.equal(food.date, today);
    assert.equal(Math.round(food.energyKcal), 199);
    assert.equal(sent.body.message.helpful, false);
    assert.equal(sent.body.message.replyToId, null);
  });

  it("lets the member reply in the thread, pushes the owner and doesn't count it as unread", async () => {
    pushes.length = 0;
    await api("POST", `/groups/${groupId}/messages/read`, { token: kira.accessToken });
    const reply = await api("POST", `/groups/${groupId}/messages`, { body: { body: "OK, I will try that tomorrow.", replyToId: foodCommentId }, token: kira.accessToken });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    assert.equal(reply.body.message.replyToId, foodCommentId);
    assert.equal(reply.body.message.fromUserId, kira.userId);
    assert.equal(reply.body.message.target.mealItemId, itemId, "replies keep the thread's food");
    await wait();
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]?.to, "ExponentPushToken[coach]");
    assert.equal(pushes[0]?.title, "Kira · Lean by Spring");

    assert.equal((await api("GET", "/groups", { token: kira.accessToken })).body.groups[0].unreadCount, 0);
    const feed = await api("GET", "/notifications", { token: kira.accessToken });
    assert.equal(feed.body.items.some((item: { body?: string }) => item.body === "OK, I will try that tomorrow."), false);

    const coachThread = await api("GET", `/groups/${groupId}/messages?memberId=${kira.userId}`, { token: coach.accessToken });
    assert.equal(coachThread.body.messages[0].body, "OK, I will try that tomorrow.");
  });

  it("lets the owner answer a reply in the same thread", async () => {
    const memberReply = (await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken })).body.messages[0];
    const answer = await api("POST", `/groups/${groupId}/messages`, { body: { body: "Great!", replyToId: memberReply.id }, token: coach.accessToken });
    assert.equal(answer.status, 201, JSON.stringify(answer.body));
    assert.equal(answer.body.message.replyToId, foodCommentId, "replies always point at the first message");
    assert.equal(answer.body.message.toUserId, kira.userId);
    assert.equal((await api("GET", "/groups", { token: kira.accessToken })).body.groups[0].unreadCount, 1);
  });

  it("doesn't let members start threads or reply to someone else's", async () => {
    const start = await api("POST", `/groups/${groupId}/messages`, { body: { body: "Hi coach" }, token: kira.accessToken });
    assert.equal(start.status, 403);
    const foreign = await api("POST", `/groups/${groupId}/messages`, { body: { body: "Hi", replyToId: foodCommentId }, token: laura.accessToken });
    assert.equal(foreign.status, 403);
    const blank = await api("POST", `/groups/${groupId}/messages`, { body: { body: "  ", replyToId: foodCommentId }, token: kira.accessToken });
    assert.equal(blank.status, 400);
  });

  it("marks the owner's comment helpful and back", async () => {
    const marked = await api("PUT", `/groups/${groupId}/messages/${foodCommentId}/helpful`, { body: { helpful: true }, token: kira.accessToken });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    assert.equal(marked.body.message.helpful, true);
    const coachThread = await api("GET", `/groups/${groupId}/messages?memberId=${kira.userId}`, { token: coach.accessToken });
    assert.equal(coachThread.body.messages.find((message: { id: string }) => message.id === foodCommentId).helpful, true);

    const own = (await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken })).body.messages.find(
      (message: { fromUserId: string }) => message.fromUserId === kira.userId,
    );
    assert.equal((await api("PUT", `/groups/${groupId}/messages/${own.id}/helpful`, { body: { helpful: true }, token: kira.accessToken })).status, 404);
    assert.equal((await api("PUT", `/groups/${groupId}/messages/${foodCommentId}/helpful`, { body: { helpful: true }, token: laura.accessToken })).status, 404);

    const unmarked = await api("PUT", `/groups/${groupId}/messages/${foodCommentId}/helpful`, { body: { helpful: false }, token: kira.accessToken });
    assert.equal(unmarked.body.message.helpful, false);
  });

  it("keeps the comment when the food is deleted, without its details", async () => {
    await api("DELETE", `/meal-items/${itemId}`, { token: kira.accessToken });
    const thread = await api("GET", `/groups/${groupId}/messages`, { token: kira.accessToken });
    const comment = thread.body.messages.find((message: { id: string }) => message.id === foodCommentId);
    assert.equal(comment.target.food, null);
    assert.equal(comment.target.mealItemId, itemId);
  });
});
