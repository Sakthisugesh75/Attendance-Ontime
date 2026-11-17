import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatValue, isNumeric } from "./definitions";
import type { ReportColumn, ReportRow } from "./types";
import type { ExportHeader } from "./xlsx";

const INK = "#17171a";
const MUTED = "#6b685f";
const LINE = "#e2ded3";
const ZEBRA = "#f7f5ef";

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 28, fontSize: 8, fontFamily: "Helvetica", color: INK },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: INK },
  company: { fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, textTransform: "uppercase", color: MUTED },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 3 },
  meta: { fontSize: 8, color: MUTED, textAlign: "right", lineHeight: 1.5 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingVertical: 5 },
  headCell: { fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingHorizontal: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4 },
  cell: { paddingHorizontal: 3 },
  total: { flexDirection: "row", borderTopWidth: 1, borderTopColor: INK, paddingVertical: 5, fontFamily: "Helvetica-Bold" },
  empty: { paddingVertical: 24, textAlign: "center", color: MUTED },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: MUTED },
});

/** Relative column widths by kind (names and remarks get more room). */
function weight(c: ReportColumn): number {
  if (c.key === "name") return 2.4;
  if (c.key === "remarks" || c.key === "kind" || c.key === "type") return 2;
  if (c.key === "department") return 1.6;
  switch (c.kind) {
    case "date":
      return 1.4;
    case "clock":
    case "duration":
      return 1.15;
    case "code":
      return 0.95;
    case "text":
      return 1.3;
    default:
      return 0.85;
  }
}

function ReportPdf({ h, columns, rows, totals }: { h: ExportHeader; columns: ReportColumn[]; rows: ReportRow[]; totals: ReportRow | null }) {
  const sum = columns.reduce((t, c) => t + weight(c), 0);
  const width = (c: ReportColumn) => `${((weight(c) / sum) * 100).toFixed(3)}%`;
  const align = (c: ReportColumn) => (isNumeric(c.kind) ? ("right" as const) : ("left" as const));

  return (
    <Document title={`${h.title} · ${h.period}`} author={h.company} creator={h.company}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.top} fixed>
          <View>
            <Text style={s.company}>{h.company}</Text>
            <Text style={s.title}>{h.title}</Text>
          </View>
          <View>
            <Text style={s.meta}>Period: {h.period}</Text>
            <Text style={s.meta}>Generated {h.generatedAt}</Text>
          </View>
        </View>

        <View style={s.head} fixed>
          {columns.map((c) => (
            <Text key={c.key} style={[s.headCell, { width: width(c), textAlign: align(c) }]}>
              {c.label}
            </Text>
          ))}
        </View>

        {rows.length === 0 && <Text style={s.empty}>Nothing to report for this period.</Text>}
        {rows.map((r, i) => (
          <View key={i} style={[s.row, i % 2 ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
            {columns.map((c) => (
              <Text key={c.key} style={[s.cell, { width: width(c), textAlign: align(c) }]}>
                {formatValue(c.kind, r[c.key] ?? null, c.key)}
              </Text>
            ))}
          </View>
        ))}
        {totals && rows.length > 0 && (
          <View style={s.total} wrap={false}>
            {columns.map((c, i) => (
              <Text key={c.key} style={[s.cell, { width: width(c), textAlign: align(c) }]}>
                {i === 0 ? "Total" : totals[c.key] === undefined ? "" : formatValue(c.kind, totals[c.key] ?? null, c.key)}
              </Text>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            {h.company} · {h.title} · {h.period}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** A4 landscape PDF of a report table. */
export function reportPdf(h: ExportHeader, columns: ReportColumn[], rows: ReportRow[], totals: ReportRow | null): Promise<Buffer> {
  return renderToBuffer(<ReportPdf h={h} columns={columns} rows={rows} totals={totals} />);
}
