import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface CertificateData {
  name: string;
  unitTitle: string;
  unitDrills: string;
  date: string;
}

const s = StyleSheet.create({
  page: { backgroundColor: '#0b0b0f', padding: 48, fontFamily: 'Helvetica', color: '#f4f4f5' },
  frame: { flex: 1, border: '2 solid #3b82f6', borderRadius: 12, padding: 40, justifyContent: 'center' },
  brand: { fontSize: 12, color: '#60a5fa', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 18 },
  title: { fontSize: 30, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  sub: { fontSize: 12, color: '#a1a1aa', marginBottom: 28 },
  name: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#93c5fd', marginBottom: 8 },
  unit: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  drills: { fontSize: 11, color: '#a1a1aa', marginBottom: 30 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #27272a', paddingTop: 12 },
  footText: { fontSize: 10, color: '#71717a' },
});

/** Unit-mastery certificate — issued when every lesson in a unit reaches silver. */
export function CertificatePDF({ data }: { data: CertificateData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <Text style={s.brand}>SpeakCoach · Certificate of Mastery</Text>
          <Text style={s.title}>This certifies that</Text>
          <Text style={s.name}>{data.name}</Text>
          <Text style={s.sub}>has demonstrated silver-or-better mastery across every lesson of</Text>
          <Text style={s.unit}>{data.unitTitle}</Text>
          <Text style={s.drills}>{data.unitDrills}</Text>
          <View style={s.foot}>
            <Text style={s.footText}>Issued {data.date}</Text>
            <Text style={s.footText}>Verified by live AI role-play scoring · speakcoach</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
