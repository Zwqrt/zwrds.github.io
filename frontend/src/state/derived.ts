import { useMemo } from 'react';
import type { Grade, Subject } from '../data/types';
import { overall, summarizeSubject, type SubjectSummary } from '../lib/grading';
import { useStore } from './store';

export interface SubjectView {
  subject: Subject;
  grades: Grade[];
  summary: SubjectSummary;
}

export function useSubjectViews(includeHidden = false): SubjectView[] {
  const { subjects, grades, settings } = useStore();
  return useMemo(() => {
    const by = new Map<string, Grade[]>();
    for (const g of grades) {
      const l = by.get(g.subject_id) ?? [];
      l.push(g);
      by.set(g.subject_id, l);
    }
    return subjects
      .filter((s) => (includeHidden || !s.hidden) && s.period === settings.period)
      .map((subject) => {
        const list = (by.get(subject.id) ?? []).sort(
          (a, b) => a.date.localeCompare(b.date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''),
        );
        return { subject, grades: list, summary: summarizeSubject(subject, list, settings) };
      });
  }, [subjects, grades, settings, includeHidden]);
}

export function useOverall() {
  const views = useSubjectViews();
  return useMemo(() => overall(views.map((v) => v.summary)), [views]);
}
