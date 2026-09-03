import { pickSurvivor, selectLiveUserId, type UserRecord } from "./identity-core";
import { planGoalMerge } from "./goal-values";
import { generateLinkCodeValue } from "./link-command";
import { mergeMemoryFiles, parseMemoryFile, serializeMemoryFile } from "./memory-format";
import type { ChannelProvider } from "./principal";
import { prisma } from "./prisma";

const LINK_CODE_TTL_MS = 10 * 60 * 1000;

export type ResolveChannelUserInput = {
  name?: string;
  provider: ChannelProvider;
  providerUserId: string;
};

export async function resolveChannelUser(input: ResolveChannelUserInput): Promise<UserRecord> {
  const existing = await prisma.channelIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: input.provider,
        providerUserId: input.providerUserId,
      },
    },
    include: { user: true },
  });
  if (existing) {
    return toUserRecord(existing.user);
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        identities: {
          create: {
            provider: input.provider,
            providerUserId: input.providerUserId,
          },
        },
      },
    });
    return toUserRecord(user);
  });
}

export async function saveChannelThreadId(input: {
  provider: "telegram" | "whatsapp";
  providerUserId: string;
  threadId: string;
}): Promise<void> {
  await prisma.channelIdentity.updateMany({
    where: {
      provider: input.provider,
      providerUserId: input.providerUserId,
    },
    data: { threadId: input.threadId },
  });
}

export async function ensureEmailIdentity(userId: string, email: string): Promise<void> {
  await prisma.channelIdentity.upsert({
    where: {
      provider_providerUserId: {
        provider: "email",
        providerUserId: email.toLowerCase(),
      },
    },
    create: {
      provider: "email",
      providerUserId: email.toLowerCase(),
      userId,
    },
    update: {},
  });
}

export async function createLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  const code = generateLinkCodeValue();
  await prisma.linkCode.create({
    data: { code, expiresAt, userId },
  });
  return { code, expiresAt };
}

export type ConsumeLinkCodeResult =
  | { status: "already"; user: UserRecord }
  | { status: "linked"; user: UserRecord }
  | { status: "merged"; user: UserRecord }
  | { status: "expired" }
  | { status: "invalid" }
  | { status: "both-have-email" };

export async function consumeLinkCode(
  code: string,
  consumingUserId: string,
): Promise<ConsumeLinkCodeResult> {
  const normalized = code.trim().toUpperCase();
  const link = await prisma.linkCode.findUnique({
    where: { code: normalized },
    include: { user: true },
  });
  if (!link || link.consumedAt) {
    return { status: "invalid" };
  }
  if (link.expiresAt.getTime() <= Date.now()) {
    return { status: "expired" };
  }

  const consumer = await prisma.user.findUnique({ where: { id: consumingUserId } });
  if (!consumer) {
    return { status: "invalid" };
  }

  const decision = pickSurvivor(toUserRecord(link.user), toUserRecord(consumer));
  if (decision.kind === "same") {
    await prisma.linkCode.update({
      where: { id: link.id },
      data: { consumedAt: new Date() },
    });
    return { status: "already", user: decision.user };
  }
  if (decision.kind === "both-have-email") {
    return { status: "both-have-email" };
  }

  await mergeUsers(decision.survivor.id, decision.absorbed.id);
  await prisma.linkCode.update({
    where: { id: link.id },
    data: { consumedAt: new Date() },
  });
  return { status: "merged", user: decision.survivor };
}

export async function resolveAuthenticatedUserId(input: {
  eveSessionId: string;
  principalId?: string;
}): Promise<string | undefined> {
  const session = await prisma.agentSession.findUnique({
    where: { eveSessionId: input.eveSessionId },
    select: { userId: true },
  });
  if (session) {
    return session.userId;
  }
  const principal = input.principalId
    ? await prisma.user.findUnique({
        where: { id: input.principalId },
        select: { id: true },
      })
    : null;
  return selectLiveUserId({
    sessionUserId: undefined,
    principalId: input.principalId,
    principalExists: Boolean(principal),
  });
}

