export const FEEDBACK_STATUS = {
  none: { label: 'Not started', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
};

export const RATING_LABELS = {
  1: 'Needs significant improvement',
  2: 'Needs improvement',
  3: 'Developing',
  4: 'Good',
  5: 'Excellent',
};

export const SPEAKING_SKILLS = [
  { key: 'fluency', label: 'Fluency' },
  { key: 'pronunciation', label: 'Pronunciation' },
  { key: 'confidence', label: 'Confidence' },
];

/** One-click starter phrases for the evaluation sections; teachers edit them after inserting. */
export const QUICK_PHRASES = {
  didWell: [
    'Participated actively',
    'Spoke confidently',
    'Used the new vocabulary correctly',
    'Pronounced words clearly',
    'Answered in full sentences',
    'Completed all the tasks',
  ],
  needsImprovement: [
    'Pronunciation of difficult sounds',
    'Grammar accuracy when speaking',
    'Using a wider range of vocabulary',
    'Speaking in longer sentences',
    'Listening for details',
    'Confidence when speaking',
  ],
  recommendation: [
    'Review today’s vocabulary',
    'Practise speaking for ten minutes a day',
    'Continue the pronunciation exercises',
    'Complete the homework before the next class',
    'Practise giving longer answers',
    'Read the next unit in advance',
  ],
};

/** Adds a phrase to existing text as its own sentence. */
export function appendPhrase(text, phrase) {
  const current = text.trimEnd();
  if (!current) return `${phrase}.`;
  return `${current}${/[.!?]$/.test(current) ? '' : '.'} ${phrase}.`;
}

export const REQUIRED_COUNT = 7;

/** Must match REQUIRED_ON_SUBMIT in server/src/services/feedback.service.js. */
export function missingForSubmit(values) {
  const errors = {};
  if (!values.whatWeLearned.trim()) errors.whatWeLearned = 'Describe what you covered in the lesson.';
  for (const { key, label } of SPEAKING_SKILLS) {
    if (!values.speaking[key]) errors[`speaking.${key}`] = `Rate ${label.toLowerCase()}.`;
  }
  if (!values.didWell.trim()) errors.didWell = 'Describe what the student did well.';
  if (!values.needsImprovement.trim()) errors.needsImprovement = 'Describe what needs improvement.';
  if (!values.recommendation.trim()) errors.recommendation = 'Add a recommendation for the next lesson.';
  return errors;
}

export const EMPTY_FEEDBACK = {
  book: '',
  whatWeLearned: '',
  vocabulary: { newWords: '', independentWords: '' },
  grammar: { topic: '', understanding: '', accuracy: '' },
  speaking: { fluency: null, pronunciation: null, confidence: null },
  didWell: '',
  needsImprovement: '',
  recommendation: '',
  notes: '',
};

/** Form values from a saved feedback record. */
export const valuesFrom = (feedback) => ({
  book: feedback.book ?? '',
  whatWeLearned: feedback.whatWeLearned ?? '',
  vocabulary: { newWords: feedback.vocabulary?.newWords ?? '', independentWords: feedback.vocabulary?.independentWords ?? '' },
  grammar: {
    topic: feedback.grammar?.topic ?? '',
    understanding: feedback.grammar?.understanding ?? '',
    accuracy: feedback.grammar?.accuracy ?? '',
  },
  speaking: {
    fluency: feedback.speaking?.fluency ?? null,
    pronunciation: feedback.speaking?.pronunciation ?? null,
    confidence: feedback.speaking?.confidence ?? null,
  },
  didWell: feedback.didWell ?? '',
  needsImprovement: feedback.needsImprovement ?? '',
  recommendation: feedback.recommendation ?? '',
  notes: feedback.notes ?? '',
});

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue–Thu–Sat" for a weekly series, or the lesson's own weekday. */
export function schedulePattern(lesson, sessions = []) {
  const series = lesson.seriesId ? sessions.filter((session) => session.seriesId === lesson.seriesId) : [];
  const days = [...new Set((series.length ? series : [lesson]).map((session) => new Date(session.startsAt).getDay()))]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  return days.map((day) => WEEKDAY_SHORT[day]).join('–');
}

export const formatLessonDate = (value) => new Date(value).toLocaleDateString([], {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
});
export const formatShortDate = (value) => new Date(value).toLocaleDateString([], {
  weekday: 'short', month: 'short', day: 'numeric',
});
export const formatTime = (value) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
