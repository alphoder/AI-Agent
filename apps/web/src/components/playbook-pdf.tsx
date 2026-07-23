import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface PlaybookData {
  academy: string;
  unitTitle: string;
  drills: string;
  learn: string;   // markdown-ish (** and \n)
  do: string[];
  dont: string[];
}

const s = StyleSheet.create({
  page: { padding: 44, fontFamily: 'Helvetica', fontSize: 11, color: '#18181b', lineHeight: 1.5 },
  brand: { fontSize: 9, color: '#6366f1', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sub: { fontSize: 10, color: '#71717a', marginBottom: 20 },
  para: { marginBottom: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  cols: { flexDirection: 'row', gap: 16, marginTop: 14 },
  col: { flex: 1, padding: 12, borderRadius: 6 },
  doCol: { backgroundColor: '#f0fdf4' },
  dontCol: { backgroundColor: '#fef2f2' },
  colTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  li: { marginBottom: 4, fontSize: 10 },
  foot: { position: 'absolute', bottom: 24, left: 44, right: 44, fontSize: 8, color: '#a1a1aa', borderTop: '1 solid #e4e4e7', paddingTop: 6 },
});

/** Strip our tiny markdown into plain runs (bold segments only). */
function runs(line: string) {
  return line.split(/(\*\*.+?\*\*)/g).filter(Boolean).map((seg, i) =>
    seg.startsWith('**')
      ? <Text key={i} style={s.bold}>{seg.slice(2, -2)}</Text>
      : <Text key={i}>{seg}</Text>);
}

/** The downloadable one-page playbook for a module — the Learn card + do/don't. */
export function PlaybookPDF({ data }: { data: PlaybookData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>{data.academy} · Playbook</Text>
        <Text style={s.h1}>{data.unitTitle}</Text>
        <Text style={s.sub}>{data.drills}</Text>
        {data.learn.split('\n\n').map((p, i) => (
          <Text key={i} style={s.para}>{p.split('\n').map((line, j) => <Text key={j}>{runs(line)}{'\n'}</Text>)}</Text>
        ))}
        <View style={s.cols}>
          <View style={[s.col, s.doCol]}>
            <Text style={[s.colTitle, { color: '#16a34a' }]}>Do</Text>
            {data.do.map((d, i) => <Text key={i} style={s.li}>• {d}</Text>)}
          </View>
          <View style={[s.col, s.dontCol]}>
            <Text style={[s.colTitle, { color: '#dc2626' }]}>Don&apos;t</Text>
            {data.dont.map((d, i) => <Text key={i} style={s.li}>• {d}</Text>)}
          </View>
        </View>
        <Text style={s.foot}>{data.academy} — powered by SpeakCoach live AI role-play.</Text>
      </Page>
    </Document>
  );
}
