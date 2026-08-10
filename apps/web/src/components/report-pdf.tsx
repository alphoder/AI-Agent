/* eslint-disable jsx-a11y/alt-text */
// Explicit React import: Next does not need it, but it lets this component be
// rendered outside Next (scripts/render-report-sample.tsx) so the PDF can be
// checked without clicking Download in a browser.
import React from 'react';
import {
  Document, Page, View, Text, StyleSheet,
  Svg, Path, Circle, Line, Polygon, Rect, G,
} from '@react-pdf/renderer';
import {
  donutPath, pieSlices, weakestFirst, contribution, scoreBand, CRITERION_PASS,
} from '@/lib/report-charts';

export interface ReportData {
  scenarioTitle: string;
  language: string;
  date: string;
  overall_score: number;
  criteria_scores: { criterion_name: string; score: number; weight: number; justification: string; passed?: boolean; off_rubric?: boolean }[];
  strengths: string[];
  improvements: string[];
  narrative_feedback: string | null;
  body_language_score: number | null;
  body_language_feedback: string | null;
  /** Conversational analytics, parsed from the scorer. Any may be absent. */
  talkRatio?: number | null;
  questions?: number | null;
  fillers?: number | null;
  durationSec?: number | null;
  passMark?: number;
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
  green: '#059669',
  amber: '#d97706',
  red: '#e11d48',
  ink: '#0f172a',
  slate: '#475569',
  light: '#94a3b8',
  line: '#e2e8f0',
  track: '#eef2f7',
  bg: '#f8fafc',
};

const tone = (score: number) =>
  ({ strong: C.green, ok: C.amber, weak: C.red }[scoreBand(score)]);

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: C.ink, fontFamily: 'Helvetica' },
  bandTop: { height: 6, backgroundColor: C.indigo, marginBottom: 14, borderRadius: 3 },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9.5, color: C.slate, marginTop: 3 },

  verdict: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 14, backgroundColor: C.bg },
  verdictBody: { flex: 1 },
  verdictLine: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  verdictSub: { fontSize: 9, color: C.slate, marginTop: 3, lineHeight: 1.4 },
  pill: { fontSize: 8, color: '#fff', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 5 },

  row: { flexDirection: 'row', gap: 12, marginTop: 14 },
  card: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 },
  cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 8 },

  statRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 9 },
  statLabel: { fontSize: 7, color: C.light, textTransform: 'uppercase', letterSpacing: 0.8 },
  statVal: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  statHint: { fontSize: 7, color: C.light, marginTop: 1 },

  section: { marginTop: 16 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sectionHint: { fontSize: 8, color: C.light, marginBottom: 8 },

  crit: { marginBottom: 9 },
  critHead: { flexDirection: 'row', justifyContent: 'space-between' },
  critName: { fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
  critMeta: { color: C.slate, fontSize: 8.5 },
  just: { color: C.slate, fontSize: 8.5, lineHeight: 1.4, marginTop: 3 },

  col: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  swatch: { width: 7, height: 7, borderRadius: 2, marginTop: 2 },
  legendName: { fontSize: 7.5, color: C.ink, lineHeight: 1.3 },
  legendMeta: { fontSize: 6.5, color: C.light },
  li: { fontSize: 8.5, color: C.slate, marginBottom: 4, lineHeight: 1.4 },
  narrative: { fontSize: 9, color: C.slate, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 8, color: C.light, textAlign: 'center', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 7 },
});

/** Score as a ring, the same mark the screen uses. */
function Donut({ score, size = 78, label }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 7;
  const colour = tone(score);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.track} strokeWidth={7} fill="none" />
      <Path d={donutPath(score, size / 2, size / 2, r)} stroke={colour} strokeWidth={7} fill="none" strokeLinecap="round" />
      <Text x={size / 2} y={size / 2 + 5} style={{ fontSize: 17, fontFamily: 'Helvetica-Bold' }} fill={C.ink} textAnchor="middle">
        {String(Math.round(score))}
      </Text>
      {label && (
        <Text x={size / 2} y={size / 2 + 16} style={{ fontSize: 6.5 }} fill={C.light} textAnchor="middle">{label}</Text>
      )}
    </Svg>
  );
}

/** The rubric as a pie. Same geometry as the on-screen chart. */
function RubricPie({ criteria, size = 132 }: { criteria: ReportData['criteria_scores']; size?: number }) {
  const slices = pieSlices(criteria, size / 2, size / 2, size / 2 - 2, size / 2 - 26);
  if (slices.length === 0) return null;
  const passed = slices.filter((x) => x.passed).length;
  return (
    <Svg width={size} height={size}>
      <G>
        {slices.map((x, i) => (
          <Path key={i} d={x.path} fill={x.passed ? C.green : C.red} fillOpacity={x.passed ? 0.9 : 0.75}
            stroke="#ffffff" strokeWidth={1.2} />
        ))}
        <Text x={size / 2} y={size / 2 + 1} style={{ fontSize: 15, fontFamily: 'Helvetica-Bold' }} fill={C.ink} textAnchor="middle">
          {`${passed}/${slices.length}`}
        </Text>
        <Text x={size / 2} y={size / 2 + 11} style={{ fontSize: 6 }} fill={C.light} textAnchor="middle">passed</Text>
      </G>
    </Svg>
  );
}

