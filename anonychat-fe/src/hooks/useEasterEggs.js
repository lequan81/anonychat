import { useState, useEffect, useRef } from 'react';
import { ACTIVITY_MILESTONES, EVENT_ICONS } from './useWebSocket.js';

function getIntensity(count) {
  if (count <= 25) return 1;
  if (count <= 100) return 2;
  if (count <= 500) return 3;
  return 4;
}

function getNewMilestones(previousCount, currentCount) {
  const milestones = ACTIVITY_MILESTONES.filter(
    (value) => value > previousCount && value <= currentCount
  );
  if (currentCount > 1000) {
    for (
      let value = Math.max(2000, Math.ceil((previousCount + 1) / 1000) * 1000);
      value <= currentCount;
      value += 1000
    ) {
      milestones.push(value);
    }
  }
  return milestones;
}

/**
 * Manages chat activity milestones, celebration toasts, and dynamic confetti particle bursts.
 *
 * @param {Array} messages - Chat message history
 * @param {number} activityEventCount - Total activity events logged in session
 * @param {React.MutableRefObject<Map>} eventMilestoneTypesRef - Types of events at milestones
 * @returns {{ activeCelebration: object | undefined }}
 */
export function useEasterEggs(messages, activityEventCount, eventMilestoneTypesRef) {
  const [easterEggQueue, setEasterEggQueue] = useState([]);
  const lastCelebratedMilestonesRef = useRef({ messages: 0, events: 0 });
  const celebrationRevisionRef = useRef(0);

  // Milestone / Celebration Tracker
  useEffect(() => {
    const messageCount = messages.filter(
      (message) => message.type === 'text' || message.type === 'image'
    ).length;

    if (messageCount === 0) {
      lastCelebratedMilestonesRef.current.messages = 0;
    }
    if (activityEventCount === 0) {
      lastCelebratedMilestonesRef.current.events = 0;
    }
    if (messageCount === 0 && activityEventCount === 0) {
      setEasterEggQueue((queue) => (queue.length > 0 ? [] : queue));
    }

    const newMessageMilestones = getNewMilestones(
      lastCelebratedMilestonesRef.current.messages,
      messageCount
    );
    const newEventMilestones = getNewMilestones(
      lastCelebratedMilestonesRef.current.events,
      activityEventCount
    );

    lastCelebratedMilestonesRef.current = {
      messages: Math.max(lastCelebratedMilestonesRef.current.messages, messageCount),
      events: Math.max(lastCelebratedMilestonesRef.current.events, activityEventCount)
    };

    if (newMessageMilestones.length > 0 || newEventMilestones.length > 0) {
      const chatMessages = messages.filter(
        (message) => message.type === 'text' || message.type === 'image'
      );
      const celebrationsWithIcons = [
        ...newMessageMilestones.map((count) => ({
          kind: 'messages',
          count,
          icon: EVENT_ICONS[chatMessages[count - 1]?.type] ?? '💬'
        })),
        ...newEventMilestones.map((count) => ({
          kind: 'events',
          count,
          icon: EVENT_ICONS[eventMilestoneTypesRef.current.get(count)] ?? '✨'
        }))
      ];
      setEasterEggQueue((queue) => [
        ...queue,
        ...celebrationsWithIcons.map((celebration) => ({
          ...celebration,
          intensity: getIntensity(celebration.count),
          revision: ++celebrationRevisionRef.current
        }))
      ]);
    }
  }, [messages, activityEventCount, eventMilestoneTypesRef]);

  const activeCelebration = easterEggQueue[0];
  const activeCelebrationRevision = activeCelebration?.revision;

  // Auto-dismiss celebration toast after 7.8s
  useEffect(() => {
    if (activeCelebrationRevision === undefined) return undefined;

    const timeout = window.setTimeout(
      () => setEasterEggQueue((queue) => queue.slice(1)),
      7800
    );
    return () => window.clearTimeout(timeout);
  }, [activeCelebrationRevision]);

  // Dynamic Confetti Trigger on Easter Egg Milestones
  const activeCelebrationIntensity = activeCelebration?.intensity;
  const activeCelebrationIcon = activeCelebration?.icon;

  useEffect(() => {
    if (
      activeCelebrationIntensity === undefined ||
      !activeCelebrationIcon ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined;
    }

    let cancelled = false;
    let timer;

    import('canvas-confetti').then((module) => {
      if (cancelled) return;
      const confetti = module.default;
      const intensity = activeCelebrationIntensity;
      const iconShape = confetti.shapeFromText({
        text: activeCelebrationIcon,
        scalar: 1.4 + intensity * 0.12
      });

      const burst = (particleRatio, options) =>
        confetti({
          angle: options.angle,
          spread: options.spread,
          startVelocity: 34 + intensity * 6,
          decay: 0.9,
          gravity: 0.85,
          ticks: 180 + intensity * 50,
          particleCount: Math.round((18 + intensity * 18) * particleRatio),
          origin: { x: options.originX, y: 0.1 },
          colors: ['#a7f3d0', '#bfdbfe', '#fde68a', '#fbcfe8', '#ffffff'],
          scalar: 0.9 + intensity * 0.12,
          shapes: [iconShape]
        });

      burst(0.5, { angle: 60, spread: 55, originX: 0.12 });
      burst(0.5, { angle: 120, spread: 55, originX: 0.88 });

      if (intensity >= 3) {
        timer = window.setTimeout(() => {
          if (!cancelled) burst(0.35, { angle: 90, spread: 100, originX: 0.5 });
        }, 240);
      }
    });

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeCelebrationIcon, activeCelebrationIntensity, activeCelebrationRevision]);

  return { activeCelebration };
}

export default useEasterEggs;