export async function mergeUsers(survivorId: string, absorbedId: string): Promise<void> {
  if (survivorId === absorbedId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.channelIdentity.updateMany({
      where: { userId: absorbedId },
      data: { userId: survivorId },
    });
    await tx.agentSession.updateMany({
      where: { userId: absorbedId },
      data: { userId: survivorId },
    });
    await tx.conversationMessage.updateMany({
      where: { userId: absorbedId },
      data: { userId: survivorId },
    });
    await tx.catalogProduct.updateMany({
      where: { createdByUserId: absorbedId },
      data: { createdByUserId: survivorId },
    });
    await tx.meal.updateMany({
      where: { userId: absorbedId },
      data: { userId: survivorId },
    });
    const survivorReminderLabels = new Set(
      (
        await tx.mealReminder.findMany({
          where: { userId: survivorId },
          select: { label: true },
        })
      ).map((row) => row.label),
    );
    const absorbedReminders = await tx.mealReminder.findMany({
      where: { userId: absorbedId },
    });
    for (const reminder of absorbedReminders) {
      if (survivorReminderLabels.has(reminder.label)) {
        await tx.mealReminder.delete({ where: { id: reminder.id } });
        continue;
      }
      await tx.mealReminder.update({
        where: { id: reminder.id },
        data: { userId: survivorId },
      });
    }
    const survivorGoalKinds = new Set(
      (
        await tx.userGoal.findMany({
          where: { userId: survivorId },
          select: { kind: true },
        })
      ).map((row) => row.kind),
    );
    const absorbedGoals = await tx.userGoal.findMany({
      where: { userId: absorbedId },
      select: { id: true, kind: true },
    });
    const { deleteIds, moveIds } = planGoalMerge(survivorGoalKinds, absorbedGoals);
    if (deleteIds.length > 0) {
      await tx.userGoal.deleteMany({ where: { id: { in: deleteIds } } });
    }
    if (moveIds.length > 0) {
      await tx.userGoal.updateMany({
        where: { id: { in: moveIds } },
        data: { userId: survivorId },
      });
    }
    await tx.linkCode.updateMany({
      where: { userId: absorbedId, consumedAt: null },
      data: { userId: survivorId },
    });

    const absorbedProfile = await tx.userProfile.findUnique({ where: { userId: absorbedId } });
    if (absorbedProfile) {
      const survivorProfile = await tx.userProfile.findUnique({ where: { userId: survivorId } });
      if (!survivorProfile) {
        await tx.userProfile.delete({ where: { userId: absorbedId } });
        await tx.userProfile.create({
          data: {
            userId: survivorId,
            notes: absorbedProfile.notes,
            country: absorbedProfile.country,
            locale: absorbedProfile.locale,
            timezone: absorbedProfile.timezone,
          },
        });
      } else {
        const data: {
          notes?: string;
          country?: string | null;
          locale?: string | null;
          timezone?: string | null;
        } = {};
        if (!survivorProfile.notes && absorbedProfile.notes) {
          data.notes = absorbedProfile.notes;
        }
        if (!survivorProfile.country && absorbedProfile.country) {
          data.country = absorbedProfile.country;
        }
        if (!survivorProfile.locale && absorbedProfile.locale) {
          data.locale = absorbedProfile.locale;
        }
        if (!survivorProfile.timezone && absorbedProfile.timezone) {
          data.timezone = absorbedProfile.timezone;
        }
        if (Object.keys(data).length > 0) {
          await tx.userProfile.update({
            where: { userId: survivorId },
            data,
          });
        }
      }
      await tx.userProfile.deleteMany({ where: { userId: absorbedId } });
    }

    const absorbedDocs = await tx.memoryDocument.findMany({ where: { userId: absorbedId } });
    for (const absorbedDoc of absorbedDocs) {
      const survivorDoc = await tx.memoryDocument.findUnique({
        where: { userId_slot: { userId: survivorId, slot: absorbedDoc.slot } },
      });
      const merged = mergeMemoryFiles(
        parseMemoryFile(survivorDoc?.content ?? ""),
        parseMemoryFile(absorbedDoc.content),
      );
      await tx.memoryDocument.upsert({
        where: { userId_slot: { userId: survivorId, slot: absorbedDoc.slot } },
        create: {
          userId: survivorId,
          slot: absorbedDoc.slot,
          content: serializeMemoryFile(merged),
          version: 1,
          scopeKey: survivorDoc?.scopeKey ?? absorbedDoc.scopeKey,
        },
        update: {
          content: serializeMemoryFile(merged),
          version: { increment: 1 },
        },
      });
    }
    await tx.memoryDocument.deleteMany({ where: { userId: absorbedId } });

    const absorbed = await tx.user.findUnique({ where: { id: absorbedId } });
    const survivor = await tx.user.findUnique({ where: { id: survivorId } });
    if (absorbed && survivor && !survivor.name && absorbed.name) {
      await tx.user.update({ where: { id: survivorId }, data: { name: absorbed.name } });
    }

    await tx.session.deleteMany({ where: { userId: absorbedId } });
    await tx.account.deleteMany({ where: { userId: absorbedId } });
    await tx.user.delete({ where: { id: absorbedId } });
  });
}

function toUserRecord(user: { id: string; email: string | null; name: string | null }): UserRecord {
  return { id: user.id, email: user.email, name: user.name };
}
