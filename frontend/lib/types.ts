// lib/types.ts
export type Course = { id: number; name: string; short_code: string };
export type StandingEntry = { id: number; course: Course };

export type Stage = 'GROUP' | 'QF' | 'SF' | 'FINAL' | 'THIRD';
export type Status = 'SCHEDULED' | 'LIVE' | 'FT';

export interface Match {
  id: number;
  stage: Stage;
  status: Status;
  scheduled_at: string;
  entry1: Course;
  entry2: Course;
  entry1_id: number;
  entry2_id: number;
  winner_entry?: number | null;
  winner_entry_id?: number | null;
}

export interface MatchVotesSummary {
  match: number;
  total: number;
  entry1: { entry_id: number; course: Course; count: number; prob: number };
  entry2: { entry_id: number; course: Course; count: number; prob: number };
}

export type MyMatchVote = { match: Match; pick_entry: { id: number } };

export interface MyBetsPayload {
  match_votes: MyMatchVote[];
  question_votes: unknown[];
}
