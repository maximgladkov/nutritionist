"use client";

import type { GoalRing } from "@/lib/goal-values";
import { useId } from "react";

export const DAY_RING_SIZE = 72;

export function CompactGoalRing({
  empty,
  rings,
}: {
  readonly empty: boolean;
  readonly rings: readonly GoalRing[];
}) {
  if (empty) {
    return <div className="bg-surface-secondary size-[72px] rounded-full" />;
  }
  if (rings.length === 0) {
    return <div className="bg-accent/15 size-[72px] rounded-full" />;
  }
  return <GoalRingSvg rings={rings} />;
}

function GoalRingSvg({ rings }: { readonly rings: readonly GoalRing[] }) {
  const reactId = useId();
  const size = DAY_RING_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const count = rings.length;
  const barSize = count <= 2 ? 5.5 : count <= 4 ? 4.5 : 3.5;
  const gap = 1.4;
  const outer = size / 2 - 2;
  const drawn = [...rings].reverse();

  return (
    <svg aria-hidden="true" className="size-[72px]" viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {drawn.map((ring) => (
          <pattern
            height="4"
            id={overPatternId(reactId, ring.id)}
            key={ring.id}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="4"
          >
            <rect fill={ring.fill} height="4" width="4" />
            <rect fill="var(--foreground)" fillOpacity="0.4" height="4" width="1.6" />
          </pattern>
        ))}
      </defs>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {drawn.map((ring, index) => {
          const radius = outer - barSize / 2 - index * (barSize + gap);
          const circumference = 2 * Math.PI * radius;
          const progress = (ring.value / 100) * circumference;
          const over = (ring.over / 100) * circumference;
          return (
            <g key={ring.id}>
              <circle
                cx={cx}
                cy={cy}
                fill="none"
                r={radius}
                stroke="color-mix(in oklch, var(--foreground) 12%, transparent)"
                strokeWidth={barSize}
              />
              <circle
                cx={cx}
                cy={cy}
                fill="none"
                r={radius}
                stroke={ring.fill}
                strokeDasharray={`${progress} ${circumference}`}
                strokeLinecap="round"
                strokeWidth={barSize}
              />
              {ring.over > 0 ? (
                <circle
                  cx={cx}
                  cy={cy}
                  fill="none"
                  r={radius}
                  stroke={`url(#${overPatternId(reactId, ring.id)})`}
                  strokeDasharray={`${over} ${circumference}`}
                  strokeLinecap="round"
                  strokeWidth={barSize}
                />
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function overPatternId(reactId: string, ringId: string): string {
  return `goal-over-${reactId.replaceAll(":", "")}-${ringId}`;
}
