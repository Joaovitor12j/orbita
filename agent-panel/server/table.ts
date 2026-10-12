import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import { TABLE_SEATS, type TableState } from '../shared/types'
import { CONFIG_DIR } from './store'

const TABLE_FILE = path.join(CONFIG_DIR, 'table.json')
const SEAT_PATTERN = /^[^:\s]+:[a-z0-9][a-z0-9-]*$/

const empty = (): TableState => ({ seats: Array<string | null>(TABLE_SEATS).fill(null) })

export async function readTable(): Promise<TableState> {
  const raw = await fs.readFile(TABLE_FILE, 'utf8').catch(() => null)
  if (!raw) return empty()
  const parsed = JSON.parse(raw) as Partial<TableState>
  if (!Array.isArray(parsed.seats) || parsed.seats.length !== TABLE_SEATS) return empty()
  return { seats: parsed.seats.map((seat) => (typeof seat === 'string' ? seat : null)) }
}

export async function saveTable(input: TableState): Promise<TableState> {
  const seats = input?.seats
  if (!Array.isArray(seats) || seats.length !== TABLE_SEATS) {
    throw new HTTPException(400, { message: `A mesa precisa de exatamente ${TABLE_SEATS} cadeiras` })
  }
  const clean = seats.map((seat) => (typeof seat === 'string' && SEAT_PATTERN.test(seat) ? seat : null))
  const taken = clean.filter(Boolean)
  if (new Set(taken).size !== taken.length) throw new HTTPException(400, { message: 'Um agente não pode ocupar duas cadeiras' })

  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(TABLE_FILE, JSON.stringify({ seats: clean }, null, 2))
  return { seats: clean }
}
