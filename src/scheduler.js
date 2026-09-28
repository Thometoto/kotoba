import { fsrs, Rating } from 'ts-fsrs';

const engine = fsrs({
  request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false,
  enable_short_term: true, learning_steps: ['1h'], relearning_steps: ['1h'],
});

// Keep longer FSRS intervals, but never repeat a Hard card within two hours.
// Both the button preview and the saved result pass through the same rule.
function applyMinimum(result, now, rating) {
  if (rating !== Rating.Hard) return result;
  const minimum = new Date(now).getTime() + 2 * 60 * 60 * 1000;
  if (result.card.due.getTime() >= minimum) return result;
  return { ...result, card: { ...result.card, due: new Date(minimum) } };
}

export const scheduler = {
  next(card, now, rating) {
    return applyMinimum(engine.next(card, now, rating), now, rating);
  },
  repeat(card, now) {
    const preview = engine.repeat(card, now);
    return Object.fromEntries([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
      .map(rating => [rating, applyMinimum(preview[rating], now, rating)]));
  },
};
