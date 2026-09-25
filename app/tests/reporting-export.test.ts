import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReportingExportRows, downloadReportingCsv, reportingExportFilename, serializeReportingCsv, type ReportingExportRow } from '../src/utils/reporting-export'
import { buildAthleteReport } from '../src/utils/reporting-athletes'
import { buildMembershipReport } from '../src/utils/reporting-memberships'
import { buildInventoryReport } from '../src/utils/reporting-inventory'
import { buildWorkforceReport } from '../src/utils/reporting-workforce'
import { buildStoreReport } from '../src/utils/reporting-store'
import { buildFinanceReport } from '../src/utils/reporting-finance'
import { createReportingAthletesMembershipsQaFixture, reportingAthletesMembershipsQaFilters } from '../src/utils/reporting-athletes-memberships-qa-fixture'
import { createReportingInventoryWorkforceQaFixture, reportingInventoryWorkforceQaFilters } from '../src/utils/reporting-inventory-workforce-qa-fixture'
import { createReportingFinanceQaFixture, reportingFinanceQaFilters } from '../src/utils/reporting-finance-qa-fixture'

const emptyRow = (overrides: Partial<ReportingExportRow> = {}): ReportingExportRow => ({
  schemaVersion: '1',
  recordType: 'detail',
  section: 'Tienda',
  key: 'row',
  label: '',
  date: '',
  sourceType: '',
  sourceId: '',
  category: '',
  status: '',
  method: '',
  account: '',
  unit: 'currency',
  value: null,
  secondaryValue: null,
  quality: '',
  filters: '',
  ...overrides,
})

test('serializa CSV UTF-8 estable, escapa texto y neutraliza fórmulas', () => {
  const csv = serializeReportingCsv([
    emptyRow({ key: 'safe', label: 'Bebida, "grande"\nfría', value: 12.5 }),
    emptyRow({ key: 'formula', label: '=HYPERLINK("https://invalid.test")', sourceId: '+SUM(1,1)' }),
  ])

  assert.equal(csv.charCodeAt(0), 0xFEFF)
  assert.match(csv, /schema_version,record_type,section/)
  assert.match(csv, /"Bebida, ""grande""\nfría"/)
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/invalid\.test""\)"/)
  assert.match(csv, /"'\+SUM\(1,1\)"/)
  assert.match(csv, /,12\.5,,/)
  assert.ok(csv.includes('\r\n'))
})

test('proyecta todas las secciones allowlisted y conserva nulos, calidad y filtros', () => {
  const athleteFixture = createReportingAthletesMembershipsQaFixture()
  const athleteFilters = reportingAthletesMembershipsQaFilters()
  const operationsFixture = createReportingInventoryWorkforceQaFixture()
  const operationsFilters = reportingInventoryWorkforceQaFilters()
  const financeFixture = createReportingFinanceQaFixture()
  const filters = reportingFinanceQaFilters()

  const rows = buildReportingExportRows({
    generatedAt: '2026-12-31T18:00:00.000Z',
    filters,
    loadedSources: ['athletes', 'memberships', 'inventory', 'workforce', 'store', 'visit-payments', 'expenses', 'cash-closures'],
    athletes: buildAthleteReport(athleteFixture.athletes, athleteFilters),
    memberships: buildMembershipReport(athleteFixture.payments, athleteFilters),
    inventory: buildInventoryReport(operationsFixture.inventoryClosures, operationsFixture.inventoryResolutions, operationsFilters),
    workforce: buildWorkforceReport(operationsFixture.workEntries, operationsFixture.payrollSettlements, operationsFilters),
    store: buildStoreReport(financeFixture.sales, filters),
    finance: buildFinanceReport({
      sales: financeFixture.sales,
      membershipPayments: financeFixture.payments,
      visitPayments: financeFixture.visitPayments,
      expenses: financeFixture.expenses,
      cashClosures: financeFixture.cashClosures,
      inventoryRecoveries: financeFixture.inventoryResolutions,
    }, filters),
  })

  const sections = new Set(rows.map(row => row.section))

  assert.deepEqual([...sections].sort(), ['Atletas', 'Conciliación', 'Finanzas', 'Inventario', 'Mensualidades', 'Metadata', 'Personal', 'Tienda'].sort())
  assert.equal(rows.find(row => row.section === 'Finanzas' && row.key === 'recognizedStoreRevenue')?.value, 120)
  assert.equal(rows.find(row => row.section === 'Finanzas' && row.key === 'cashFlow')?.value, 100)
  assert.equal(rows.find(row => row.section === 'Conciliación' && row.key === 'cashVariance')?.value, -5)
  assert.equal(rows.find(row => row.key === 'athleteRetention')?.value, null)
  assert.equal(rows.find(row => row.key === 'athleteRetention')?.quality, 'unavailable')
  assert.ok(rows.every(row => row.filters.includes('2026-12-01') && row.filters.includes('2026-12-31')))

  const serialized = JSON.stringify(rows)

  assert.doesNotMatch(serialized, /phone|health|intake|receipt|registeredBy|closedBy|notes|description/i)
})

test('genera un nombre determinista a partir del periodo', () => {
  assert.equal(reportingExportFilename(reportingFinanceQaFilters()), 'kronos-reportes_2026-12-01_2026-12-31.csv')
})

test('descarga mediante URL temporal y siempre la revoca', () => {
  const events: string[] = []

  downloadReportingCsv('contenido', 'reporte.csv', {
    makeBlob: content => ({ content }),
    createObjectUrl: () => 'blob:qa-report',
    clickDownload: (url, filename) => events.push(`click:${url}:${filename}`),
    revokeObjectUrl: url => events.push(`revoke:${url}`),
  })

  assert.deepEqual(events, ['click:blob:qa-report:reporte.csv', 'revoke:blob:qa-report'])
})
