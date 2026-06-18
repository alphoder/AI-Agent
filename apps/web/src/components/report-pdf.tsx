'use client';

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

export interface ReportData {
  scenarioTitle: string;
  language: string;
  date: string;
  overall_score: number;
  criteria_scores: { criterion_name: string; score: number; weight: number; justification: string }[];
  strengths: string[];
  improvements: string[];
  narrative_feedback: string | null;
  body_language_score: number | null;
  body_language_feedback: string | null;
}

// Default score bands (defined by the app; rubric itself is user-editable).
export function band(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Excellent', color: '#2563eb' };
  if (score >= 70) return { label: 'Proficient', color: '#059669' };
  if (score >= 40) return { label: 'Developing', color: '#d97706' };
  return { label: 'Needs work', color: '#e11d48' };
}

const C = {
  indigo: '#2563eb',
  ink: '#0f172a',
  slate: '#475569',
  light: '#94a3b8',
  line: '#e2e8f0',
  bg: '#f8fafc',
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: C.ink, fontFamily: 'Helvetica' },
  bandTop: { height: 6, backgroundColor: C.indigo, marginBottom: 18, borderRadius: 3 },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 10, color: C.slate, marginTop: 3 },
  scoreRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 8 },
  scoreCard: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14, backgroundColor: C.bg },
  scoreLabel: { fontSize: 8, color: C.light, textTransform: 'uppercase', letterSpacing: 1 },
  scoreVal: { fontSize: 30, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  pill: { fontSize: 8, color: '#fff', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, alignSelf: 'flex-start', marginTop: 6 },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 8, color: C.ink },
  crit: { marginBottom: 10 },
  critHead: { flexDirection: 'row', justifyContent: 'space-between' },
  critName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  critMeta: { color: C.slate, fontSize: 9 },
  bar: { height: 5, backgroundColor: C.line, borderRadius: 3, marginTop: 4, marginBottom: 3 },
  barFill: { height: 5, backgroundColor: C.indigo, borderRadius: 3 },
  just: { color: C.slate, fontSize: 9, lineHeight: 1.4 },
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 12 },
  colTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 6 },
  li: { fontSize: 9, color: C.slate, marginBottom: 3, lineHeight: 1.4 },
  narrative: { fontSize: 9.5, color: C.slate, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 8, color: C.light, textAlign: 'center', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
});

export function ReportPDF({ data }: { data: ReportData }) {
  const ob = band(data.overall_score);
  const bl = data.body_language_score != null ? band(data.body_language_score) : null;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.bandTop} />
        <Text style={s.h1}>Session Report</Text>
        <Text style={s.sub}>{data.scenarioTitle}  ·  {data.language.toUpperCase()}  ·  {data.date}</Text>

        <View style={s.scoreRow}>
          <View style={s.scoreCard}>
            <Text style={s.scoreLabel}>Overall</Text>
            <Text style={[s.scoreVal, { color: ob.color }]}>{Math.round(data.overall_score)}<Text style={{ fontSize: 12, color: C.light }}> / 100</Text></Text>
            <Text style={[s.pill, { backgroundColor: ob.color }]}>{ob.label}</Text>
          </View>
          <View style={s.scoreCard}>
            <Text style={s.scoreLabel}>Body language</Text>
            {data.body_language_score != null && bl ? (
              <>
                <Text style={[s.scoreVal, { color: bl.color }]}>{Math.round(data.body_language_score)}<Text style={{ fontSize: 12, color: C.light }}> / 100</Text></Text>
                <Text style={[s.pill, { backgroundColor: bl.color }]}>{bl.label}</Text>
              </>
            ) : (
              <Text style={[s.just, { marginTop: 8 }]}>Camera was off — no body-language read.</Text>
            )}
          </View>
        </View>

        {data.body_language_feedback ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Body language</Text>
            <Text style={s.narrative}>{data.body_language_feedback}</Text>
          </View>
        ) : null}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Rubric breakdown</Text>
          {data.criteria_scores.map((c, i) => (
            <View key={i} style={s.crit}>
              <View style={s.critHead}>
                <Text style={s.critName}>{c.criterion_name}</Text>
                <Text style={s.critMeta}>{c.score}/5 · weight {c.weight}%</Text>
              </View>
              <View style={s.bar}><View style={[s.barFill, { width: `${(c.score / 5) * 100}%` }]} /></View>
              <Text style={s.just}>{c.justification}</Text>
            </View>
          ))}
        </View>

        <View style={[s.section, s.twoCol]}>
          <View style={s.col}>
            <Text style={[s.colTitle, { color: '#059669' }]}>Strengths</Text>
            {data.strengths.map((x, i) => <Text key={i} style={s.li}>• {x}</Text>)}
          </View>
          <View style={s.col}>
            <Text style={[s.colTitle, { color: '#d97706' }]}>To improve</Text>
            {data.improvements.map((x, i) => <Text key={i} style={s.li}>• {x}</Text>)}
          </View>
        </View>

        {data.narrative_feedback ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Coach&apos;s notes</Text>
            <Text style={s.narrative}>{data.narrative_feedback}</Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed>Generated by SpeakCoach · {data.date}</Text>
      </Page>
    </Document>
  );
}
