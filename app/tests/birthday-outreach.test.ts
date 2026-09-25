import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Athlete, BirthdayGreeting } from '../src/types/domain'
import { BIRTHDAY_CARD_MESSAGE, BIRTHDAY_CARD_SIGNATURE, BIRTHDAY_CARD_TITLE } from '../src/utils/birthday-card-copy'
import { buildBirthdayQueue, safeBirthdayFilename } from '../src/utils/birthday-greetings'

const athlete = (id: string, birthDate: string, status: Athlete['status'] = 'active'): Athlete => ({
  id, profile: { name: `Atleta ${id}`, phone: '0000000000', birthDate }, membership: { schedule: 'Matutino', planId: 'plan', agreedAmount: 500, paymentDay: 5, registrationDate: '2026-01-01' }, status, createdAt: 1, updatedAt: 1,
})

test('ayer sigue pendiente y hoy/próximos se ordenan después', () => {
  const queue = buildBirthdayQueue([athlete('ayer', '2000-09-23'), athlete('hoy', '2000-09-24'), athlete('pronto', '2000-09-30')], [], '2026-09-24')

  assert.deepEqual(queue.map(item => item.status), ['overdue', 'today', 'upcoming'])
})

test('felicitado, baja y año anterior cerrado no aparecen', () => {
  const greeted = { id: 'activo_2026', athleteId: 'activo', year: 2026, status: 'greeted', lastEventId: 'event', createdAt: 1, updatedAt: 1 } as BirthdayGreeting
  const queue = buildBirthdayQueue([athlete('activo', '2000-09-24'), athlete('pausa', '2000-09-24', 'paused'), athlete('baja', '2000-09-24', 'inactive')], [greeted], '2026-09-24')

  assert.deepEqual(queue.map(item => item.athlete.id), ['pausa'])
})

test('29 de febrero se reconoce el 28 en año no bisiesto y el archivo es seguro', () => {
  const queue = buildBirthdayQueue([athlete('leap', '2000-02-29')], [], '2027-02-28')

  assert.equal(queue[0]?.status, 'today')
  assert.equal(safeBirthdayFilename('Ána / López'), 'feliz-cumpleanos-ana-lopez.png')
})

test('la tarjeta usa el mensaje oficial completo de Kronos', () => {
  assert.equal(BIRTHDAY_CARD_TITLE, '¡Feliz Cumple!')
  assert.equal(BIRTHDAY_CARD_MESSAGE, 'Que este nuevo año de vida venga cargado de tanta fuerza, constancia y disciplina como la que demuestras en cada entrenamiento. ¡A seguir rompiendo marcas y conquistando metas dentro y fuera de la pista!')
  assert.equal(BIRTHDAY_CARD_SIGNATURE, 'Con cariño, tu Kronos Family')
})