/** Legend for the pie: full criterion names, which do not fit around a circle. */
function PieLegend({ criteria }: { criteria: ReportData['criteria_scores'] }) {
  const slices = pieSlices(criteria, 0, 0, 10, 5);
  return (
    <View>
      {slices.map((x, i) => (
        <View key={i} style={s.legendRow}>
          <View style={[s.swatch, { backgroundColor: x.passed ? C.green : C.red }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.legendName}>{x.label}</Text>
            <Text style={s.legendMeta}>{x.score}/5  ·  {x.weight}% of grade</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Talk-to-listen, with the discovery sweet spot marked ON TOP of the bar. */
function TalkBar({ pct, width = 250 }: { pct: number; width?: number }) {
  const h = 14;
  const x35 = (35 / 100) * width;
  const x45 = (45 / 100) * width;
  const inBand = pct >= 35 && pct <= 45;
  return (
    <Svg width={width} height={h + 16}>
      <Rect x={0} y={0} width={width} height={h} rx={7} fill={C.track} />
      <Rect x={0} y={0} width={Math.max(3, (pct / 100) * width)} height={h} rx={7}
        fill={inBand ? C.green : C.indigo} />
      {/* Drawn last so the band stays visible where the bar covers it. */}
      <Rect x={x35} y={0} width={x45 - x35} height={h} fill={C.green} fillOpacity={0.22} />
      <Line x1={x35} y1={-1} x2={x35} y2={h + 1} stroke={C.green} strokeWidth={1} />
      <Line x1={x45} y1={-1} x2={x45} y2={h + 1} stroke={C.green} strokeWidth={1} />
      <Text x={0} y={h + 11} style={{ fontSize: 7 }} fill={C.ink}>{`You ${Math.round(pct)}%`}</Text>
      <Text x={(x35 + x45) / 2} y={h + 11} style={{ fontSize: 6.5 }} fill={C.green} textAnchor="middle">sweet spot</Text>
      <Text x={width} y={h + 11} style={{ fontSize: 7 }} fill={C.light} textAnchor="end">{`Customer ${100 - Math.round(pct)}%`}</Text>
    </Svg>
  );
}

/** Where the score came from, in points of the 100. */
function Contributions({ criteria, width = 250 }: { criteria: ReportData['criteria_scores']; width?: number }) {
  const onRubric = criteria.filter((c) => !c.off_rubric);
  const total = onRubric.reduce((n, c) => n + c.weight, 0);
  if (total <= 0) return null;
  const rows = weakestFirst(onRubric).map((c) => ({
    name: c.criterion_name,
    got: contribution(c, total),
    max: contribution({ ...c, score: 5 }, total),
    passed: c.passed ?? c.score >= CRITERION_PASS,
  }));
  const widest = Math.max(...rows.map((r) => r.max), 1);
  const rowH = 17;

  return (
    <Svg width={width} height={rows.length * rowH + 4}>
      {rows.map((r, i) => {
        const y = i * rowH;
        const full = width - 96;   // one shared scale; ragged tracks looked broken
        return (
          <G key={i}>
            <Text x={0} y={y + 7} style={{ fontSize: 7 }} fill={C.ink}>
              {r.name.length > 20 ? `${r.name.slice(0, 19)}…` : r.name}
            </Text>
            <Text x={width} y={y + 7} style={{ fontSize: 7 }} fill={r.passed ? C.slate : C.red} textAnchor="end">
              {`${r.got.toFixed(1)} / ${r.max.toFixed(1)} pts`}
            </Text>
            <Rect x={0} y={y + 10} width={full} height={5} rx={2.5} fill={C.track} />
            <Rect x={0} y={y + 10} width={Math.max(2, (r.got / widest) * full)} height={5} rx={2.5}
              fill={r.passed ? C.green : C.red} />
            {r.max < widest && (
              <Line x1={(r.max / widest) * full} y1={y + 8} x2={(r.max / widest) * full} y2={y + 17}
                stroke={C.slate} strokeWidth={0.8} />
            )}
          </G>
        );
      })}
    </Svg>
  );
}

export function ReportPDF({ data }: { data: ReportData }) {
  const ob = band(data.overall_score);
  const pass = data.passMark ?? 70;
  const passed = data.overall_score >= pass;
  const graded = weakestFirst(data.criteria_scores);
  const passedCount = data.criteria_scores.filter((c) => c.passed ?? c.score >= CRITERION_PASS).length;
  const mins = data.durationSec != null ? `${Math.floor(data.durationSec / 60)}m ${data.durationSec % 60}s` : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.bandTop} />
        <Text style={s.h1}>Session Report</Text>
        <Text style={s.sub}>{data.scenarioTitle}  ·  {data.language.toUpperCase()}  ·  {data.date}</Text>

        {/* Verdict: the number, and what it means, together. */}
        <View style={s.verdict}>
          <Donut score={data.overall_score} size={84} label="of 100" />
          <View style={s.verdictBody}>
            <Text style={[s.pill, { backgroundColor: ob.color }]}>{ob.label}</Text>
            <Text style={s.verdictLine}>
              {passed ? 'Passed.' : `${Math.max(1, Math.ceil(pass - data.overall_score))} points short of a pass.`}
            </Text>
            <Text style={s.verdictSub}>
              Pass mark {pass}. {passedCount} of {data.criteria_scores.length} criteria passed
              {mins ? ` · ${mins} spoken` : ''}
              {data.body_language_score != null ? ` · body language ${Math.round(data.body_language_score)}` : ''}
            </Text>
          </View>
          {data.body_language_score != null && <Donut score={data.body_language_score} size={64} label="body" />}
        </View>

        {/* The two charts that carry the analysis. */}
        <View style={s.row}>
          {data.criteria_scores.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Performance profile</Text>
              <View style={s.pieRow}>
                <RubricPie criteria={data.criteria_scores} />
                <View style={{ flex: 1 }}><PieLegend criteria={data.criteria_scores} /></View>
              </View>
              <Text style={{ fontSize: 7, color: C.light, marginTop: 4 }}>Slice width is the criterion&apos;s share of the grade.</Text>
            </View>
          )}
          {data.criteria_scores.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Where the score came from</Text>
              <Contributions criteria={data.criteria_scores} />
              <Text style={{ fontSize: 7, color: C.light, marginTop: 2 }}>All bars share one scale; the notch is each criterion&apos;s ceiling.</Text>
            </View>
          )}
        </View>

        {/* How they talked. */}
        {(data.talkRatio != null || data.questions != null || data.fillers != null) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>How you talked</Text>
            <Text style={s.sectionHint}>Measured from the transcript, not estimated.</Text>
            {data.talkRatio != null && <TalkBar pct={data.talkRatio} />}
            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={s.statLabel}>Questions asked</Text>
                <Text style={s.statVal}>{data.questions ?? '—'}</Text>
                <Text style={s.statHint}>discovery drives the score</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>Filler words</Text>
                <Text style={s.statVal}>{data.fillers ?? '—'}</Text>
                <Text style={s.statHint}>um, uh, like, you know</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>Talk / listen</Text>
                <Text style={s.statVal}>{data.talkRatio != null ? `${Math.round(data.talkRatio)}%` : '—'}</Text>
                <Text style={s.statHint}>35-45% is the sweet spot</Text>
              </View>
            </View>
          </View>
        )}

        <View style={s.row}>
          <View style={s.col}>
            <Text style={[s.cardTitle, { color: C.green }]}>What worked</Text>
            {data.strengths.map((t, i) => <Text key={i} style={s.li}>• {t}</Text>)}
          </View>
          <View style={s.col}>
            <Text style={[s.cardTitle, { color: C.amber }]}>What to fix next</Text>
            {data.improvements.map((t, i) => <Text key={i} style={s.li}>• {t}</Text>)}
          </View>
        </View>

        <Text style={s.footer} fixed>SpeakCoach · generated {data.date}</Text>
      </Page>

      {/* Detail on its own page: the grid above is the read, this is the evidence. */}
      {data.criteria_scores.length > 0 && (
        <Page size="A4" style={s.page}>
          <View style={s.bandTop} />
          <Text style={s.sectionTitle}>Graded against the rubric</Text>
          <Text style={s.sectionHint}>Weakest first. A criterion passes at 3 of 5.</Text>
          {graded.map((c, i) => {
            const ok = c.passed ?? c.score >= CRITERION_PASS;
            return (
              <View key={i} style={s.crit} wrap={false}>
                <View style={s.critHead}>
                  <Text style={s.critName}>{ok ? '' : '! '}{c.criterion_name}{c.off_rubric ? '  (extra)' : ''}</Text>
                  <Text style={[s.critMeta, ok ? {} : { color: C.red }]}>{c.score}/5  ·  {c.weight}% of grade</Text>
                </View>
                <Svg width={480} height={6}>
                  <Rect x={0} y={0} width={480} height={5} rx={2.5} fill={C.track} />
                  <Rect x={0} y={0} width={Math.max(3, (c.score / 5) * 480)} height={5} rx={2.5} fill={ok ? C.green : C.red} />
                  <Line x1={(CRITERION_PASS / 5) * 480} y1={-1} x2={(CRITERION_PASS / 5) * 480} y2={6} stroke={C.slate} strokeWidth={0.8} />
                </Svg>
                <Text style={s.just}>{c.justification}</Text>
              </View>
            );
          })}

          {data.body_language_feedback && data.body_language_score != null && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Body language</Text>
              <Text style={s.narrative}>{data.body_language_feedback}</Text>
            </View>
          )}

          {data.narrative_feedback && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Coach&apos;s notes</Text>
              <Text style={s.narrative}>{data.narrative_feedback}</Text>
            </View>
          )}

          <Text style={s.footer} fixed>SpeakCoach · {data.scenarioTitle}</Text>
        </Page>
      )}
    </Document>
  );
}
