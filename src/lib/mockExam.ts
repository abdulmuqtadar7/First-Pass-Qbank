import type { MockConfig, Question } from '../types/qbank'
import { selectSessionQuestions } from './sessionBuilder'

export const BLOCK_SIZE = 40
export const MOCK_PRESETS = [
  { name: 'Quick Mock', size: 40, minutes: 60 },
  { name: 'Standard Mock', size: 100, minutes: 150 },
  { name: 'Full-Length Mock', size: 200, minutes: 300 },
] as const
export interface MockState { block: number; phase: 'block' | 'break'; phaseStarted: number; examSeconds: number }
export const initialMockState = (): MockState => ({ block: 0, phase: 'block', phaseStarted: 0, examSeconds: 0 })
export function mockRange(total: number, block: number) {
  const start = block * BLOCK_SIZE, end = Math.min(total, start + BLOCK_SIZE)
  return { start, end, count: Math.ceil(total / BLOCK_SIZE) }
}
export function mockBlockSeconds(config: MockConfig, total: number, block: number) {
  const { start, end } = mockRange(total, block)
  return Math.floor(config.minutes * 60 * end / total) - Math.floor(config.minutes * 60 * start / total)
}
export function mockRemaining(config: MockConfig, total: number, state: MockState, elapsed: number) {
  const budget = state.phase === 'break' ? config.breakMinutes * 60 : mockBlockSeconds(config, total, state.block)
  return Math.max(0, budget - Math.max(0, elapsed - state.phaseStarted))
}
export function mockExamElapsed(config: MockConfig, total: number, state: MockState, elapsed: number) {
  return state.examSeconds + (state.phase === 'block' ? Math.min(mockBlockSeconds(config, total, state.block), Math.max(0, elapsed - state.phaseStarted)) : 0)
}
export function nextMockPhase(config: MockConfig, total: number, state: MockState, elapsed: number): MockState | null {
  if (state.phase === 'break') return { ...state, block: state.block + 1, phase: 'block', phaseStarted: elapsed }
  if (mockRange(total, state.block).end === total) return null
  const examSeconds = mockExamElapsed(config, total, state, elapsed)
  return config.breakMinutes > 0 ? { ...state, phase: 'break', phaseStarted: elapsed, examSeconds }
    : { block: state.block + 1, phase: 'block', phaseStarted: elapsed, examSeconds }
}
export function mockPool(questions: readonly Question[], systems: string[]) {
  return questions.filter(q => systems.includes(q.system.trim().toLowerCase()))
}
export function mockQueue(questions: readonly Question[], config: MockConfig): string[] {
  if (!Number.isInteger(config.size) || config.size < 1 || config.size > 200 || !Number.isInteger(config.minutes) || config.minutes < 1 || config.minutes > 600 || config.minutes * 60 < config.size || ![0,5].includes(config.breakMinutes)) return []
  // Random selection across distinct concepts; prefer Tier 1 representatives.
  const pool = selectSessionQuestions(mockPool(questions, config.systems), 'core_concepts', {})
  return pool.length >= config.size ? pool.slice(0, config.size).map(q => q.id) : []
}
